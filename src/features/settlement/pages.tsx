import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { idSchema } from '../../shared/api/contracts';
import { Notice, PageHeading } from '../../shared/ui/common';

// Release placeholders only. F14 has no confirmed API, DTO or write permission
// contract. Do not add financial requests or infer settlement from other flows.
function ReleasePreview({
  title,
  description,
  backTo,
  children,
}: {
  title: string;
  description: string;
  backTo: string;
  children: ReactNode;
}) {
  const orderId = Number(useParams().id);
  if (!idSchema.safeParse(orderId).success)
    return <Notice>This transport request is unavailable.</Notice>;
  return (
    <>
      <PageHeading title={title} description={description}>
        <Link to={`${backTo}/${orderId}`}>Back to request</Link>
      </PageHeading>
      <Notice>
        Preview only — unavailable in this release. Records cannot be loaded or saved here.
      </Notice>
      {children}
    </>
  );
}

export function CustomerHandoverPage() {
  return (
    <ReleasePreview
      title="Delivery handover"
      description="Review delivery evidence and record your handover decision when this feature becomes available."
      backTo="/customer/requests"
    >
      <section className="card">
        <h2>Delivery record and evidence</h2>
        <p>The delivery record and its supporting evidence are unavailable in this release.</p>
      </section>
      <section className="card">
        <h2>Handover decision</h2>
        <p>No decision can be recorded yet. These are the planned handover options.</p>
        <fieldset disabled>
          <legend>Planned handover decisions</legend>
          <div className="actions">
            <button type="button">Accept handover</button>
            <button type="button">Report a handover exception</button>
            <button type="button">Report not delivered</button>
          </div>
        </fieldset>
      </section>
    </ReleasePreview>
  );
}

function ActualCostsPreview() {
  return (
    <section className="card">
      <h2>Internal actual costs</h2>
      <p>Cost records and their supporting sources are unavailable in this release.</p>
      <button type="button" disabled>
        Record an actual cost
      </button>
    </section>
  );
}

export function StaffActualCostsPage() {
  return (
    <ReleasePreview
      title="Actual costs"
      description="Review sourced internal cost records when this feature becomes available."
      backTo="/staff/cases"
    >
      <ActualCostsPreview />
    </ReleasePreview>
  );
}

export function ManagerSettlementPage() {
  return (
    <ReleasePreview
      title="Financial settlement"
      description="Review internal costs and financial settlement before closing a transport request."
      backTo="/manager/requests"
    >
      <ActualCostsPreview />
      <section className="card">
        <h2>Settlement review</h2>
        <p>Delivery completion does not establish financial closure.</p>
        <p>
          Settlement has not been evaluated. The following conditions require server confirmation:
        </p>
        <ul>
          <li>All quotation installments are paid in full after refunds and reversals.</li>
          <li>No refund is awaiting approval or completion.</li>
          <li>No financial obligation remains outstanding.</li>
        </ul>
        <button type="button" disabled>
          Evaluate financial settlement
        </button>{' '}
        <button type="button" disabled>
          Close transport request
        </button>
      </section>
    </ReleasePreview>
  );
}
