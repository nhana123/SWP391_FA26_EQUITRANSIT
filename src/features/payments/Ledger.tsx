import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/Primitives';
import { displayDate } from '../../shared/lib/validation';
import type { Overview, Refund } from './contracts';
import { moneyText, outstanding } from './money';
import { ProofViewer } from './Proof';

export function PaymentLedger({
  orderId,
  data,
  manager = false,
  locked = false,
  onReject,
  onRefundAction,
}: {
  orderId: number;
  data: Overview;
  manager?: boolean;
  locked?: boolean;
  onReject?: (id: number) => void;
  onRefundAction?: (refund: Refund, action: 'APPROVE' | 'REJECT' | 'COMPLETE') => void;
}) {
  return (
    <>
      <section className="card">
        <h2>Payment obligations</h2>
        {!data.obligations.length ? (
          <EmptyState title="No payment obligations on this page." />
        ) : (
          <div className="table-scroll">
            <table aria-label="Payment obligations">
              <thead>
                <tr>
                  {[
                    'Obligation',
                    'Quotation / Installment',
                    'Amount due',
                    'Net paid',
                    'Outstanding',
                    'Due date',
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.obligations.map((o) => {
                  const remaining = outstanding(o.amountDue, o.paidAmount);
                  return (
                    <tr key={o.paymentRequestId}>
                      <td>
                        {o.paymentStage} (#{o.paymentRequestId})
                      </td>
                      <td>
                        {o.quoteId} / {o.scheduleId}
                      </td>
                      <td>
                        {o.amountDue} {o.currency}
                      </td>
                      <td>
                        {o.paidAmount} {o.currency}
                      </td>
                      <td>
                        {remaining === null
                          ? 'Needs review'
                          : `${moneyText(remaining)} ${o.currency}`}
                      </td>
                      <td>
                        {o.dueAt === null
                          ? 'Date unavailable — requires review'
                          : displayDate(o.dueAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <h2>Transfer reports</h2>
        <p>A submitted report is a customer claim; it does not increase net paid amounts.</p>
        {!data.reports.length ? (
          <p>No transfer reports on this page.</p>
        ) : (
          <div className="table-scroll">
            <table aria-label="Transfer reports">
              <thead>
                <tr>
                  {[
                    'Report / Obligation',
                    'Reported amount',
                    'Transferred at',
                    'Review state',
                    'Evidence',
                    ...(manager ? ['Review'] : []),
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.reports.map((r) => (
                  <tr key={r.reportId}>
                    <td>
                      {r.reportId} / {r.paymentRequestId}
                    </td>
                    <td>
                      {r.reportedAmount} {r.reportedCurrency}
                    </td>
                    <td>{displayDate(r.transferredAt)}</td>
                    <td>
                      <StatusBadge status={r.status}>
                        {r.status === 'SUBMITTED'
                          ? 'Reported — awaiting verification'
                          : 'Report rejected'}
                      </StatusBadge>
                    </td>
                    <td>
                      <ProofViewer orderId={orderId} fileKey={r.proofFileKey} />
                    </td>
                    {manager && (
                      <td>
                        {r.status === 'SUBMITTED' && (
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => onReject?.(r.reportId)}
                          >
                            Reject report {r.reportId}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <h2>Allocation history</h2>
        <p>
          Recorded gross allocations remain in history. Obligation net paid amounts come from the
          current ledger.
        </p>
        {!data.allocations.length ? (
          <p>No allocations on this page.</p>
        ) : (
          <div className="table-scroll">
            <table aria-label="Payment allocations">
              <thead>
                <tr>
                  {['Allocation', 'Bank receipt', 'Obligation', 'Allocated amount'].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.allocations.map((a) => (
                  <tr key={a.allocationId}>
                    <td>{a.allocationId}</td>
                    <td>{a.transactionId}</td>
                    <td>{a.paymentRequestId}</td>
                    <td>{a.amount} USD</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <h2>Refund history</h2>
        {!data.refunds.length ? (
          <p>No refunds on this page.</p>
        ) : (
          <div className="table-scroll">
            <table aria-label="Refunds">
              <thead>
                <tr>
                  {[
                    'Refund / Allocation',
                    'Amount',
                    'Reason',
                    'State',
                    'Completed at',
                    ...(manager ? ['Action'] : []),
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.refunds.map((r) => (
                  <tr key={r.refundId}>
                    <td>
                      {r.refundId} / {r.allocationId}
                    </td>
                    <td>{r.amount} USD</td>
                    <td>{r.reason}</td>
                    <td>
                      <StatusBadge status={r.status}>{r.status}</StatusBadge>
                    </td>
                    <td>{r.refundedAt ? displayDate(r.refundedAt) : 'Not completed'}</td>
                    {manager && (
                      <td>
                        {r.status === 'REQUESTED' && (
                          <>
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => onRefundAction?.(r, 'APPROVE')}
                            >
                              Approve refund {r.refundId}
                            </button>
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => onRefundAction?.(r, 'REJECT')}
                            >
                              Reject refund {r.refundId}
                            </button>
                          </>
                        )}
                        {r.status === 'APPROVED' && (
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => onRefundAction?.(r, 'COMPLETE')}
                          >
                            Record refund completion {r.refundId}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
