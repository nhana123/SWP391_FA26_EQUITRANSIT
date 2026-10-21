import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icons';
import { CodeChip, EmptyState } from './Primitives';
import { StatusBadge } from './StatusBadge';
import { OrderLifecycle } from './OrderLifecycle';
import { orderStatusLabels } from '../../features/transport-orders/status-contracts';
type Item = { orderId: number; orderNumber: string; status: string };
const filters = ['All', 'Active', 'Confirmed', 'Completed'] as const;
export function RequestTable({
  items,
  label,
  emptyMessage,
  path,
}: {
  items: Item[];
  label: string;
  emptyMessage: string;
  path: (item: Item) => string | null;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const filtered = items.filter(
    (item) =>
      item.orderNumber.toLowerCase().includes(search.trim().toLowerCase()) &&
      (filter === 'All' ||
        (filter === 'Confirmed' && item.status === 'CONFIRMED') ||
        (filter === 'Completed' && ['DELIVERED', 'COMPLETED', 'CLOSED'].includes(item.status)) ||
        (filter === 'Active' &&
          !['DELIVERED', 'COMPLETED', 'CLOSED', 'REJECTED', 'CANCELLED', 'CANCELED'].includes(
            item.status,
          ))),
  );
  return (
    <>
      <div className="table-tools">
        <label className="search-box">
          <Icon name="search" size={18} />
          <input
            aria-label="Search loaded requests"
            type="search"
            value={search}
            placeholder="Search request code…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="filter-pills" aria-label="Filter loaded requests">
          {filters.map((f) => (
            <button type="button" key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <p className="table-scope">
        Search and filters apply to this page. Portfolio counts above include all requests.
      </p>
      {!items.length ? (
        <EmptyState
          title={emptyMessage}
          description="Requests appear here as your journeys are created and assigned."
        />
      ) : !filtered.length ? (
        <EmptyState
          title="No matching requests on this page"
          description="Try another search or choose All. Other pages may contain more results."
        />
      ) : (
        <div className="table-scroll">
          <table aria-label={label}>
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Current status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const to = path(item);
                return (
                  <tr key={item.orderId}>
                    <td>
                      <CodeChip value={item.orderNumber} to={to ?? undefined} />
                      <small className="table-subtitle">Equine transport request</small>
                    </td>
                    <td>
                      <StatusBadge status={item.status}>
                        {orderStatusLabels[item.status as keyof typeof orderStatusLabels] ??
                          item.status}
                      </StatusBadge>
                      <OrderLifecycle status={item.status} compact />
                    </td>
                    <td>
                      {to ? (
                        <Link
                          className="row-action"
                          to={to}
                          aria-label={`View details for ${item.orderNumber}`}
                        >
                          View details
                          <Icon name="arrow" size={16} />
                        </Link>
                      ) : (
                        'No detail page'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
