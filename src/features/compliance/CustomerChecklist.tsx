import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { displayDate, type FieldErrors } from '../../shared/lib/validation';
import { DateInput } from '../../shared/ui/DateTimeInput';
import { Field, Loading } from '../../shared/ui/common';
import { complianceApi } from './api';
import { phaseLabels, phases, type FileInput, type Overview, type Requirement } from './contracts';
import { acceptedTypes, fileProblem, readFile } from './files';
import { CommandForm, useOverview, usePinnedVersion, type Pinned } from './hooks';
import { legalStatuses } from './link';
import { schemaPending, StaleBanner } from './shared';
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

/**
 * Stores the file, creates its version and submits it to the requirement in
 * one server transaction. A retry after an uncertain failure resends the same
 * operation ID, so the server replays instead of recording twice.
 */
function SendDocumentForm({
  orderId,
  pinned,
  requirement,
  onClose,
}: {
  orderId: number;
  pinned: Pinned;
  requirement: Requirement;
  onClose: () => void;
}) {
  const [file, setFile] = useState<FileInput | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [reading, setReading] = useState(false);
  async function choose(selected: File | undefined) {
    setFile(null);
    if (!selected) return setProblem(null);
    const issue = fileProblem(selected);
    setProblem(issue);
    if (issue) return;
    setReading(true);
    try {
      setFile(await readFile(selected));
    } catch {
      setProblem('The file could not be read. Choose it again.');
    } finally {
      setReading(false);
    }
  }
  return (
    <CommandForm
      label={`Send ${requirement.documentType}`}
      title={`Send the ${readable(requirement.documentType).toLowerCase()} to your Specialist`}
      pinned={pinned}
      submitLabel="Send to the Specialist"
      busy={reading}
      fieldErrors={errors}
      send={(body) => complianceApi.uploadAndSubmit(orderId, requirement.requirementId, body)}
      build={() => {
        const result = validateUploadSubmit({
          file,
          fileProblem: problem,
          expiryDate,
          referenceNumber,
        });
        setErrors(result.errors);
        return result.input;
      }}
      onDone={onClose}
    >
      {(locked, fields) => (
        <>
          <p className="muted">
            PDF, PNG or JPEG, at most 5 MiB. Your Specialist reviews exactly this file; earlier
            versions are kept.
          </p>
          <fieldset className="form-grid" disabled={locked}>
            <Field label="File" error={fields.file ?? fields.contentBase64 ?? fields.fileName}>
              {(id) => (
                <input
                  id={id}
                  type="file"
                  accept={acceptedTypes}
                  onChange={(e) => void choose(e.target.files?.[0])}
                />
              )}
            </Field>
            <Field
              label="Valid until"
              hint="The expiry date printed on the document."
              error={fields.expiryDate ?? fields.expiresAt}
            >
              {(id) => <DateInput id={id} value={expiryDate} onChange={setExpiryDate} />}
            </Field>
            <Field label="Certificate number (optional)" error={fields.referenceNumber}>
              {(id) => (
                <input
                  id={id}
                  maxLength={50}
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                />
              )}
            </Field>
          </fieldset>
          <button type="button" onClick={onClose} disabled={locked}>
            Cancel
          </button>
        </>
      )}
    </CommandForm>
  );
}

function PhaseList({
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
  return (
    <ul
      className="legal-checklist"
      aria-label={`${phaseLabels[overview.readiness.phase]} documents`}
    >
      {overview.requirements.map((r) => {
        const step = customerStep(r);
        const actionable = (step === 'ACTION' || step === 'RESUBMIT') && r.status !== 'SUPERSEDED';
        return (
          <li key={r.requirementId} className={`legal-item ${step.toLowerCase()}`}>
            <div className="legal-item-head">
              <strong>{readable(r.documentType)}</strong>
              <StatusBadge status={steps[step].badge}>{steps[step].label}</StatusBadge>
            </div>
            {r.instructions && <p className="muted">{r.instructions}</p>}
            {r.attachment && (
              <p className="muted">
                Sent: {r.attachment.fileName}
                {r.attachment.expiresAt && ` · valid until ${displayDate(r.attachment.expiresAt)}`}
              </p>
            )}
            {step === 'RESUBMIT' &&
              (r.status === 'EXPIRED' || r.status === 'REVOKED' ? (
                <p className="legal-feedback" role="note">
                  This document is {r.status === 'EXPIRED' ? 'no longer valid' : 'revoked'}. Send a
                  current version.
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
