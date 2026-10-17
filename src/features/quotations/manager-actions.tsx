import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Notice } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import type { QuoteResponse } from './contracts';
import { quotationKeys, useQuotation } from './hooks';
import { quoteMutationsApi, type QuoteAction, type QuoteActionCommand } from './mutations';
import { QuotationDetailPage } from './pages';
import { refreshPreparationCase } from './source';

type ManagerAction = Exclude<QuoteAction, 'ACCEPT'>;

const actionText: Record<ManagerAction, { label: string; confirm: string; done: string }> = {
  APPROVE: {
    label: 'Approve',
    confirm: 'Approve this draft. It is not sent to the customer until you issue it separately.',
    done: 'approved',
  },
  ISSUE: {
    label: 'Issue to customer',
    confirm: 'Issue this approved version so the customer can accept or reject it.',
    done: 'issued',
  },
  REJECT: {
    label: 'Reject',
    confirm: 'Reject this version. Prepare a new version to continue.',
    done: 'rejected',
  },
  EXPIRE: {
    label: 'Mark as expired',
    confirm: 'Its validity has passed. Record it as expired.',
    done: 'marked as expired',
  },
};

const actionHelp: Record<string, string> = {
  QUOTE_PRICING_PENDING:
    'Some prices are still pending. Resolve the sources and prepare a new version.',
  QUOTE_PRICING_CHANGED: 'A pricing source changed. Prepare a new version instead.',
  QUOTE_PRICING_INVALID: 'The captured prices are no longer valid. Prepare a new version.',
  QUOTE_SCHEDULE_INVALID: 'The payment schedule does not match the total. Prepare a new version.',
  QUOTE_EXPIRED: 'This quotation has expired. Mark it as expired or prepare a new version.',
  QUOTE_STATE_CONFLICT: 'The quotation changed state. Review its current status.',
  ORDER_VERSION_CONFLICT: 'The request changed. Review the current quotation before acting.',
  QUOTE_REVISION_CONFLICT: 'The request has a newer revision. Prepare a new version for it.',
  QUOTE_RETRY_CONFLICT: 'This operation identifier belongs to different input. Refresh and review.',
  QUOTE_SCHEMA_PENDING:
    'Quotations are not deployed on this server yet (migration 005 is pending).',
};

/**
 * Re-renders when the quotation's validity elapses (exact deadline, plus on
 * focus/visibility) so an open confirmation cannot outlive it unnoticed.
 */
