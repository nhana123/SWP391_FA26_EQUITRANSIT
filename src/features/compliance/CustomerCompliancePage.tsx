import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { idSchema } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { Notice, Pagination } from '../../shared/ui/common';
import { COMPLIANCE_PAGE_SIZE } from './api';
import { phases, type Phase } from './contracts';
import { PhaseList } from './CustomerChecklist';
import { useDocuments, useOverview, usePinnedVersion } from './hooks';
import {
  CustomerSafeNotice,
  DocumentsSection,
  OverviewState,
  PhaseTabs,
  ReadinessCard,
  StaleBanner,
} from './shared';

export function usePhase() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('phase');
  const phase = (phases as readonly string[]).includes(raw ?? '') ? (raw as Phase) : 'PRE_EXPORT';
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0);
  return {
    phase,
    page,
    setPhase: (next: Phase) => setParams({ phase: next }),
    setPage: (next: number) => setParams({ phase, page: String(next) }),
  };
}

/**
 * One card per required document: its state, the Specialist's note when it was
 * sent back, and a single choose-file-and-submit action. The server creates the
 * checklist itself, so there is nothing to set up first.
 */
function CustomerWorkspace({ orderId }: { orderId: number }) {
  const { phase, page, setPhase, setPage } = usePhase();
  const [docPage, setDocPage] = useState(0);
  const overview = useOverview(orderId, phase, page);
  const documents = useDocuments(orderId, docPage);
  const pinned = usePinnedVersion(orderId, overview.data?.recordVersion);
  const [open, setOpen] = useState<number | null>(null);
  // Two cabinets: this journey's checklist, and the papers the horse already has.
  const [tab, setTab] = useState<'checklist' | 'papers'>('checklist');
  return (
    <>
      <nav className="actions dossier-tabs" aria-label="Legal document views">
        <button
          type="button"
          aria-pressed={tab === 'checklist'}
          onClick={() => setTab('checklist')}
        >
          ✈️ Journey checklist
        </button>
        <button type="button" aria-pressed={tab === 'papers'} onClick={() => setTab('papers')}>
          🐎 Horse papers
        </button>
      </nav>
      {tab === 'papers' ? (
        <>
          <p className="muted">
            Every paper you have sent for this horse, oldest versions included. A paper on file can
            be reused for a requirement without scanning it again.
          </p>
          <DocumentsSection
            orderId={orderId}
            documents={documents}
            page={docPage}
            onPage={setDocPage}
          />
        </>
      ) : (
        <>
          <PhaseTabs
            phase={phase}
            onChange={(p) => {
              setOpen(null);
              setPhase(p);
            }}
          />
          <StaleBanner pinned={pinned} latest={overview.data?.recordVersion} />
          <OverviewState query={overview}>
            {(o) => {
              const pages = Math.ceil(o.totalElements / COMPLIANCE_PAGE_SIZE);
              return (
                <>
                  <ReadinessCard overview={o} />
                  <section className="card" aria-labelledby="requirements-heading">
                    <h2 id="requirements-heading">Required documents</h2>
                    {!o.requirements.length ? (
                      <p>
                        No requirements yet. The specialist prepares the checklist from sourced
                        rules for this route; until then the phase stays pending.
                      </p>
                    ) : (
                      <PhaseList
                        orderId={orderId}
                        overview={o}
                        pinned={pinned}
                        open={open}
                        onOpen={setOpen}
                      />
                    )}
                    {(pages > 1 || page > 0) && (
                      <Pagination page={page} pages={pages} onChange={setPage} />
                    )}
                  </section>
                </>
              );
            }}
          </OverviewState>
        </>
      )}
    </>
  );
}

/** Owning Customer: legal checklist and one-step document submission. */
export function CustomerCompliancePage() {
  const session = useSession();
  const orderId = Number(useParams().id);
  if (!session) return null;
  if (session.role !== 'CUSTOMER')
    return <Notice>Only the owning customer can open this page.</Notice>;
  if (!idSchema.safeParse(orderId).success) return <Notice>This request is unavailable.</Notice>;
  return (
    <>
      <header className="page-heading">
        <div>
          <small className="eyebrow">LEGAL DOCUMENTS</small>
          <h1>Legal documents</h1>
          <p>Send each document your Specialist requires and follow its review.</p>
        </div>
        <Link to={`/customer/requests/${orderId}`}>Back to the request</Link>
      </header>
      <CustomerSafeNotice />
      <CustomerWorkspace key={`${session.generation}/${orderId}`} orderId={orderId} />
    </>
  );
}
