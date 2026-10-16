import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { idSchema } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { ErrorNotice, Loading, Notice } from '../../shared/ui/common';
import type { ManagerCase } from '../assessment/contracts';
import type { QuoteEvidence } from './mutation-contracts';
import { quotationParent } from './navigation';
import {
  EvidenceEditor,
  RecordedOffers,
  refreshPreparationCase,
  SupplierOfferForm,
  usePreparationCase,
  type RecordedOffer,
} from './source';
import './prepare.css';

function PreparationWorkspace({
  current,
  revisionId,
}: {
  current: ManagerCase;
  revisionId: number;
}) {
  const session = useSession()!;
  // Observed parent version; receipts advance it, reload resets it explicitly.
  const [parentVersion, setParentVersion] = useState(current.recordVersion);
  const [offers, setOffers] = useState<RecordedOffer[]>([]);
  const [evidence, setEvidence] = useState<QuoteEvidence[]>([]);
  const [notice, setNotice] = useState('');

  async function reload() {
    await refreshPreparationCase(session.generation, current.orderId);
  }
  return (
    <>
      {notice && <Notice>{notice}</Notice>}
      <RecordedOffers offers={offers} />
      <SupplierOfferForm
        orderId={current.orderId}
        revisionId={revisionId}
        parentVersion={parentVersion}
        onRecorded={async (receipt, offer) => {
          setParentVersion(receipt.recordVersion);
          setOffers((list) => [...list, offer]);
          setNotice(`Offer ${receipt.offerId} recorded. Use it as a source in the evidence below.`);
          await reload();
        }}
        onReload={() => {
          setParentVersion(current.recordVersion);
          void reload();
        }}
      />
      <EvidenceEditor
        rows={evidence}
        onChange={setEvidence}
        offers={offers}
        quoteValidUntil={null}
        disabled={false}
      />
    </>
  );
}

/**
 * Quotation preparation for the current approved revision. Manager and the
 * assigned Coordinator only; Specialist/Driver/Customer have no access.
 */
export function PrepareQuotationPage() {
  const orderId = Number(useParams().id);
  const session = useSession();
  const query = usePreparationCase(orderId);
  if (!session) return null;
  if (session.role !== 'MANAGER' && session.role !== 'COORDINATOR')
    return <Notice>You do not have access to quotation preparation.</Notice>;
  if (!idSchema.safeParse(orderId).success) return <Notice>This request is unavailable.</Notice>;
  const parent = quotationParent(session.role, orderId);
  const heading = (
    <header className="page-heading">
      <div>
        <small className="eyebrow">QUOTATION WORKSPACE</small>
        <h1>Prepare quotation</h1>
        <p>Record priced sources for the current approved revision.</p>
      </div>
      <Link to={`${parent}/quotes`}>Back to quotations</Link>
    </header>
  );
  if (query.isPending)
    return (
      <>
        {heading}
        <Loading />
      </>
    );
  if (query.error)
    return (
      <>
        {heading}
        <ErrorNotice error={query.error} />
      </>
    );
  const current = query.data;
  const revisionId = current.currentRevisionId;
  if (current.orderStatus !== 'APPROVED' || revisionId === null)
    return (
      <>
        {heading}
        <Notice>
          Quotations can only be prepared for an approved request. This request is{' '}
          {current.orderStatus}.
        </Notice>
      </>
    );
  return (
    <>
      {heading}
      <Notice>
        Request {current.orderNumber}, revision ID {revisionId}. Sources and evidence apply to this
        revision only.
      </Notice>
      <PreparationWorkspace key={revisionId} current={current} revisionId={revisionId} />
    </>
  );
}
