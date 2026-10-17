import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { idSchema, type Order } from '../../shared/api/contracts';
import { queryClient, queryKeys } from '../../shared/api/query';
import { getSession, useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { Loading, Notice } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { ordersApi } from '../transport-orders/api';
import type { QuoteResponse } from './contracts';
import { useQuotationClock } from './clock';
import { quotationKeys, useQuotation } from './hooks';
import { quoteMutationsApi, type QuoteActionCommand } from './mutations';
import { QuotationDetailPage, QuotationError } from './pages';

type CustomerAction = 'ACCEPT' | 'REJECT';
const labels: Record<CustomerAction, string> = { ACCEPT: 'Accept', REJECT: 'Reject' };

// The authenticated order read establishes ownership. BE rechecks it under lock.
export function canRespondToQuotation(
  order: Order | undefined,
  quotation: QuoteResponse | undefined,
  now: number,
) {
  return !!(
    order &&
    quotation &&
    order.orderStatus === 'APPROVED' &&
    order.currentRevisionId === quotation.quote.revisionId &&
    order.recordVersion.toLowerCase() === quotation.recordVersion.toLowerCase() &&
    quotation.quote.status === 'ISSUED' &&
    quotation.issuedAt !== null &&
    Date.parse(quotation.quote.validUntil) > now &&
    quotation.quote.total !== null &&
    quotation.blockers.length === 0
  );
}

const actionErrors: Record<string, string> = {
  QUOTE_EXPIRED: 'This quotation has expired. Refresh and review the available versions.',
  QUOTE_REVISION_CONFLICT: 'The request revision changed. Refresh and review before deciding.',
  ORDER_VERSION_CONFLICT: 'The request changed. Refresh and review before deciding.',
  QUOTE_STATE_CONFLICT: 'This quotation changed state. Refresh and review its current status.',
  QUOTE_ORDER_PROTECTED: 'Another commitment protects this request. Refresh and review it.',
  QUOTE_RETRY_CONFLICT: 'This operation identifier belongs to different input. Refresh and review.',
  QUOTE_SCHEMA_PENDING: 'The quotation service has not been deployed. Contact the project team.',
};

const accessFailure = (error: unknown) =>
  error instanceof ApiError && [401, 403, 404].includes(error.status);

export function CustomerQuotationDetailPage() {
  const params = useParams();
  const session = useSession();
  const orderId = Number(params.id);
  const quoteId = Number(params.quoteId);
  if (!session) return null;
  if (session.role !== 'CUSTOMER') return <Notice>Only the owning customer can respond.</Notice>;
  if (!idSchema.safeParse(orderId).success || !idSchema.safeParse(quoteId).success)
    return <Notice>This quotation is unavailable.</Notice>;
  return (
    <CustomerQuotationSession
      key={`${session.generation}/${orderId}/${quoteId}`}
      generation={session.generation}
      orderId={orderId}
      quoteId={quoteId}
    />
  );
}

function CustomerQuotationSession({
  generation,
  orderId,
  quoteId,
}: {
  generation: string;
  orderId: number;
  quoteId: number;
}) {
  const quotation = useQuotation(orderId, quoteId);
  const order = useQuery({
    queryKey: queryKeys.order(generation, orderId),
    queryFn: ({ signal }) => ordersApi.get(orderId, signal),
    retry: false,
  });
  const now = useQuotationClock(quotation.data ? [quotation.data.quote] : []);
  const [selected, setSelected] = useState<CustomerAction | null>(null);
  const [reviewQuote, setReviewQuote] = useState<QuoteResponse | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && getSession()?.generation === generation;
  const command = useCaseCommand((body: QuoteActionCommand) =>
    quoteMutationsApi.act(orderId, quoteId, body),
  );
  const hiddenError = [command.error, order.error, quotation.error].find(accessFailure);
  const hiddenQuote =
    quotation.data &&
    (quotation.data.issuedAt === null ||
      ['DRAFT', 'APPROVED', 'SUPERSEDED'].includes(quotation.data.quote.status));
  const eligible =
    !order.error && !quotation.error && canRespondToQuotation(order.data, quotation.data, now);
  const confirmationEligible =
    eligible && canRespondToQuotation(order.data, reviewQuote ?? undefined, now);

  async function refresh(afterSuccess = false) {
    if (!active()) return;
    setRefreshing(true);
    setRefreshError(false);
    try {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: quotationKeys.order(generation, 'CUSTOMER', orderId),
          refetchType: 'none',
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.orders(generation),
          refetchType: 'none',
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.services(generation, orderId),
          refetchType: 'none',
        }),
      ]);
      await Promise.all([
        quotation.refetch({ throwOnError: true }),
        order.refetch({ throwOnError: true }),
      ]);
      if (!active()) return;
      if (!command.frozen && !afterSuccess) {
        command.reset();
        setNeedsReview(false);
        setRecorded(false);
        setSelected(null);
        setReviewQuote(null);
        setReviewed(false);
      }
    } catch {
      if (active()) setRefreshError(true);
    } finally {
      if (active()) setRefreshing(false);
    }
  }

  function submit() {
    if (!selected || command.pending || refreshing) return;
    command.submit(
      () => {
        // Check again at confirmation, including an elapsed deadline in an open dialog.
        if (
          !reviewed ||
          needsReview ||
          recorded ||
          order.error ||
          quotation.error ||
          !canRespondToQuotation(order.data, reviewQuote ?? undefined, Date.now()) ||
          !canRespondToQuotation(order.data, quotation.data, Date.now())
        )
          return null;
        setNeedsReview(true);
        return { recordVersion: reviewQuote!.recordVersion, action: selected };
      },
      async () => {
        if (!active()) return;
        setSelected(null);
        setReviewQuote(null);
        setReviewed(false);
        setRecorded(true);
        // Historical replay receipts are not current state. Never cache them as detail.
        await refresh(true);
      },
    );
  }

  return (
    <>
      <QuotationDetailPage error={hiddenError} />
      {!hiddenError && !hiddenQuote && (
        <section className="card" aria-labelledby="customer-response-heading">
          <h2 id="customer-response-heading">Your response</h2>
          <p>
            Review the captured prices, units, total, validity, terms, cancellation terms and
            payment schedule above before deciding. Opening this page records no decision.
          </p>
          {recorded && (
            <Notice>
              Your response was recorded. The current status and accepted date are shown above after
              refresh. This does not confirm payment, flight space or permission to depart.
            </Notice>
          )}
          {!!command.error && (
            <div className="notice error" role="alert">
              {command.error instanceof ApiError &&
                command.error.code &&
                actionErrors[command.error.code] && <p>{actionErrors[command.error.code]}</p>}
              <p>
                {command.frozen
                  ? 'The result is uncertain. Retry the same response to resolve it; its identifier and original version will be preserved.'
                  : 'Your response could not be recorded. Refresh and review before making another decision.'}
              </p>
            </div>
          )}
          {refreshError && (
            <Notice>
              Current state could not be refreshed. Do not assume acceptance. Try refreshing again.
            </Notice>
          )}
          {order.isPending && <Loading />}
          {order.error && !accessFailure(order.error) && (
            <QuotationError error={order.error} retry={() => void refresh()} />
          )}
          {!eligible && !order.isPending && !command.frozen && (
            <p>
              No response is available. A quotation must be issued, still valid and match this
              request's current approved revision and version.
            </p>
          )}
          {eligible && !needsReview && !recorded && (
            <div className="actions">
              {(['ACCEPT', 'REJECT'] as const).map((action) => (
                <button
                  type="button"
                  key={action}
                  disabled={
                    command.locked || refreshing || order.isFetching || quotation.isFetching
                  }
                  onClick={() => {
                    setSelected(action);
                    setReviewQuote(quotation.data!);
                    setReviewed(false);
                  }}
                >
                  {labels[action]} quotation
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div
              className="notice"
              role="dialog"
              aria-label={`Confirm ${labels[selected].toLowerCase()} quotation`}
            >
              <p>
                <strong>
                  {labels[selected]} {reviewQuote?.quote.quoteNumber}, version{' '}
                  {reviewQuote?.quote.version}?
                </strong>
              </p>
              {!confirmationEligible && !command.frozen && (
                <p>
                  This quotation or request changed or expired. Refresh and review before
                  confirming.
                </p>
              )}
              <p>
                Total {reviewQuote?.quote.total ?? 'Pending'} {reviewQuote?.currency}; valid until{' '}
                {displayDate(reviewQuote?.quote.validUntil ?? null)}.
              </p>
              <p>
                {selected === 'ACCEPT'
                  ? 'Acceptance records your agreement to this quotation and its terms. It does not make a payment, reserve flight space or authorize departure.'
                  : 'Rejection declines this quotation. No payment or booking will be made.'}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={command.locked || needsReview}
                  onChange={(e) => setReviewed(e.target.checked)}
                />{' '}
                I have reviewed the prices, terms, cancellation terms and payment schedule.
              </label>
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  onClick={submit}
                  disabled={
                    command.pending ||
                    refreshing ||
                    (!command.frozen &&
                      (!confirmationEligible ||
                        !reviewed ||
                        needsReview ||
                        recorded ||
                        order.isFetching ||
                        quotation.isFetching))
                  }
                >
                  {command.pending
                    ? 'Sending response...'
                    : command.frozen
                      ? 'Retry the same response'
                      : `Confirm ${labels[selected].toLowerCase()}`}
                </button>
                <button
                  type="button"
                  disabled={command.locked}
                  onClick={() => {
                    setSelected(null);
                    setReviewQuote(null);
                    setReviewed(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={command.pending || refreshing}
            onClick={() => void refresh()}
          >
            {refreshing ? 'Refreshing...' : 'Refresh and review quotation'}
          </button>
        </section>
      )}
    </>
  );
}
