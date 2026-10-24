import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/ui/Icons';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ApiError } from '../../shared/api/client';
import {
  filesApi,
  storedFileProblem,
  storedFileTypes,
  type StoredFile,
} from '../../shared/api/files';
import { displayDate, type FieldErrors } from '../../shared/lib/validation';
import { DateInput } from '../../shared/ui/DateTimeInput';
import { Field, Loading } from '../../shared/ui/common';
import { complianceApi } from './api';
import { phaseLabels, phases, type Overview, type Requirement } from './contracts';
import { CommandForm, useDocuments, useOverview, usePinnedVersion, type Pinned } from './hooks';
import { legalStatuses } from './link';
import { schemaPending, StaleBanner } from './shared';
import { StandardFormTemplate } from './StandardFormTemplate';
import { validateUploadSubmit } from './validation';
import './compliance.css';

type Step = 'ACTION' | 'REVIEW' | 'PASSED' | 'RESUBMIT';
const steps: Record<Step, { label: string; badge: string }> = {
  ACTION: { label: 'Action required', badge: 'PENDING' },
  REVIEW: { label: 'Submitted · under review', badge: 'PENDING_REVIEW' },
  PASSED: { label: 'Approved', badge: 'APPROVED' },
  RESUBMIT: { label: 'Send a new version', badge: 'REJECTED' },
};
/** Where one required document stands from the customer's side. */
export function customerStep(r: Requirement): Step {
  // An expired or revoked document needs a new version whatever its review said.
  if (r.status === 'EXPIRED' || r.status === 'REVOKED') return 'RESUBMIT';
  if (!r.submissionId) return 'ACTION';
  if (!r.decision) return 'REVIEW';
  return r.decision === 'APPROVED' ? 'PASSED' : 'RESUBMIT';
}
const readable = (code: string) =>
  code.charAt(0) + code.slice(1).toLowerCase().replaceAll('_', ' ');

