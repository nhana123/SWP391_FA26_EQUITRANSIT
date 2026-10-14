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

export function ManagerQueuePage() {
  const { state, page, query, setState, setPage } = useManagerQueue();
  return (
    <>
      <ManagerHeading
        title="Transport Requests"
        description="Review submitted requests by assessment state."
      />
      <Notice>
        Approval starts case preparation only. It does not confirm payment, documents, carrier space
        or departure.
      </Notice>
      <section className="card">
        <Field label="Assessment state">
          {(id) => (
            <select id={id} value={state} onChange={(e) => setState(e.target.value as ReviewState)}>
              {reviewStates.map((s) => (
                <option key={s} value={s}>
                  {reviewStateLabels[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
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
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((c) => (
                  <tr key={c.orderId}>
                    <td>{c.orderNumber}</td>
                    <td>
                      {c.originCountryCode} → {c.destinationCountryCode}
                    </td>
                    <td>{displayDate(c.deliveryDeadline)}</td>
                    <td>
                      <span className="badge">{c.orderStatus}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
