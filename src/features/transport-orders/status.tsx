import { LoadedOrderFilter } from '../../components/ui/LoadedOrderFilter';
import { CodeChip } from '../../components/ui/Primitives';
import { OrderLifecycle } from '../../components/ui/OrderLifecycle';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import type { Order } from '../../shared/api/contracts';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice, PageHeading, Pagination } from '../../shared/ui/common';
import { ordersApi } from './api';
import { BookingServices } from '../booking-services/BookingServices';
import { OrderEditor } from './pages';
import { RevisionsSection } from './revisions';
import { QuotationLink } from '../quotations/navigation';
import { ComplianceLink } from '../compliance/link';
import { ExecutionLink } from '../execution/ExecutionPage';
import { OrderTimeline } from '../activity-operations/OrderTimeline';
import { SettlementPreviewLink } from '../settlement/navigation';
import { OrderWorkflowBanner } from '../workflow/OrderWorkflowBanner';

import { PaymentLink } from '../payments/pages';
import { orderStatusApi } from './status-api';
import { orderStatusLabels, type CustomerAssessment } from './status-contracts';
import './status.css';

// Both keys sit under queryKeys.orders, so the draft editor's invalidation
// after save/submit also refreshes the list and the assessment.
export const orderStatusKeys = {
  list: (generation: string, page: number) =>
    [...queryKeys.orders(generation), 'list', { page }] as const,
  assessment: (generation: string, id: number) =>
    [...queryKeys.order(generation, id), 'assessment'] as const,
};

function parsePage(value: string | null) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 0 ? page : 0;
}

function route(order: Order) {
  const { originCountryCode, destinationCountryCode } = order.draft;
  return originCountryCode || destinationCountryCode
    ? `${originCountryCode || '—'} → ${destinationCountryCode || '—'}`
    : 'Route not recorded';
}

export function RequestsPage() {
  const [params, setParams] = useSearchParams();
  const page = parsePage(params.get('page'));
  const session = useSession()!;
  const query = useQuery({
    queryKey: orderStatusKeys.list(session.generation, page),
    queryFn: ({ signal }) => orderStatusApi.list(page, signal),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeading title="Transport Requests" description="Your drafts and submitted requests.">
        <Link className="button primary" to="/customer/requests/new">
          New Request
        </Link>
      </PageHeading>
      <section className="card">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorNotice error={query.error}>
            <button type="button" onClick={() => void query.refetch()}>
              Try again
            </button>
          </ErrorNotice>
        ) : !query.data.items.length ? (
          <div className="empty">
            <h2>No transport requests yet</h2>
            <p>Start a request for one of your horses. Drafts are saved here.</p>
          </div>
        ) : (
          <LoadedOrderFilter items={query.data.items}>
            {(filtered) => (
              <div className="table-scroll" aria-busy={query.isPlaceholderData}>
                <table aria-label={`Your transport requests: ${query.data.totalElements} in total`}>
                  <thead>
                    <tr>
                      <th scope="col">Request</th>
                      <th scope="col">Route</th>
                      <th scope="col">Delivery deadline</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => (
                      <tr key={o.orderId}>
                        <td>
                          <CodeChip value={o.orderNumber} to={`/customer/requests/${o.orderId}`} />
                        </td>
                        <td>{route(o)}</td>
                        <td>
                          {displayDate(
                            o.draft.deliveryDeadline,
                            o.draft.destinationTimezone || undefined,
                          )}
                        </td>
                        <td>
                          <StatusBadge status={o.orderStatus}>
                            {orderStatusLabels[o.orderStatus]}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </LoadedOrderFilter>
        )}
        {query.data && (query.data.totalPages > 1 || page > 0) && (
          <Pagination
            page={page}
            pages={query.data.totalPages}
            onChange={(next) => setParams({ page: String(next) })}
            pending={query.isFetching}
          />
        )}
      </section>
    </>
  );
}

const outcomeCopy: Record<NonNullable<CustomerAssessment['decision']>, [string, string]> = {
  APPROVED: [
    'Approved for preparation',
    'Our team has started preparing your request. This is not a quote, payment, document clearance, flight space or departure confirmation.',
  ],
  CHANGES_REQUESTED: [
    'Changes requested',
    'Please review the reason below before updating your request.',
  ],
  REJECTED: ['Request not accepted', 'The reason from our team is shown below.'],
};

/**
 * Public assessment outcome for the order's current submitted revision.
 * Shows only decision + public reason; staff and internal notes are never
 * part of this endpoint.
 */
export function AssessmentPanel({ order }: { order: Order }) {
  const session = useSession()!;
  const revisionId = order.currentRevisionId;
  const query = useQuery({
    queryKey: orderStatusKeys.assessment(session.generation, order.orderId),
    queryFn: ({ signal }) => orderStatusApi.assessment(order.orderId, signal),
    enabled: revisionId !== null,
  });
  if (revisionId === null) return null;
  return (
    <section className="card" aria-labelledby="assessment-heading">
      <h2 id="assessment-heading">Assessment</h2>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error}>
          <button type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </ErrorNotice>
      ) : query.data.currentRevisionId !== revisionId ? (
        // Request changed between the two reads; never show another revision's outcome.
        <Notice>
          This request was updated while loading.{' '}
          <button
            type="button"
            onClick={() =>
              void queryClient.invalidateQueries({
                queryKey: queryKeys.order(session.generation, order.orderId),
              })
            }
          >
            Refresh request
          </button>
        </Notice>
      ) : query.data.decision === null ? (
        <>
          <p>
            <span className="badge">Awaiting assessment</span>
          </p>
          <p>Your submitted request is waiting for review by our team.</p>
        </>
      ) : (
        <>
          <p>
            <StatusBadge status={query.data.decision}>
              {outcomeCopy[query.data.decision][0]}
            </StatusBadge>
          </p>
          <p>{outcomeCopy[query.data.decision][1]}</p>
          {query.data.reason && (
            <blockquote className="assessment-reason">{query.data.reason}</blockquote>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Wraps FE1's OrderPage (unchanged) with the assessment outcome. Shares the
 * same order query key, so TanStack serves both from one request.
 */
export function RequestDetailPage() {
  const id = Number(useParams().id);
  const session = useSession()!;
  const valid = Number.isSafeInteger(id) && id > 0;
  const query = useQuery({
    queryKey: queryKeys.order(session.generation, id),
    queryFn: ({ signal }) => ordersApi.get(id, signal),
    enabled: valid,
  });
  if (!valid) return <Notice>This request is unavailable.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  return (
    <>
      <OrderWorkflowBanner status={query.data.orderStatus} role="CUSTOMER" />
      <OrderLifecycle status={query.data.orderStatus} />
      <AssessmentPanel order={query.data} />
      <div className="actions">
        <QuotationLink orderId={query.data.orderId} />
        <ComplianceLink orderId={query.data.orderId} orderStatus={query.data.orderStatus} />
        <ExecutionLink orderId={query.data.orderId} orderStatus={query.data.orderStatus} />
        <SettlementPreviewLink orderId={query.data.orderId} />
        <PaymentLink orderId={query.data.orderId} />
      </div>
      <OrderTimeline orderId={query.data.orderId} />
      {/* FE1's editor, unchanged, with FE2 booking in its documented slot. */}
      <OrderEditor
        key={id}
        order={query.data}
        servicesSlot={(slot) => <BookingServices {...slot} />}
      />
      <RevisionsSection order={query.data} />
    </>
  );
}
