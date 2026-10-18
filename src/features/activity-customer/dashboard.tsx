import { Link } from 'react-router-dom';
import { Notice } from '../../shared/ui/common';
import { orderStatusLabels } from '../transport-orders/status-contracts';
import { activityApi } from './api';
import {
  ActivityHeading,
  ActivityPager,
  ActivityReadState,
  InvalidActivityPage,
  useActivityPage,
  useActivityQuery,
} from './shared';

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
      <ActivityHeading title="My dashboard">
        <Link className="button primary" to="/customer/requests/new">
          Request transport
        </Link>
      </ActivityHeading>
      <ActivityReadState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {data && !query.error && (
        <>
          <section className="card">
            <h2>Request status overview</h2>
            <p>Counts cover all your requests, including those outside this page.</p>
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
            <h2>Your transport requests</h2>
            {!data.items.length ? (
              <p>No transport requests on this page.</p>
            ) : (
              <div className="table-scroll">
                <table aria-label="Dashboard requests">
                  <thead>
                    <tr>
                      <th scope="col">Request</th>
                      <th scope="col">Current status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((order) => (
                      <tr key={order.orderId}>
                        <td>
                          <Link to={`/customer/requests/${order.orderId}`}>
                            {order.orderNumber}
                          </Link>
                        </td>
                        <td>{orderStatusLabels[order.status]}</td>
                      </tr>
                    ))}
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
