import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading } from '../../shared/ui/common';
import { OPERATIONS_PAGE_SIZE, operationsApi } from './api';
import { milestoneText } from './contracts';
import { operationsKeys } from './TaskQueue';
import './operations.css';

/** One server page of milestones; only the last loaded page offers more. */
function TimelinePage({
  orderId,
  page,
  last,
  onMore,
}: {
  orderId: number;
  page: number;
  last: boolean;
  onMore: () => void;
}) {
  const { generation } = useSession()!;
  const query = useQuery({
    queryKey: operationsKeys.timeline(generation, orderId, page),
    queryFn: ({ signal }) => operationsApi.timeline(orderId, page, signal),
    retry: false,
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorNotice error={query.error}>
        {query.error instanceof ApiError && query.error.status === 503 && (
          <p>Activity is not deployed on this server yet (migration 008).</p>
        )}
      </ErrorNotice>
    );
  const items = query.data.items;
  return (
    <>
      {page === 0 && !items.length && <p>No milestones have been recorded yet.</p>}
      {items.length > 0 && (
        <ol className="order-timeline" start={page * OPERATIONS_PAGE_SIZE + 1}>
          {items.map((p, i) => (
            <li key={`${page}-${i}`}>
              <strong>{milestoneText(p.milestone)}</strong>{' '}
              <time dateTime={p.occurredAt}>{displayDate(p.occurredAt)}</time>
            </li>
          ))}
        </ol>
      )}
      {/* No totalElements here: a full page means there may be more. */}
      {last && items.length === OPERATIONS_PAGE_SIZE && (
        <button type="button" onClick={onMore}>
          Show more
        </button>
      )}
    </>
  );
}

/**
 * Recorded milestones only, in the server's order. Nothing is inferred from
 * the order status: a milestone appears only once its producer recorded it.
 */
export function OrderTimeline({ orderId }: { orderId: number }) {
  const session = useSession();
  const [pages, setPages] = useState(1);
  if (!session) return null;
  return (
    <section className="card" aria-labelledby={`timeline-${orderId}`}>
      <h2 id={`timeline-${orderId}`}>Timeline</h2>
      <p className="muted">
        Only milestones that have actually been recorded are shown. A reported payment is not "paid"
        until reconciled bank transfers cover it.
      </p>
      <div aria-label="Order timeline">
        {Array.from({ length: pages }, (_, page) => (
          <TimelinePage
            key={page}
            orderId={orderId}
            page={page}
            last={page === pages - 1}
            onMore={() => setPages((n) => n + 1)}
          />
        ))}
      </div>
    </section>
  );
}
