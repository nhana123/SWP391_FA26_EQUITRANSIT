import { useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { idSchema } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { Loading, Notice } from '../../shared/ui/common';
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
import { CommercialError, commercialWriteBlocked } from './commercial-errors';

function PreparationWorkspace({
  current,
  revisionId,
  reloadCase,
  readError,
}: {
  current: ManagerCase;
  revisionId: number;
  reloadCase: () => Promise<ManagerCase | undefined>;
  readError: unknown;
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
  const [writeError, setWriteError] = useState<unknown>(null);
  const blocked = commercialWriteBlocked(writeError) || commercialWriteBlocked(readError);
  const parent = quotationParent(session.role, current.orderId);

  async function reload() {
    const fresh = await reloadCase();
    if (!fresh) throw new Error('Current request could not be loaded.');
    setParentVersion(fresh.recordVersion);
    setWriteError(null);
    setNotice('Current request loaded. Review the retained form before submitting again.');
  }
  if (writeError instanceof ApiError && [401, 403, 404].includes(writeError.status)) {
    return (
      <CommercialError
        error={writeError}
        backTo={session.role === 'MANAGER' ? '/manager/requests' : '/staff/cases'}
      />
    );
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
          setWriteError(null);
          await refreshPreparationCase(session.generation, current.orderId);
        }}
        onReload={reload}
        onFailure={setWriteError}
        disabled={blocked}
      />
      <EvidenceEditor
        rows={evidence}
        onChange={setEvidence}
        offers={offers}
        quoteValidUntil={validUntil.trim() || null}
        disabled={blocked}
        serverFields={writeError instanceof ApiError ? writeError.fields : {}}
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
        onReload={reload}
        onFailure={setWriteError}
        disabled={blocked}
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
  if (
    query.error &&
    (!query.data ||
      (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)))
  )
    return (
      <>
        {heading}
        <CommercialError
          error={query.error}
          backTo={session.role === 'MANAGER' ? '/manager/requests' : '/staff/cases'}
        />
        {query.error instanceof ApiError && query.error.status === 503 && (
          <button type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        )}
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
      <CommercialError
        error={query.error}
        backTo={session.role === 'MANAGER' ? '/manager/requests' : '/staff/cases'}
      />
      {query.error instanceof ApiError && query.error.status === 503 && (
        <button type="button" onClick={() => void query.refetch()}>
          Try again
        </button>
      )}
      <Notice>
        Request {current.orderNumber}, revision ID {revisionId}. Sources and evidence apply to this
        revision only.
      </Notice>
      <PreparationWorkspace
        key={`${session.generation}-${orderId}-${revisionId}`}
        current={current}
        revisionId={revisionId}
        readError={query.error}
        reloadCase={async () => {
          const result = await query.refetch();
          if (result.error) throw result.error;
          return result.data;
        }}
      />
    </>
  );
}
