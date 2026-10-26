import { Link } from 'react-router-dom';
import { LoadedOrderFilter } from '../../components/ui/LoadedOrderFilter';
import { CodeChip } from '../../components/ui/Primitives';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading, Notice, Pagination } from '../../shared/ui/common';
import { reviewStates, type ReviewState } from './contracts';
import { useManagerQueue } from './hooks';
import { ManagerHeading } from './layout';

export const reviewStateLabels: Record<ReviewState, string> = {
  SUBMITTED: 'Awaiting assessment',
  APPROVED: 'Approved for preparation',
  CHANGES_REQUESTED: 'Changes requested',
  REJECTED: 'Rejected',
};

const emptyCopy: Record<ReviewState, string> = {
  SUBMITTED: 'No submitted requests are waiting for assessment.',
  APPROVED: 'No requests are currently approved for preparation.',
  CHANGES_REQUESTED: 'No requests are waiting on customer changes.',
  REJECTED: 'No rejected requests.',
};

const stateTabs: { state: ReviewState; icon: string; label: string }[] = [
  { state: 'SUBMITTED', icon: '⏳', label: 'Chờ thẩm định (Awaiting)' },
  { state: 'APPROVED', icon: '🟢', label: 'Đã phê duyệt (Approved)' },
  { state: 'CHANGES_REQUESTED', icon: '💬', label: 'Yêu cầu sửa đổi' },
  { state: 'REJECTED', icon: '❌', label: 'Đã từ chối' },
];

export function ManagerQueuePage() {
  const { state, page, query, setState, setPage } = useManagerQueue();
  return (
    <>
      <ManagerHeading
        title="Transport Requests"
        description="Theo dõi, đánh giá và phân công điều phối cho các đơn vận chuyển ngựa đua theo từng trạng thái."
      />
      <Notice>
        Approval starts case preparation only. It does not confirm payment, documents, carrier space
        or departure.
      </Notice>
      <section className="card">
        <div className="manager-queue-toolbar">
          <div className="manager-queue-tabs">
            {stateTabs.map((tab) => (
              <button
                key={tab.state}
                type="button"
                className={`manager-queue-tab ${state === tab.state ? 'active' : ''}`}
                onClick={() => setState(tab.state)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <div style={{ minWidth: '220px' }}>
            <Field label="Assessment state">
              {(id) => (
                <select
                  id={id}
                  value={state}
                  onChange={(e) => setState(e.target.value as ReviewState)}
                >
                  {reviewStates.map((s) => (
                    <option key={s} value={s}>
                      {reviewStateLabels[s]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </div>

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
            <h2>Nothing in this queue</h2>
            <p>{emptyCopy[state]}</p>
          </div>
        ) : (
          <LoadedOrderFilter items={query.data.items}>
            {(filtered) => (
              <div className="table-scroll" aria-busy={query.isPlaceholderData}>
                <table
                  aria-label={`${reviewStateLabels[state]}: ${query.data.totalElements} request${
                    query.data.totalElements === 1 ? '' : 's'
                  }`}
                >
                  <thead>
                    <tr>
                      <th scope="col">Request</th>
                      <th scope="col">Route</th>
                      <th scope="col">Delivery deadline</th>
                      <th scope="col">Status</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.orderId}>
                        <td>
                          <CodeChip value={c.orderNumber} to={`/manager/requests/${c.orderId}`} />
                        </td>
                        <td>
                          <span className="manager-route-badge">
                            {c.originCountryCode} ➔ {c.destinationCountryCode}
                          </span>
                        </td>
                        <td>{displayDate(c.deliveryDeadline)}</td>
                        <td>
                          <StatusBadge status={c.orderStatus}>{c.orderStatus}</StatusBadge>
                        </td>
                        <td>
                          <Link
                            to={`/manager/requests/${c.orderId}`}
                            className="manager-action-btn"
                          >
                            Review ➔
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </LoadedOrderFilter>
        )}
        {/* page > 0 keeps a way back when a bookmarked page no longer exists. */}
        {query.data && (query.data.totalPages > 1 || page > 0) && (
          <Pagination
            page={page}
            pages={query.data.totalPages}
            onChange={setPage}
            pending={query.isFetching}
          />
        )}
      </section>
    </>
  );
}
