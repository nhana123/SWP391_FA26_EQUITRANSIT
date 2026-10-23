import { PortfolioMetrics } from '../../components/ui/PortfolioMetrics';
import { EmptyState } from '../../components/ui/Primitives';
import { RequestTable } from '../../components/ui/RequestTable';
import { Icon } from '../../components/ui/Icons';
import { Link } from 'react-router-dom';
import { Notice } from '../../shared/ui/common';
import { activityApi } from './api';
import type { Dashboard } from './contracts';
import { legalStatuses } from '../compliance/link';
import {
  ActivityHeading,
  ActivityPager,
  ActivityReadState,
  InvalidActivityPage,
  useActivityPage,
  useActivityQuery,
} from './shared';

/**
 * Requests whose legal file is open, each with a direct way to its documents.
 * Covers the requests on the current page only, like the table below.
 */
function LegalDocumentsBanner({ items }: { items: Dashboard['items'] }) {
  const open = items.filter((o) => legalStatuses.includes(o.status));
  if (!open.length) return null;
  return (
    <section className="card legal-banner" aria-labelledby="legal-banner-heading">
      <h2 id="legal-banner-heading">
        <Icon name="shield" size={18} /> Legal documents
      </h2>
      <p>Send the documents your Specialist requires and follow their review.</p>
      <ul>
        {open.map((o) => (
          <li key={o.orderId}>
            <Link className="button primary" to={`/customer/requests/${o.orderId}/compliance`}>
              {o.orderNumber}: Legal documents (submit / track review)
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CustomerDashboardPage() {
  const paging = useActivityPage();
  const query = useActivityQuery(
    ['dashboard', paging.page],
    (signal) => activityApi.dashboard(paging.page, signal),
    ['CUSTOMER'],
    paging.valid,
  );
  if (!query.allowed) return <Notice>This dashboard is available to Customers only.</Notice>;
  if (!paging.valid) return <InvalidActivityPage reset={() => paging.setPage(0)} />;
  const data = query.data;
  return (
    <>
      <ActivityHeading title="My dashboard" />
      <section className="dashboard-hero">
        <div>
          <small className="eyebrow">YOUR HORSES. ONE CONNECTED JOURNEY.</small>
          <h2>Every journey, thoughtfully coordinated.</h2>
          <p>
            Follow your requests, review the next step and keep your horses moving with confidence.
          </p>
        </div>
        <Link className="button" to="/customer/requests/new">
          <Icon name="plus" size={17} />
          Request transport
          <Icon name="arrow" size={16} />
        </Link>
      </section>
      <ActivityReadState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {data && !query.error && (
        <>
          <LegalDocumentsBanner items={data.items} />
          <section className="portfolio-overview">
            <h2>Request status overview</h2>
            <p>Counts cover all your requests, including those outside this page.</p>
            {!data.counts.length ? (
              <EmptyState title="No request statuses to display." />
            ) : (
              <PortfolioMetrics counts={data.counts} />
            )}
          </section>
          <section className="card">
            <h2>Your transport requests</h2>
            <RequestTable
              items={data.items}
              label="Dashboard requests"
              emptyMessage="No transport requests on this page."
              path={(order) => `/customer/requests/${order.orderId}`}
            />
            <ActivityPager {...data} page={paging.page} onPage={paging.setPage} />
          </section>
        </>
      )}
    </>
  );
}
