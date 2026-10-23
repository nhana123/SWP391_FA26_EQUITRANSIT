import { StatusBadge } from '../../components/ui/StatusBadge';
import { useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import { getSession, useSession } from '../../shared/api/session';
import { useAction } from '../../shared/lib/useAction';
import { displayDate } from '../../shared/lib/validation';
import { Field } from '../../shared/ui/common';
import { PaymentActionForm, type ActionSpec } from './ActionForm';
import type { Receipt, Refund } from './contracts';
import { refundAction } from './customer-actions';
import { accessDenied, PaymentError } from './errors';
import { PaymentLedger } from './Ledger';
import {
  allocateAction,
  reconcileAction,
  refundDecisionAction,
  rejectReportAction,
  reverseAction,
} from './manager-actions';
import { managerPaymentsApi, type Bank, type RefundAction } from './manager-api';
import { LedgerPager, useEvidence, type WorkspaceProps } from './workspace';
import { RequestPayment } from './RequestPayment';
import { FundingStatus, refreshFunding } from './FundingStatus';

type Panel =
  | { kind: 'reconcile' | 'refund' | 'allocate' | 'reverse' }
  | { kind: 'reject'; id: number }
  | { kind: 'refundDecision'; target: Refund; action: RefundAction };
export function ManagerPayments(props: WorkspaceProps) {
  const { data, orderId, readError, paging, backTo } = props;
  const session = useSession()!;
  const [panel, setPanel] = useState<Panel | null>(null);
  const [requestEditing, setRequestEditing] = useState(false);
  const [bank, setBank] = useState<Bank | null>(null);
  const [bankId, setBankId] = useState('');
  const [recent, setRecent] = useState<number[]>([]);
  const [notice, setNotice] = useState('');
  const lookup = useAction();
  const evidence = useEvidence(data);
  const locked = !!readError || paging || panel !== null || requestEditing;
  const knownIds = [...new Set([...recent, ...data.allocations.map((a) => a.transactionId)])];
  async function refresh() {
    const fresh = await props.refresh();
    if (bank) {
      const current = await managerPaymentsApi.bank(orderId, bank.transactionId);
      if (getSession()?.generation === session.generation) setBank(current);
    }
    return fresh;
  }
  let spec: ActionSpec | null = null;
  if (panel?.kind === 'reconcile') spec = reconcileAction(orderId);
  else if (panel?.kind === 'refund') spec = refundAction(orderId, data.allocations, data.refunds);
  else if (panel?.kind === 'allocate' && bank) spec = allocateAction(orderId, data, bank);
  else if (panel?.kind === 'reverse' && bank) spec = reverseAction(orderId, bank);
  else if (panel?.kind === 'reject') spec = rejectReportAction(orderId, panel.id);
  else if (panel?.kind === 'refundDecision')
    spec = refundDecisionAction(
      orderId,
      panel.target,
      panel.action,
      data.refunds.find((r) => r.refundId === panel.target.refundId),
    );
  function completed(receipt: Receipt) {
    if (panel?.kind === 'reconcile') setRecent((ids) => [...new Set([...ids, receipt.entityId])]);
    setPanel(null);
    setNotice(`Action recorded, reference ${receipt.entityId}. The ledger has been refreshed.`);
    void refreshFunding(session.generation, orderId);
  }
  if (accessDenied(lookup.error) && lookup.error instanceof ApiError && lookup.error.status !== 404)
    return <PaymentError error={lookup.error} backTo={backTo} />;
  return (
    <>
      <FundingStatus orderId={orderId} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <RequestPayment
        disabled={locked}
        onEditingChange={setRequestEditing}
        context={{
          orderId,
          overview: data,
          readError,
          backTo,
          refresh,
          evidence: evidence.options,
          onUploaded: evidence.add,
          onDone: completed,
          onCancel: () => {},
        }}
      />
      <div className="actions">
        <button type="button" disabled={locked} onClick={() => setPanel({ kind: 'reconcile' })}>
          Record a verified bank receipt
        </button>
        <button
          type="button"
          disabled={locked || !data.allocations.length}
          onClick={() => setPanel({ kind: 'refund' })}
        >
          Request a refund
        </button>
      </div>
      <section className="card">
        <h2>Bank receipt lookup</h2>
        <p>
          Use a recorded receipt reference to review its status before allocating or reversing
          funds.
        </p>
        <fieldset className="form-grid" disabled={locked || lookup.pending}>
          <Field label="Known bank receipt">
            {(id) => (
              <select
                id={id}
                value={knownIds.includes(Number(bankId)) ? bankId : ''}
                onChange={(e) => {
                  setBankId(e.target.value);
                  setBank(null);
                }}
              >
                <option value="">Choose a receipt</option>
                {knownIds.map((value) => (
                  <option key={value} value={value}>
                    Bank receipt {value}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Recorded bank receipt ID">
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                value={bankId}
                maxLength={16}
                onChange={(e) => {
                  setBankId(e.target.value);
                  setBank(null);
                }}
              />
            )}
          </Field>
        </fieldset>
        <button
          type="button"
          disabled={locked || lookup.pending}
          onClick={() =>
            void lookup.run(async () => {
              setBank(null);
              if (!/^\d+$/.test(bankId) || !idSchema.safeParse(Number(bankId)).success)
                throw new ApiError(400, 'Choose a valid receipt.');
              const receipt = await managerPaymentsApi.bank(orderId, Number(bankId));
              if (getSession()?.generation === session.generation) setBank(receipt);
            })
          }
        >
          {lookup.pending ? 'Loading bank receipt...' : 'Load bank receipt'}
        </button>
        <PaymentError error={lookup.error} />
        {bank && (
          <div className="bank-receipt">
            <p>
              Bank receipt {bank.transactionId}: {bank.amountReceived} {bank.currency} received,{' '}
              <StatusBadge status={bank.status} />, posted {displayDate(bank.postedAt)}.
            </p>
            <p>The received amount is not a statement of remaining allocatable funds.</p>
            <button
              type="button"
              disabled={locked || bank.status !== 'RECONCILED' || bank.currency !== 'USD'}
              onClick={() => setPanel({ kind: 'allocate' })}
            >
              Allocate received funds
            </button>
            <button
              type="button"
              disabled={locked || bank.status !== 'RECONCILED'}
              onClick={() => setPanel({ kind: 'reverse' })}
            >
              Record a full bank reversal
            </button>
          </div>
        )}
      </section>
      {spec && (
        <PaymentActionForm
          key={spec.key}
          spec={spec}
          context={{
            orderId,
            overview: data,
            readError,
            backTo,
            refresh,
            evidence: evidence.options,
            onUploaded: evidence.add,
            onDone: completed,
            onCancel: () => setPanel(null),
          }}
        />
      )}
      <PaymentLedger
        data={data}
        orderId={orderId}
        manager
        locked={locked}
        onReject={(id) => setPanel({ kind: 'reject', id })}
        onRefundAction={(target, action) => setPanel({ kind: 'refundDecision', target, action })}
      />
      <LedgerPager {...props} locked={locked} />
    </>
  );
}
