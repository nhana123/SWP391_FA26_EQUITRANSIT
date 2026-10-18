import { useState } from 'react';
import type { Overview, ProofReceipt, Receipt } from './contracts';
import { PaymentActionForm, type ActionSpec } from './ActionForm';
import { PaymentLedger } from './Ledger';
import { reportAction, refundAction } from './customer-actions';
import type { EvidenceOption } from './Proof';

export type WorkspaceProps = {
  orderId: number;
  data: Overview;
  readError: unknown;
  paging: boolean;
  backTo: string;
  page: number;
  onPage: (page: number) => void;
  refresh: () => Promise<Overview>;
};
export function useEvidence(data: Overview) {
  const [uploaded, setUploaded] = useState<EvidenceOption[]>([]);
  const options = [
    ...new Map(
      [
        ...data.reports.map((report) => ({
          fileKey: report.proofFileKey,
          label: `Evidence from report ${report.reportId}`,
        })),
        ...uploaded,
      ].map((option) => [option.fileKey, option]),
    ).values(),
  ];
  function add(proof: ProofReceipt) {
    setUploaded((items) =>
      items.some((item) => item.fileKey === proof.fileKey)
        ? items
        : [
            ...items,
            {
              fileKey: proof.fileKey,
              label: `Evidence uploaded in this session (${items.length + 1})`,
            },
          ],
    );
  }
  return { options, add };
}
export function LedgerPager({
  data,
  page,
  onPage,
  locked,
}: {
  data: Overview;
  page: number;
  onPage: (page: number) => void;
  locked: boolean;
}) {
  const mayHaveNext = [data.obligations, data.reports, data.allocations, data.refunds].some(
    (rows) => rows.length >= data.size,
  );
  return (
    <nav className="pagination" aria-label="Ledger pages">
      <button type="button" disabled={locked || page === 0} onClick={() => onPage(page - 1)}>
        Previous ledger page
      </button>
      <span>Ledger page {page + 1}</span>
      <button type="button" disabled={locked || !mayHaveNext} onClick={() => onPage(page + 1)}>
        Next ledger page
      </button>
    </nav>
  );
}
export function CustomerPayments(props: WorkspaceProps) {
  const { data, orderId, readError, paging, backTo, refresh } = props;
  const [panel, setPanel] = useState<'report' | 'refund' | null>(null);
  const [notice, setNotice] = useState('');
  const evidence = useEvidence(data);
  const spec: ActionSpec | null =
    panel === 'report'
      ? reportAction(orderId, data)
      : panel === 'refund'
        ? refundAction(orderId, data.allocations, data.refunds)
        : null;
  const locked = !!readError || paging || panel !== null;
  function completed(receipt: Receipt) {
    setPanel(null);
    setNotice(
      `Action recorded, reference ${receipt.entityId}. The current payment ledger is shown below.`,
    );
  }
  return (
    <>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          disabled={locked || !data.obligations.some((o) => o.currency === 'USD')}
          onClick={() => setPanel('report')}
        >
          Report a bank transfer
        </button>
        <button
          type="button"
          disabled={locked || !data.allocations.length}
          onClick={() => setPanel('refund')}
        >
          Request a refund
        </button>
      </div>
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
      <PaymentLedger data={data} orderId={orderId} />
      <LedgerPager {...props} locked={locked} />
    </>
  );
}
