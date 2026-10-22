import { PortfolioMetrics } from '../../components/ui/PortfolioMetrics';
import { EmptyState } from '../../components/ui/Primitives';
import { RequestTable } from '../../components/ui/RequestTable';
import { Icon } from '../../components/ui/Icons';
import { Link } from 'react-router-dom';
import type { Role } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { Notice } from '../../shared/ui/common';
import {
  ActivityHeading,
  ActivityPager,
  ActivityReadState,
  InvalidActivityPage,
  orderPath,
  useActivityPage,
  useActivityQuery,
} from '../activity-customer/shared';
import { operationsApi } from './api';
import { staffRoles, type StaffDashboard } from './contracts';
import { PriorityDossiers } from '../specialist-desk/DossierDesk';

const scopes: Record<string, string> = {
  MANAGER: 'Every transport request.',
  SPECIALIST: 'Cases currently assigned to you as Specialist.',
  COORDINATOR: 'Cases currently assigned to you as Coordinator.',
  DRIVER: 'Orders with a road leg currently assigned to you.',
};
const driverExecution = ['IN_TRANSIT', 'DELIVERED', 'COMPLETED'];

/** Where a dashboard order is worked on for this role. */
function dashboardOrderPath(role: Role, order: StaffDashboard['items'][number]) {
  if (role !== 'DRIVER') return orderPath(role, order.orderId);
  return driverExecution.includes(order.status)
    ? `/driver/orders/${order.orderId}/execution`
    : `/driver/orders/${order.orderId}/departure`;
}
const taskLinks: Partial<Record<Role, string>> = {
  SPECIALIST: '/staff/tasks',
  COORDINATOR: '/staff/tasks',
  DRIVER: '/driver',
};

/** Overview for Manager, Specialist, Coordinator and Driver from /api/dashboard. */
export function StaffDashboardPage() {
  const paging = useActivityPage();
  const session = useSession();
  const query = useActivityQuery(
    ['staff-dashboard', paging.page],
    (signal) => operationsApi.dashboard(session?.role ?? '', paging.page, signal),
    staffRoles,
    paging.valid,
  );
  if (!session) return null;
  if (!query.allowed) return <Notice>This overview is available to staff only.</Notice>;
  if (!paging.valid) return <InvalidActivityPage reset={() => paging.setPage(0)} />;
  const data = query.data;
  const tasks = taskLinks[session.role];
  return (
    <>
      <ActivityHeading title="Overview" />
      <section className="dashboard-hero">
        <div>
          <small className="eyebrow">PRECISION IN EVERY HANDOVER</small>
          <h2>Your operations, in perspective.</h2>
          <p>Review your portfolio and focus on the requests that need your attention today.</p>
        </div>
        {tasks && (
          <Link className="button" to={tasks}>
            <Icon name="check" size={17} />
            {session.role === 'SPECIALIST' ? 'Go to My Tasks' : 'My Tasks'}
            <Icon name="arrow" size={16} />
          </Link>
        )}
      </section>
      <p className="muted">
        {scopes[session.role]} Counts show request statuses only; they are not a staff schedule or
        availability.
      </p>
      <ActivityReadState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {data && !query.error && (
        <>
          <section className="portfolio-overview">
            <h2>Status overview</h2>
            {!data.counts.length ? (
              <EmptyState title="No request statuses to display." />
            ) : (
              <PortfolioMetrics counts={data.counts} />
            )}
          </section>
          {session.role === 'SPECIALIST' ? (
            <PriorityDossiers />
          ) : (
            <section className="card">
              <h2>Requests</h2>
              <RequestTable
                items={data.items}
                label="Dashboard orders"
                emptyMessage="No requests on this page."
                path={(order) =>
                  dashboardOrderPath(session.role, order as StaffDashboard['items'][number])
                }
              />
              <ActivityPager {...data} page={paging.page} onPage={paging.setPage} />
            </section>
          )}
        </>
      )}
    </>
  );
}
