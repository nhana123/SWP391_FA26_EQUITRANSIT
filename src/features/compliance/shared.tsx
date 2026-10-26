import { EmptyState } from '../../components/ui/Primitives';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice, Pagination } from '../../shared/ui/common';
import { COMPLIANCE_PAGE_SIZE, complianceApi } from './api';
import {
  blockerText,
  phaseLabels,
  phases,
  type ComplianceDocument,
  type Overview,
  type Phase,
} from './contracts';
import { blobUrl } from './files';
import { complianceKeys, type Pinned } from './hooks';
import './compliance.css';

export const schemaPending = (error: unknown) => error instanceof ApiError && error.status === 503;

export function DeploymentNotice({ retry }: { retry: () => void }) {
  return (
    <div className="notice" role="status">
      <p>
        Legal compliance is not deployed on this server yet (database migration 009 is pending).
        This is not an empty checklist.
      </p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

export function PhaseTabs({ phase, onChange }: { phase: Phase; onChange: (p: Phase) => void }) {
  const phaseStepNames: Record<Phase, { step: string; vi: string }> = {
    PRE_EXPORT: { step: 'Chặng 1', vi: 'Thủ tục Xuất cảnh' },
    ARRIVAL: { step: 'Chặng 2', vi: 'Cửa khẩu & Nhập cảnh' },
    QUARANTINE_RELEASE: { step: 'Chặng 3', vi: 'Hoàn tất Kiểm dịch' },
  };

  return (
    <nav className="actions compliance-tabs" aria-label="Compliance phases" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, margin: '20px 0' }}>
      {phases.map((p) => {
        const active = phase === p;
        const info = phaseStepNames[p];
        return (
          <button
            key={p}
            type="button"
            aria-pressed={active}
            aria-label={phaseLabels[p]}
            onClick={() => onChange(p)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '14px 18px',
              borderRadius: 12,
              background: active ? '#072318' : '#ffffff',
              color: active ? '#ffffff' : '#334155',
              border: active ? '1.5px solid #10b981' : '1px solid #e2e8f0',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textAlign: 'left',
              boxShadow: active ? '0 4px 14px rgba(7, 35, 24, 0.15)' : 'none',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: active ? '#34d399' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {info.step}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, color: active ? '#ffffff' : '#0f172a' }}>
              {info.vi}
            </div>
            <div style={{ fontSize: 12, color: active ? '#a7f3d0' : '#64748b', marginTop: 2 }}>
              ({phaseLabels[p]})
            </div>
          </button>
        );
      })}
    </nav>
  );
}

/** Shown when the case changed after the user started reviewing it. */
export function StaleBanner({ pinned, latest }: { pinned: Pinned; latest: string | undefined }) {
  if (!pinned.changed || !latest) return null;
  return (
    <div className="notice error" role="alert">
      <p>
        This case changed since you opened it. Reload and review the current checklist before any
        legal action.
      </p>
      <button type="button" onClick={() => pinned.adopt(latest)}>
        Reload and review
      </button>
    </div>
  );
}

