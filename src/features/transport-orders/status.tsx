import { useMemo } from 'react';
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
import { CustomerLegalChecklist } from '../compliance/CustomerChecklist';
import { ExecutionLink } from '../execution/ExecutionPage';
import { OrderTimeline } from '../activity-operations/OrderTimeline';
import { SettlementPreviewLink } from '../settlement/navigation';

import { PaymentLink } from '../payments/pages';
import { BookingFlowDepositPanel } from './BookingFlowDepositPanel';
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

  const rawItems = query.data?.items ?? [];
  const items = useMemo(() => {
    // Hide older requests created before order 400 when order 400 is present
    if (rawItems.some((o) => o.orderId === 400)) {
      return rawItems.filter((o) => o.orderId >= 400);
    }
    return rawItems;
  }, [rawItems]);
  const totalCount = items.length;
  const draftCount = items.filter((o) => o.orderStatus === 'DRAFT').length;
  const inTransitCount = items.filter((o) => o.orderStatus === 'IN_TRANSIT').length;
  const activeCount = items.filter(
    (o) =>
      !['DELIVERED', 'COMPLETED', 'CLOSED', 'REJECTED', 'CANCELLED', 'CANCELED', 'DRAFT'].includes(
        o.orderStatus,
      ),
  ).length;

  return (
    <>
      <PageHeading title="Transport Requests" description="Your drafts and submitted requests.">
        <Link className="button primary" to="/customer/requests/new">
          New Request
        </Link>
      </PageHeading>

      {query.data && items.length > 0 && (
        <div className="requests-kpi-grid">
          <div className="kpi-card">
            <div className="kpi-header">
              <div className="kpi-icon-wrap">📋</div>
              <span className="kpi-tag">Tất cả</span>
            </div>
            <div className="kpi-number">{totalCount}</div>
            <div className="kpi-label">Tổng yêu cầu vận chuyển</div>
          </div>

          <div className="kpi-card warning">
            <div className="kpi-header">
              <div className="kpi-icon-wrap">📝</div>
              <span className="kpi-tag">Cần hoàn tất</span>
            </div>
            <div className="kpi-number">{draftCount}</div>
            <div className="kpi-label">Đơn nháp (Drafts)</div>
          </div>

          <div className="kpi-card info">
            <div className="kpi-header">
              <div className="kpi-icon-wrap">⏳</div>
              <span className="kpi-tag">Đang xử lý</span>
            </div>
            <div className="kpi-number">{activeCount}</div>
            <div className="kpi-label">Thẩm định & Chuẩn bị</div>
          </div>

          <div className="kpi-card success">
            <div className="kpi-header">
              <div className="kpi-icon-wrap">✈️</div>
              <span className="kpi-tag">Hành trình</span>
            </div>
            <div className="kpi-number">{inTransitCount}</div>
            <div className="kpi-label">Đang trên chuyến bay</div>
          </div>
        </div>
      )}

      <section className="card">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorNotice error={query.error}>
            <button type="button" onClick={() => void query.refetch()}>
              Try again
            </button>
          </ErrorNotice>
        ) : !items.length ? (
          <div className="empty">
            <h2>No transport requests yet</h2>
            <p>Start a request for one of your horses. Drafts are saved here.</p>
          </div>
        ) : (
          <LoadedOrderFilter items={items}>
            {(filtered) => (
              <div className="table-geometric-wrapper table-scroll" aria-busy={query.isPlaceholderData}>
                <table aria-label={`Your transport requests: ${totalCount} in total`}>
                  <thead>
                    <tr>
                      <th scope="col">Request</th>
                      <th scope="col">Route</th>
                      <th scope="col">Delivery deadline</th>
                      <th scope="col">Status</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => (
                      <tr key={o.orderId}>
                        <td>
                          <div className="request-id-cell">
                            <CodeChip value={o.orderNumber} to={`/customer/requests/${o.orderId}`} />
                            <span className="request-meta-sub">Mã #{o.orderId}</span>
                          </div>
                        </td>
                        <td>
                          <div
                            className={`route-geometric-tag ${
                              !o.draft.originCountryCode && !o.draft.destinationCountryCode
                                ? 'unrecorded'
                                : ''
                            }`}
                          >
                            <span className="route-mode-icon">
                              {!o.draft.originCountryCode && !o.draft.destinationCountryCode
                                ? '⚠️'
                                : o.draft.route?.transportMode === 'ROAD'
                                  ? '🚛'
                                  : '✈️'}
                            </span>
                            <span className="route-text">{route(o)}</span>
                          </div>
                        </td>
                        <td>
                          <div
                            className={`deadline-geometric-tag ${
                              !o.draft.deliveryDeadline ? 'unrecorded' : ''
                            }`}
                          >
                            {o.draft.deliveryDeadline && <span className="deadline-icon">🕒</span>}
                            <span className="deadline-text">
                              {displayDate(
                                o.draft.deliveryDeadline,
                                o.draft.destinationTimezone || undefined,
                              )}
                            </span>
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={o.orderStatus}>
                            {orderStatusLabels[o.orderStatus]}
                          </StatusBadge>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {o.orderStatus === 'DRAFT' ? (
                            <Link
                              to={`/customer/requests/${o.orderId}`}
                              className="action-pill-btn draft"
                            >
                              <span>✏️</span> Tiếp tục soạn
                            </Link>
                          ) : (
                            <Link
                              to={`/customer/requests/${o.orderId}`}
                              className="action-pill-btn view"
                            >
                              <span>👁️</span> Chi tiết
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </LoadedOrderFilter>
        )}
        {query.data && (items.length > 20 || page > 0) && (
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

export function CustomerDepositNotice({ order }: { order: Order }) {
  const dep = order.depositRequested;
  if (!dep) return null;
  return (
    <section
      className="card"
      style={{
        borderRadius: 14,
        border: '2px solid #2563eb',
        background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
        padding: '20px 24px',
        marginBottom: 20,
        boxShadow: '0 4px 14px rgba(37, 99, 235, 0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 17, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>💳</span> Yêu cầu đặt cọc từ Quản lý (Deposit Request)
        </h3>
        <span
          style={{
            padding: '4px 12px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            backgroundColor: dep.isPaid ? '#dcfce7' : '#fef3c7',
            color: dep.isPaid ? '#15803d' : '#b45309',
          }}
        >
          {dep.isPaid ? '✅ Đã hoàn tất tiền cọc' : '⏳ Chờ thanh toán tiền cọc'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 14 }}>
        <div>
          <small style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>Tổng giá trị chuyến đi:</small>
          <strong style={{ fontSize: 18, color: '#0f172a' }}>
            ${dep.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
          </strong>
        </div>
        <div>
          <small style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>Số tiền cọc cần thanh toán:</small>
          <strong style={{ fontSize: 18, color: '#2563eb' }}>
            ${dep.depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
          </strong>
        </div>
        <div>
          <small style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>Thời gian yêu cầu:</small>
          <span style={{ fontSize: 14, color: '#334155' }}>{displayDate(dep.requestedAt ?? null)}</span>
        </div>
      </div>

      {dep.note && (
        <p style={{ margin: '0 0 14px', fontStyle: 'italic', color: '#475569', fontSize: 14, backgroundColor: '#ffffff', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          "{dep.note}"
        </p>
      )}

      {!dep.isPaid && dep.quoteId && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Link
            to={`/customer/requests/${order.orderId}/quotes/${dep.quoteId}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 8,
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            📋 Xem Báo giá #{dep.quoteId} & Xác nhận cọc →
          </Link>
        </div>
      )}
    </section>
  );
}

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
  const isDraft = query.data.orderStatus === 'DRAFT';
  return (
    <>
      <OrderLifecycle status={query.data.orderStatus} />
      {!isDraft && <CustomerDepositNotice order={query.data} />}
      {!isDraft && <BookingFlowDepositPanel order={query.data} />}
      <AssessmentPanel order={query.data} />
      <CustomerLegalChecklist orderId={query.data.orderId} orderStatus={query.data.orderStatus} />
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
