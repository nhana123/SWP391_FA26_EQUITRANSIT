import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { idSchema } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { ErrorNotice, Loading, Notice } from '../../shared/ui/common';
import type { ManagerCase } from '../assessment/contracts';
import { quotationKeys } from './hooks';
import type { QuoteEvidence } from './mutation-contracts';
import { QuoteForm } from './quote-form';
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
  reloadCase,
}: {
  current: ManagerCase;
  revisionId: number;
  reloadCase: () => Promise<ManagerCase | undefined>;
}) {
  const session = useSession()!;
  const navigate = useNavigate();
  // Observed parent version; receipts advance it, an explicit reload adopts
  // the freshly read case. Writes never pick up a version on their own.
  const [parentVersion, setParentVersion] = useState(current.recordVersion);
  const [offers, setOffers] = useState<RecordedOffer[]>([]);
  const [evidence, setEvidence] = useState<QuoteEvidence[]>([]);
  const [validUntil, setValidUntil] = useState('');
  const [notice, setNotice] = useState('');
  const parent = quotationParent(session.role, current.orderId);

  async function reload() {
    const fresh = await reloadCase();
    if (fresh) setParentVersion(fresh.recordVersion);
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
          await refreshPreparationCase(session.generation, current.orderId);
        }}
        onReload={() => void reload()}
      />
      <EvidenceEditor
        rows={evidence}
        onChange={setEvidence}
        offers={offers}
        quoteValidUntil={validUntil.trim() || null}
        disabled={false}
      />
      <QuoteForm
        orderId={current.orderId}
        revisionId={revisionId}
        parentVersion={parentVersion}
        evidence={evidence}
        validUntil={validUntil}
        onValidUntil={setValidUntil}
        onCreated={async (quote) => {
          // The receipt may be a replay: re-read lists, detail and the case.
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: quotationKeys.all(session.generation) }),
            refreshPreparationCase(session.generation, current.orderId),
          ]);
          navigate(`${parent}/quotes/${quote.quote.quoteId}`);
        }}
        onReload={() => void reload()}
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
        <p>Record priced sources and prepare a new version for the current approved revision.</p>
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
      <PreparationWorkspace
        key={revisionId}
        current={current}
        revisionId={revisionId}
        reloadCase={async () => (await query.refetch()).data}
      />
    </>
  );
}
