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
  decisionLabels,
  phaseLabels,
  phases,
  type ComplianceDocument,
  type Overview,
  type Phase,
  type Requirement,
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
  return (
    <nav className="actions compliance-tabs" aria-label="Compliance phases">
      {phases.map((p) => (
        <button key={p} type="button" aria-pressed={phase === p} onClick={() => onChange(p)}>
          {phaseLabels[p]}
        </button>
      ))}
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
  return (
    <section className="card" aria-label={`${phaseLabels[r.phase]} readiness`}>
      <h2>
        {phaseLabels[r.phase]}:{' '}
        <StatusBadge status={r.status === 'READY' ? 'Cleared' : 'Pending'}>
          {r.status === 'READY' ? 'Cleared' : 'Pending'}
        </StatusBadge>
      </h2>
      <p className="muted">
        Revision ID {overview.revisionId}. Checked {displayDate(r.asOf)}
        {r.expiresAt && `; valid until ${displayDate(r.expiresAt)}`}. Each phase is cleared
        separately — clearing one never clears another.
      </p>
      {r.blockers.length > 0 && (
        <ul aria-label="Blockers">
          {r.blockers.map((b) => (
            <li key={b}>
              {blockerText(b)} <small>({b})</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RequirementsTable({
  overview,
  page,
  onPage,
  action,
}: {
  overview: Overview;
  page: number;
  onPage: (page: number) => void;
  action?: (r: Requirement) => ReactNode;
}) {
  const pages = Math.ceil(overview.totalElements / COMPLIANCE_PAGE_SIZE);
  return (
    <section className="card" aria-labelledby="requirements-heading">
      <h2 id="requirements-heading">Required documents</h2>
      {!overview.requirements.length ? (
        <p>
          No requirements yet. The specialist prepares the checklist from sourced rules for this
          route; until then the phase stays pending.
        </p>
      ) : (
        <div className="table-scroll">
          <table aria-label="Required documents">
            <thead>
              <tr>
                <th scope="col">Document type</th>
                <th scope="col">Checklist</th>
                <th scope="col">Submitted version</th>
                <th scope="col">Review</th>
                <th scope="col">Instructions</th>
                {action && <th scope="col">Action</th>}
              </tr>
            </thead>
            <tbody>
              {overview.requirements.map((r) => (
                <tr key={r.requirementId}>
                  <td>{r.documentType}</td>
                  <td>
                    <StatusBadge status={r.status}>{r.status}</StatusBadge>
                  </td>
                  <td>{r.documentVersionId ?? 'Not submitted'}</td>
                  <td>
                    {r.decision
                      ? decisionLabels[r.decision]
                      : r.submissionId
                        ? 'Awaiting review'
                        : '—'}
                  </td>
                  <td>{r.instructions ?? '—'}</td>
                  {action && <td>{action(r)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(pages > 1 || page > 0) && <Pagination page={page} pages={pages} onChange={onPage} />}
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