/** Six months ahead, as a calendar date in UTC+07:00; the user can change it. */
export function suggestedExpiry(now = Date.now(), months = 6) {
  const date = new Date(now + 7 * 3_600_000);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/**
 * Stores the file, creates its version and submits it to the requirement in
 * one server transaction. A retry after an uncertain failure resends the same
 * operation ID, so the server replays instead of recording twice. The
 * assigned Specialist may use it to upload on the customer's behalf.
 */
export function SendDocumentForm({
  orderId,
  pinned,
  requirement,
  onClose,
  onBehalf = false,
}: {
  orderId: number;
  pinned: Pinned;
  requirement: Requirement;
  onClose: () => void;
  onBehalf?: boolean;
}) {
  // Papers this horse already has of the required type: reused, never re-scanned.
  const documents = useDocuments(orderId, 0);
  const onFile = (documents.data ?? []).filter(
    (d) => d.documentType === requirement.documentType && !d.revokedAt && d.fileKey,
  );
  const [source, setSource] = useState<'existing' | 'upload'>('upload');
  const [existingVersionId, setExistingVersionId] = useState('');
  const [stored, setStored] = useState<StoredFile | null>(null);
  const [uploadProblem, setUploadProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [issuedDate, setIssuedDate] = useState(() => suggestedExpiry(Date.now(), 0));
  const [expiryDate, setExpiryDate] = useState(suggestedExpiry);
  const [documentNumber, setDocumentNumber] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  // Offer the paper on file first when there is one.
  const [seenOnFile, setSeenOnFile] = useState(false);
  if (!seenOnFile && onFile.length) {
    setSeenOnFile(true);
    setSource('existing');
    setExistingVersionId(String(onFile[0].documentVersionId));
  }
  async function choose(selected: File | undefined) {
    setStored(null);
    setUploadProblem(null);
    if (!selected) return;
    const issue = storedFileProblem(selected);
    if (issue) return setUploadProblem(issue);
    setUploading(true);
    try {
      setStored(await filesApi.upload(selected));
    } catch (e) {
      setUploadProblem(
        e instanceof ApiError ? e.message : 'The file could not be uploaded. Choose it again.',
      );
    } finally {
      setUploading(false);
    }
  }
  const verb = onBehalf ? 'Upload for the customer' : 'Send';
  return (
    <CommandForm
      label={`${verb} ${requirement.documentType}`}
      title={
        onBehalf
          ? `Upload the ${readable(requirement.documentType).toLowerCase()} for the customer`
          : `Send the ${readable(requirement.documentType).toLowerCase()} to your Specialist`
      }
      pinned={pinned}
      submitLabel={onBehalf ? 'Upload and submit' : 'Send to the Specialist'}
      busy={uploading}
      fieldErrors={errors}
      send={(body) => complianceApi.uploadAndSubmit(orderId, requirement.requirementId, body)}
      build={() => {
        const result = validateUploadSubmit(
          source === 'existing'
            ? { source, existingVersionId }
            : {
                source,
                fileKey: stored?.fileKey ?? null,
                uploadProblem,
                documentNumber,
                issuedDate,
                expiryDate,
              },
        );
        setErrors(result.errors);
        return result.input;
      }}
      onDone={onClose}
    >
      {(locked, fields) => (
        <>
          <fieldset className="send-source" disabled={locked}>
            <legend>How do you want to send it?</legend>
            <label className="horse-choice">
              <input
                type="radio"
                name={`source-${requirement.requirementId}`}
                checked={source === 'existing'}
                disabled={!onFile.length}
                onChange={() => setSource('existing')}
              />
              <span>
                <strong>Choose from this horse&apos;s papers</strong>
                <small>
                  {onFile.length
                    ? 'Already on file: nothing to scan again.'
                    : 'No paper of this type is on file yet.'}
                </small>
              </span>
            </label>
            <label className="horse-choice">
              <input
                type="radio"
                name={`source-${requirement.requirementId}`}
                checked={source === 'upload'}
                onChange={() => setSource('upload')}
              />
              <span>
                <strong>Upload a new file</strong>
                <small>PDF, PNG or JPEG, at most 10 MB.</small>
              </span>
            </label>
          </fieldset>
          {source === 'existing' ? (
            <fieldset className="form-grid" disabled={locked}>
              <Field label="Paper on file" error={fields.existingDocumentVersionId}>
                {(id) => (
                  <select
                    id={id}
                    value={existingVersionId}
                    onChange={(e) => setExistingVersionId(e.target.value)}
                  >
                    {onFile.map((d) => (
                      <option key={d.documentVersionId} value={d.documentVersionId}>
                        Version {d.versionNo}
                        {d.expiryDate ? ` · valid until ${d.expiryDate}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </fieldset>
          ) : (
            <fieldset className="form-grid" disabled={locked}>
              <Field label="File" error={fields.file ?? fields.fileKey}>
                {(id) => (
                  <input
                    id={id}
                    type="file"
                    accept={storedFileTypes}
                    onChange={(e) => void choose(e.target.files?.[0])}
                  />
                )}
              </Field>
              {uploading && <p role="status">Uploading…</p>}
              {stored && (
                <p className="send-stored" role="status">
                  <Icon name="file" size={16} /> {stored.fileName} ·{' '}
                  {Math.max(1, Math.round(stored.fileSizeBytes / 1024))} KB uploaded
                </p>
              )}
              <Field label="Issued on" error={fields.issuedDate}>
                {(id) => <DateInput id={id} value={issuedDate} onChange={setIssuedDate} />}
              </Field>
              <Field
                label="Valid until"
                hint="Filled in six months ahead; change it to the expiry printed on the document."
                error={fields.expiryDate}
              >
                {(id) => <DateInput id={id} value={expiryDate} onChange={setExpiryDate} />}
              </Field>
              <Field label="Certificate number (optional)" error={fields.documentNumber}>
                {(id) => (
                  <input
                    id={id}
                    maxLength={50}
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                  />
                )}
              </Field>
            </fieldset>
          )}
          <button type="button" onClick={onClose} disabled={locked}>
            Cancel
          </button>
        </>
      )}
    </CommandForm>
  );
}

export function PhaseList({
  orderId,
  overview,
  pinned,
  open,
  onOpen,
}: {
  orderId: number;
  overview: Overview;
  pinned: Pinned;
  open: number | null;
  onOpen: (id: number | null) => void;
}) {
  const [form, setForm] = useState<string | null>(null);
  return (
    <>
      {form && <StandardFormTemplate typeCode={form} onClose={() => setForm(null)} />}
      <ul
        className="legal-checklist"
        aria-label={`${phaseLabels[overview.readiness.phase]} documents`}
      >
        {overview.requirements.map((r) => {
          const step = customerStep(r);
          const actionable =
            (step === 'ACTION' || step === 'RESUBMIT') && r.status !== 'SUPERSEDED';
          return (
            <li key={r.requirementId} className={`legal-item ${step.toLowerCase()}`}>
              <div className="legal-item-head">
                <strong>{readable(r.documentType)}</strong>
                <StatusBadge status={steps[step].badge}>{steps[step].label}</StatusBadge>
              </div>
              {r.instructions && <p className="muted">{r.instructions}</p>}
              <button
                type="button"
                className="template-open"
                onClick={() => setForm(r.documentType)}
                aria-label={`View the standard form for ${r.documentType}`}
              >
                📄 View the standard form
              </button>
              {r.attachment && (
                <p className="muted">
                  Sent: {r.attachment.fileName}
                  {r.attachment.expiresAt &&
                    ` · valid until ${displayDate(r.attachment.expiresAt)}`}
                </p>
              )}
              {step === 'RESUBMIT' &&
                (r.status === 'EXPIRED' || r.status === 'REVOKED' ? (
                  <p className="legal-feedback" role="note">
                    This document is {r.status === 'EXPIRED' ? 'no longer valid' : 'revoked'}. Send
                    a current version.
                  </p>
                ) : (
                  <p className="legal-feedback" role="note">
                    <strong>Specialist's note:</strong>{' '}
                    {r.feedback ?? 'This version was not accepted. Send a new version.'}
                  </p>
                ))}
              {actionable &&
                (open === r.requirementId ? (
                  <SendDocumentForm
                    key={r.requirementId}
                    orderId={orderId}
                    pinned={pinned}
                    requirement={r}
                    onClose={() => onOpen(null)}
                  />
                ) : (
                  <button
                    type="button"
                    className="primary"
                    disabled={pinned.changed}
                    onClick={() => onOpen(r.requirementId)}
                    aria-label={`Send ${r.documentType} to the Specialist`}
                  >
                    {step === 'RESUBMIT' ? 'Send a new version' : 'Upload & send'}
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * The documents the Specialist requires for this request, across the three
 * legal phases, with one upload-and-send action per document. Shown on the
 * customer's request page once legal work has started.
 */
export function CustomerLegalChecklist({
  orderId,
  orderStatus,
}: {
  orderId: number;
  orderStatus: string;
}) {
  if (!legalStatuses.includes(orderStatus)) return null;
  return <Checklist orderId={orderId} />;
}

function Checklist({ orderId }: { orderId: number }) {
  const overviews = [
    useOverview(orderId, 'PRE_EXPORT', 0),
    useOverview(orderId, 'ARRIVAL', 0),
    useOverview(orderId, 'QUARANTINE_RELEASE', 0),
  ];
  const latest = overviews.find((o) => o.data)?.data?.recordVersion;
  const pinned = usePinnedVersion(orderId, latest);
  const [open, setOpen] = useState<number | null>(null);
  // Not deployed or not readable: the full legal page explains it.
  if (overviews.some((o) => schemaPending(o.error)) || overviews.every((o) => o.error)) return null;
  const loaded = overviews.flatMap((o) => (o.data ? [o.data] : []));
  const items = loaded.flatMap((o) => o.requirements);
  const todo = items.filter((r) => ['ACTION', 'RESUBMIT'].includes(customerStep(r))).length;
  return (
    <section className="card" aria-labelledby="legal-checklist-heading">
      <header className="legal-checklist-header">
        <div>
          <small className="eyebrow">LEGAL DOCUMENTS</small>
          <h2 id="legal-checklist-heading">Documents your Specialist needs</h2>
        </div>
        {items.length > 0 && (
          <span className={`badge ${todo ? 'warn' : ''}`}>
            {todo ? `${todo} to send` : 'Nothing to send'}
          </span>
        )}
      </header>
      <StaleBanner pinned={pinned} latest={latest} />
      {overviews.some((o) => o.isPending) ? (
        <Loading />
      ) : !items.length ? (
        <p className="muted">
          Your Specialist has not listed the documents for this route yet. They appear here as soon
          as the route checklist is recorded.
        </p>
      ) : (
        phases.map((phase, i) => {
          const o = overviews[i].data;
          if (!o?.requirements.length) return null;
          return (
            <div key={phase} className="legal-phase">
              <h3>{phaseLabels[phase]}</h3>
              <PhaseList
                orderId={orderId}
                overview={o}
                pinned={pinned}
                open={open}
                onOpen={setOpen}
              />
            </div>
          );
        })
      )}
      <p>
        <Link to={`/customer/requests/${orderId}/compliance`}>
          Open all legal documents and their history
        </Link>
      </p>
    </section>
  );
}
