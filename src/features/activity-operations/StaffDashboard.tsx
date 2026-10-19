import { Link } from 'react-router-dom';
import type { Role } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { Notice } from '../../shared/ui/common';
import { orderStatusLabels } from '../transport-orders/status-contracts';
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
      <ActivityHeading title="Overview">
        {tasks && (
          <Link className="button primary" to={tasks}>
            My Tasks
          </Link>
        )}
      </ActivityHeading>
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
          <section className="card">
            <h2>Status overview</h2>
            {!data.counts.length ? (
              <p>No request statuses to display.</p>
            ) : (
              <dl className="activity-metrics">
                {data.counts.map((entry) => (
                  <div key={entry.status}>
                    <dt>{orderStatusLabels[entry.status]}</dt>
                    <dd>{entry.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <section className="card">
            <h2>Requests</h2>
            {!data.items.length ? (
              <p>No requests on this page.</p>
            ) : (
              <div className="table-scroll">
                <table aria-label="Dashboard orders">
                  <thead>
                    <tr>
                      <th scope="col">Request</th>
                      <th scope="col">Current status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((order) => {
                      const to = dashboardOrderPath(session.role, order);
                      return (
                        <tr key={order.orderId}>
                          <td>
                            {to ? <Link to={to}>{order.orderNumber}</Link> : order.orderNumber}
                          </td>
                          <td>{orderStatusLabels[order.status]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <ActivityPager {...data} page={paging.page} onPage={paging.setPage} />
          </section>
        </>
      )}
    </>
  );
}
