import { useState, type ReactNode } from 'react';
import { Icon } from './Icons';
import { EmptyState } from './Primitives';
/** Pure presentation filter: never changes server queries or pagination. */
export function LoadedOrderFilter<T extends { orderNumber: string; orderStatus: string }>({
  items,
  children,
}: {
  items: T[];
  children: (filtered: T[]) => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const filtered = items.filter(
    (item) =>
      item.orderNumber.toLowerCase().includes(search.trim().toLowerCase()) &&
      (filter === 'All' ||
        (filter === 'Confirmed' && item.orderStatus === 'CONFIRMED') ||
        (filter === 'Completed' &&
          ['DELIVERED', 'COMPLETED', 'CLOSED'].includes(item.orderStatus)) ||
        (filter === 'Active' &&
          !['DELIVERED', 'COMPLETED', 'CLOSED', 'REJECTED', 'CANCELLED', 'CANCELED'].includes(
            item.orderStatus,
          ))),
  );
  return (
    <>
      <div className="table-tools">
        <label className="search-box">
          <Icon name="search" size={18} />
          <input
            type="search"
            aria-label="Search loaded requests"
            placeholder="Search request code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="filter-pills" aria-label="Filter loaded requests">
          {['All', 'Active', 'Confirmed', 'Completed'].map((f) => (
            <button type="button" key={f} aria-pressed={f === filter} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <p className="table-scope">
        Filters apply to this page. Use pagination to review other requests.
      </p>
      {filtered.length ? (
        children(filtered)
      ) : (
        <EmptyState
          title="No matching requests on this page"
          description="Clear your search or choose All to see the loaded requests."
        />
      )}
    </>
  );
}
