import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { idSchema } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { Notice, Pagination } from '../../shared/ui/common';
import { COMPLIANCE_PAGE_SIZE } from './api';
import { phaseLabels, phases, type Phase } from './contracts';
import { customerStep, PhaseList } from './CustomerChecklist';
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
      <nav className="actions dossier-tabs" aria-label="Legal document views" style={{ marginBottom: 16 }}>
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
          <p className="muted" style={{ margin: '0 0 16px 0', fontSize: 13.5, color: '#64748b' }}>
            Kho lưu trữ các giấy tờ căn cước của cá thể ngựa này (bao gồm cả các bản cũ). Quý khách có thể
            chọn sử dụng lại giấy tờ đã có trên hệ thống mà không cần scan hay chụp ảnh lại từ đầu.
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
              const totalCount = o.requirements.length;
              const approvedCount = o.requirements.filter((r) => customerStep(r) === 'PASSED').length;
              const percent = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;

              return (
                <>
                  {/* Progress Bar Header Card */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: 14,
                      border: '1px solid #e2e8f0',
                      padding: '20px 24px',
                      marginBottom: 20,
                      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Tiến Độ Thẩm Định Hồ Sơ ({phaseLabels[phase]})
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                          {approvedCount}/{totalCount} tài liệu đã phê duyệt
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 26, fontWeight: 800, color: percent === 100 ? '#059669' : '#d97706' }}>
                          {percent}%
                        </span>
                      </div>
                    </div>

                    <div style={{ height: 10, background: '#f1f5f9', borderRadius: 9999, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${percent}%`,
                          background: percent === 100
                            ? 'linear-gradient(90deg, #10b981, #059669)'
                            : 'linear-gradient(90deg, #f59e0b, #d97706)',
                          borderRadius: 9999,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  <ReadinessCard overview={o} />

                  <section className="card" aria-labelledby="requirements-heading" style={{ borderRadius: 14, padding: '24px 28px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <h2 id="requirements-heading" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                          Required documents
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginLeft: 8 }}>
                            — Danh Mục Giấy Tờ Cần Cung Cấp
                          </span>
                        </h2>
                        <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
                          Chuyên viên pháp lý sẽ căn cứ vào các tài liệu này để cấp chứng thư đủ điều kiện bay.
                        </p>
                      </div>

                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 9999,
                          background: percent === 100 ? '#ecfdf5' : '#fef3c7',
                          color: percent === 100 ? '#065f46' : '#92400e',
                          border: `1px solid ${percent === 100 ? '#a7f3d0' : '#fde68a'}`,
                        }}
                      >
                        {approvedCount}/{totalCount} Hoàn thành
                      </span>
                    </div>

                    {!o.requirements.length ? (
                      <p style={{ color: '#64748b', fontStyle: 'italic', margin: '20px 0' }}>
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
          <small className="eyebrow">LEGAL COMPLIANCE &amp; VERIFICATION</small>
          <h1>Legal documents</h1>
          <p>
            Send each document your Specialist requires and follow its review. (Nộp giấy kiểm dịch và theo dõi tiến độ phê duyệt).
          </p>
        </div>
        <Link to={`/customer/requests/${orderId}`} className="button" style={{ fontSize: 13 }}>
          ← Back to the request
        </Link>
      </header>
      <CustomerSafeNotice />
      <CustomerWorkspace key={`${session.generation}/${orderId}`} orderId={orderId} />
    </>
  );
}