export function ReadinessCard({ overview }: { overview: Overview }) {
  const r = overview.readiness;
  if (!r) return null;
  const isCleared = r.status === 'READY';

  return (
    <section
      className="card"
      aria-label={`${phaseLabels[r.phase]} readiness`}
      style={{
        borderRadius: 14,
        border: isCleared ? '1px solid #a7f3d0' : '1px solid #fde68a',
        borderLeft: isCleared ? '5px solid #10b981' : '5px solid #f59e0b',
        background: isCleared ? '#f0fdf4' : '#fffbeb',
        padding: '20px 24px',
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{isCleared ? '✅' : '⏳'}</span>
          <span>{phaseLabels[r.phase]}:</span>
          <StatusBadge status={isCleared ? 'Cleared' : 'Pending'}>
            {isCleared ? 'Cleared' : 'Pending'}
          </StatusBadge>
        </h2>

        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 9999,
            background: isCleared ? '#ecfdf5' : '#fef3c7',
            color: isCleared ? '#065f46' : '#92400e',
            border: isCleared ? '1px solid #a7f3d0' : '1px solid #fde68a',
          }}
        >
          {isCleared ? 'Đã đủ điều kiện qua chặng' : 'Chờ hoàn tất thẩm định'}
        </span>
      </div>

      <p style={{ margin: '8px 0 0 0', fontSize: 13.5, color: '#475569', lineHeight: 1.5 }}>
        {isCleared
          ? 'Tất cả các tài liệu và điều kiện kiểm dịch của chặng này đã được chuyên viên kiểm tra và chấp thuận.'
          : 'Chặng này đang trong quá trình tiếp nhận tài liệu và xét duyệt quy chế kiểm dịch. Vui lòng hoàn tất nộp các giấy tờ theo danh mục bên dưới.'}
      </p>

      <p className="muted" style={{ fontSize: 12, color: '#64748b', margin: '8px 0 0 0' }}>
        Revision ID {overview.revisionId}. Checked {displayDate(r.asOf)}
        {r.expiresAt && `; valid until ${displayDate(r.expiresAt)}`}. Each phase is cleared
        separately — clearing one never clears another.
      </p>

      {r.blockers.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #cbd5e1' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
            Điều kiện cần hoàn tất trước khi phê duyệt chặng này:
          </div>
          <ul aria-label="Blockers" style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
            {r.blockers.map((b) => (
              <li key={b}>
                {blockerText(b)} <small style={{ color: '#94a3b8' }}>({b})</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Loads private content on demand; PDFs are downloads, never inline HTML. */
export function FileViewer({
  orderId,
  fileKey,
  label = 'View file',
}: {
  orderId: number;
  fileKey: string;
  label?: string;
}) {
  const { generation } = useSession()!;
  const [open, setOpen] = useState(false);
  const file = useQuery({
    queryKey: complianceKeys.file(generation, orderId, fileKey),
    queryFn: ({ signal }) => complianceApi.file(orderId, fileKey, signal),
    enabled: open,
    retry: false,
    gcTime: 0,
  });
  const url = useMemo(
    () => (file.data ? blobUrl(file.data.contentBase64, file.data.contentType) : null),
    [file.data],
  );
  // Release the private content as soon as it is no longer shown.
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  if (file.isPending) return <Loading />;
  if (file.error) return <ErrorNotice error={file.error} />;
  if (!url) return null;
  return file.data.contentType.startsWith('image/') ? (
    <img className="compliance-preview" src={url} alt={file.data.fileName} />
  ) : (
    <a href={url} download={file.data.fileName}>
      Download {file.data.fileName}
    </a>
  );
}

export function DocumentsSection({
  orderId,
  documents,
  page,
  onPage,
  action,
}: {
  orderId: number;
  documents: {
    data?: ComplianceDocument[];
    isPending: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  page: number;
  onPage: (page: number) => void;
  action?: (d: ComplianceDocument) => ReactNode;
}) {
  return (
    <section className="card" aria-labelledby="documents-heading">
      <h2 id="documents-heading">Document versions</h2>
      <p className="muted">
        Every upload is a new, immutable version. Older versions and reviews are kept.
      </p>
      {documents.isPending ? (
        <Loading />
      ) : schemaPending(documents.error) ? (
        <DeploymentNotice retry={() => void documents.refetch()} />
      ) : documents.error ? (
        <ErrorNotice error={documents.error} />
      ) : !documents.data!.length ? (
        <EmptyState title="No documents uploaded yet." />
      ) : (
        <div className="table-scroll">
          <table aria-label="Document versions">
            <thead>
              <tr>
                <th scope="col">Version ID</th>
                <th scope="col">Type</th>
                <th scope="col">Version</th>
                <th scope="col">Issued</th>
                <th scope="col">Expires</th>
                <th scope="col">State</th>
                <th scope="col">File</th>
                {action && <th scope="col">Action</th>}
              </tr>
            </thead>
            <tbody>
              {documents.data!.map((d) => (
                <tr key={d.documentVersionId}>
                  <td>{d.documentVersionId}</td>
                  <td>{d.documentType}</td>
                  <td>{d.versionNo}</td>
                  <td>{d.issuedDate ?? 'Not recorded'}</td>
                  <td>{d.expiryDate ?? 'Not recorded'}</td>
                  <td>
                    {d.revokedAt ? (
                      <span className="badge warn">Revoked {displayDate(d.revokedAt)}</span>
                    ) : (
                      <span className="badge">Current</span>
                    )}
                  </td>
                  <td>
                    {d.fileKey ? (
                      <FileViewer orderId={orderId} fileKey={d.fileKey} />
                    ) : (
                      'Legacy external file — not available'
                    )}
                  </td>
                  {action && <td>{action(d)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(documents.data?.length === COMPLIANCE_PAGE_SIZE || page > 0) && (
        <Pagination
          page={page}
          pages={documents.data?.length === COMPLIANCE_PAGE_SIZE ? page + 2 : page + 1}
          onChange={onPage}
        />
      )}
    </section>
  );
}

export function OverviewState({
  query,
  children,
}: {
  query: { data?: Overview; isPending: boolean; error: unknown; refetch: () => unknown };
  children: (overview: Overview) => ReactNode;
}) {
  if (query.isPending) return <Loading />;
  if (schemaPending(query.error)) return <DeploymentNotice retry={() => void query.refetch()} />;
  if (query.error && !query.data)
    return (
      <ErrorNotice error={query.error}>
        {query.error instanceof ApiError && [403, 404].includes(query.error.status) ? (
          <p>This case's legal checklist is not available to you.</p>
        ) : (
          <button type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        )}
      </ErrorNotice>
    );
  return <>{children(query.data!)}</>;
}

export function CustomerSafeNotice() {
  return (
    <Notice>
      Legal readiness is a specialist assessment of the evidence recorded here. It does not issue a
      government permit, confirm payment, or authorize departure.
    </Notice>
  );
}
