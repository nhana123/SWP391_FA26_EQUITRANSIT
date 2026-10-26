import { displayDate } from '../../shared/lib/validation';
import { Notice } from '../../shared/ui/common';
import {
  ActivityHeading,
  ActivityPager,
  ActivityReadState,
  InvalidActivityPage,
  useActivityPage,
  useActivityQuery,
} from '../activity-customer/shared';
import { managerActivityApi, type FinancialReport } from './api';

const moneyMetrics = [
  [
    'quotedValue',
    'Published quotation value',
    'Latest issued or accepted quote for each current order revision. This is not received money.',
  ],
  [
    'reportedTransfers',
    'Customer-reported transfers',
    'Submitted, unverified transfer claims. This is not bank cash.',
  ],
  [
    'netBankReceipts',
    'Net bank receipts',
    'Reconciled receipts less completed refunds; reversed receipts excluded. May include unallocated money.',
  ],
  [
    'netAllocated',
    'Net allocated funds',
    'Reconciled allocations less completed refunds; reversed transactions excluded.',
  ],
  [
    'actualCost',
    'Actual costs',
    'Recorded USD costs for current plans only; excludes historical or unlinked plans.',
  ],
] as const satisfies readonly [keyof FinancialReport, string, string][];
const cardClassMap: Record<string, string> = {
  quotedValue: 'financial-card financial-card--blue',
  reportedTransfers: 'financial-card financial-card--amber',
  netBankReceipts: 'financial-card financial-card--emerald',
  netAllocated: 'financial-card financial-card--teal',
  actualCost: 'financial-card financial-card--slate',
};

export function ManagerFinancialPage() {
  const query = useActivityQuery(['financial'], (signal) => managerActivityApi.financial(signal), [
    'MANAGER',
  ]);
  if (!query.allowed) return <Notice>Financial reports are available to Managers only.</Notice>;
  return (
    <>
      <ActivityHeading title="Financial report" />
      <div className="financial-report-banner">
        <span>🛡️</span>
        <div>
          <strong>Financial Segregation:</strong> Quotation value, unverified claims, received cash, allocations and costs are separate measures. This report does not authorize closure or recognize revenue.
        </div>
      </div>
      <ActivityReadState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && !query.error && (
        <section className="card">
          <h2>Financial overview</h2>
          <dl className="activity-metrics">
            {moneyMetrics.map(([key, label, help]) => (
              <div key={key} className={cardClassMap[key] || 'financial-card'} data-metric={key}>
                <dt>{label}</dt>
                <dd>
                  {query.data![key]} {query.data!.currency}
                </dd>
                <small>{help}</small>
              </div>
            ))}
            <div className="financial-card financial-card--indigo" data-metric="operationallyCompletedOrders">
              <dt>Operationally completed orders</dt>
              <dd>{query.data.operationallyCompletedOrders}</dd>
              <small>Persisted delivered, completed or closed states.</small>
            </div>
            <div className="financial-card financial-card--emerald" data-metric="closedOrders">
              <dt>Financially closed orders</dt>
              <dd>{query.data.closedOrders}</dd>
              <small>
                Explicit CLOSED state; delivery alone does not establish financial closure.
              </small>
            </div>
          </dl>
          <div className="financial-actions-bar">
            <button type="button" className="button secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>
              Refresh financial report
            </button>
          </div>
        </section>
      )}
    </>
  );
}
export function ManagerAuditPage() {
  const paging = useActivityPage();
  const query = useActivityQuery(
    ['audit', paging.page],
    (signal) => managerActivityApi.audit(paging.page, signal),
    ['MANAGER'],
    paging.valid,
  );
  if (!query.allowed) return <Notice>Audit events are available to Managers only.</Notice>;
  if (!paging.valid) return <InvalidActivityPage reset={() => paging.setPage(0)} />;
  return (
    <>
      <ActivityHeading title="Audit events" />
      <p>Read-only audit history with snapshots redacted by the service.</p>
      <ActivityReadState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && !query.error && (
        <section className="card">
          <h2>Recorded events</h2>
          {!query.data.items.length ? (
            <p>No audit events on this page.</p>
          ) : (
            <div className="table-scroll">
              <table aria-label="Audit events">
                <thead>
                  <tr>
                    {['Event', 'Actor', 'Entity', 'Action', 'Occurred at', 'Redacted snapshot'].map(
                      (label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((event) => (
                    <tr key={event.eventId}>
                      <td>{event.eventId}</td>
                      <td>{event.userId ?? 'System / unavailable'}</td>
                      <td>
                        {event.entityType} #{event.entityId}
                      </td>
                      <td>{event.actionCode}</td>
                      <td>{displayDate(event.occurredAt)}</td>
                      <td>
                        <details>
                          <summary>View redacted snapshot</summary>
                          <pre className="activity-snapshot">{event.redactedSnapshot}</pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>
            Refresh audit events
          </button>
          <ActivityPager {...query.data} page={paging.page} onPage={paging.setPage} />
        </section>
      )}
    </>
  );
}