function useValidityClock(validUntil: string) {
  const [now, setNow] = useState(() => Date.now());
  const deadline = Date.parse(validUntil);
  useEffect(() => {
    const update = () => setNow(Date.now());
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    const wait = deadline - Date.now() + 1;
    const timer =
      Number.isFinite(deadline) && wait > 0
        ? setTimeout(update, Math.min(wait, 2_147_483_647))
        : undefined;
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [deadline]);
  return now;
}

/** Actions the BE allows a Manager for this status; the server still decides. */
export function managerActions(quotation: QuoteResponse, now: number): ManagerAction[] {
  const { status, validUntil } = quotation.quote;
  const elapsed = Date.parse(validUntil) <= now;
  if (['DRAFT', 'APPROVED', 'ISSUED'].includes(status) && elapsed) return ['EXPIRE'];
  if (status === 'DRAFT') return ['APPROVE', 'REJECT'];
  if (status === 'APPROVED') return ['ISSUE', 'REJECT'];
  return [];
}

const pricedOut = (q: QuoteResponse) => q.quote.total === null || q.blockers.length > 0;

/** What the Manager reviewed when opening the confirmation. Confirm sends exactly this. */
export type ManagerReview = {
  orderId: number;
  quoteId: number;
  action: ManagerAction;
  quotation: QuoteResponse;
};

/** Fields whose change means the Manager must look again before confirming. */
const reviewedState = (q: QuoteResponse) =>
  JSON.stringify([
    q.recordVersion.toLowerCase(),
    q.quote.quoteId,
    q.quote.revisionId,
    q.quote.version,
    q.quote.status,
    q.quote.total,
    q.quote.validUntil,
    q.blockers,
  ]);

/** Why the reviewed action can no longer be confirmed, or null when it still can. */
export function reviewProblem(review: ManagerReview, current: QuoteResponse, now: number) {
  if (reviewedState(review.quotation) !== reviewedState(current))
    return 'This quotation changed since you opened this confirmation. Close it and review the current version before acting.';
  if (!managerActions(current, now).includes(review.action))
    return review.action === 'EXPIRE'
      ? 'This action is no longer available. Close it and review the current status.'
      : 'This quotation reached its validity deadline while the confirmation was open. Close it and mark it as expired instead.';
  if (review.action === 'APPROVE' && pricedOut(current))
    return 'This draft has pending prices or blockers and cannot be approved.';
  return null;
}

export function ManagerQuoteActions({
  orderId,
  quotation,
  fetching,
}: {
  orderId: number;
  quotation: QuoteResponse;
  /** A background read is in flight: its result may change what was reviewed. */
  fetching: boolean;
}) {
  const session = useSession()!;
  const now = useValidityClock(quotation.quote.validUntil);
  const [review, setReview] = useState<ManagerReview | null>(null);
  const [done, setDone] = useState('');
  const quoteId = quotation.quote.quoteId;
  // The panel is keyed by session/order/quote, so the endpoint is fixed for its lifetime.
  const command = useCaseCommand((body: QuoteActionCommand) =>
    quoteMutationsApi.act(orderId, quoteId, body),
  );
  const code = command.error instanceof ApiError ? command.error.code : undefined;
  const actions = managerActions(quotation, now);
  const problem = review ? reviewProblem(review, quotation, now) : null;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: quotationKeys.all(session.generation) }),
      refreshPreparationCase(session.generation, orderId),
    ]);
  }
  async function reviewAgain() {
    // An uncertain command keeps its identity; only a definite outcome may be dismissed.
    if (command.frozen) return refresh();
    command.reset();
    setReview(null);
    await refresh();
  }
  function open(action: ManagerAction) {
    setDone('');
    command.reset();
    setReview({ orderId, quoteId, action, quotation });
  }
  function confirm() {
    if (!review || command.pending) return;
    command.submit(
      () => {
        // Checked again at the moment of confirmation; never upgraded to newer data.
        if (fetching || reviewProblem(review, quotation, Date.now())) return null;
        return { recordVersion: review.quotation.recordVersion, action: review.action };
      },
      async (receipt) => {
        setReview(null);
        setDone(
          `Quotation ${receipt.quote.quoteNumber} ${actionText[review.action].done}. Current status is shown above.`,
        );
        // The receipt may be a replay: always re-read the current state.
        await refresh();
      },
    );
  }
  const reviewed = review?.quotation;
  return (
    <section className="card" aria-labelledby="manager-actions-heading">
      <h2 id="manager-actions-heading">Manager actions</h2>
      {done && <Notice>{done}</Notice>}
      {actions.length === 0 ? (
        <p>
          No Manager action is available for a {quotation.quote.status.toLowerCase()} quotation.
          {quotation.quote.status === 'ISSUED' && ' The customer accepts or rejects it.'}
        </p>
      ) : (
        <>
          {actions.includes('APPROVE') && pricedOut(quotation) && (
            <p className="field-error" role="alert">
              This draft has pending prices or blockers and cannot be approved. Resolve the sources
              and prepare a new version.
            </p>
          )}
          <div className="actions">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                disabled={
                  command.locked || fetching || (action === 'APPROVE' && pricedOut(quotation))
                }
                aria-pressed={review?.action === action}
                onClick={() => open(action)}
              >
                {actionText[action].label}
              </button>
            ))}
          </div>
        </>
      )}
      {review && reviewed && (
        <div
          className="notice"
          role="dialog"
          aria-label={`Confirm ${actionText[review.action].label}`}
        >
          <p>
            <strong>
              {actionText[review.action].label}: {reviewed.quote.quoteNumber}, version{' '}
              {reviewed.quote.version}, revision ID {reviewed.quote.revisionId}
            </strong>
          </p>
          <p>{actionText[review.action].confirm}</p>
          <p className="muted">
            Total {reviewed.quote.total ?? 'not available'} {reviewed.currency}; valid until{' '}
            {displayDate(reviewed.quote.validUntil)}.
          </p>
          {problem && !command.frozen && (
            <p className="field-error" role="alert">
              {problem}
            </p>
          )}
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={command.pending || (!command.frozen && (!!problem || fetching))}
              onClick={confirm}
            >
              {command.pending
                ? 'Sending…'
                : command.frozen
                  ? 'Retry the same action'
                  : `Confirm ${actionText[review.action].label.toLowerCase()}`}
            </button>
            <button type="button" disabled={command.locked} onClick={() => void reviewAgain()}>
              {problem ? 'Close and review again' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
      <ErrorNotice error={command.error}>
        {code && actionHelp[code] && <p>{actionHelp[code]}</p>}
        {command.frozen && (
          <p>
            The result is uncertain. Retry sends the same action, identifier and version, so it
            cannot be applied twice.
          </p>
        )}
        {command.conflict && !command.frozen && (
          <button type="button" onClick={() => void reviewAgain()}>
            Refresh quotation
          </button>
        )}
      </ErrorNotice>
    </section>
  );
}

/** Manager detail: Dev1's shared detail page plus the Manager action panel. */
export function ManagerQuotationDetailPage() {
  const params = useParams();
  const session = useSession();
  const orderId = Number(params.id);
  const query = useQuotation(orderId, Number(params.quoteId));
  return (
    <>
      <QuotationDetailPage />
      {session?.role === 'MANAGER' && query.data && !query.error && (
        <ManagerQuoteActions
          key={`${session.generation}/${orderId}/${query.data.quote.quoteId}`}
          orderId={orderId}
          quotation={query.data}
          fetching={query.isFetching}
        />
      )}
    </>
  );
}
