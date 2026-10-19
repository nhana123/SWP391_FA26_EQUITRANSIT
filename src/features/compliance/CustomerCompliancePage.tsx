import { DateInput } from '../../shared/ui/DateTimeInput';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { idSchema } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { type FieldErrors } from '../../shared/lib/validation';
import { Field, Notice } from '../../shared/ui/common';
import { complianceApi } from './api';
import { phases, type FileInput, type Phase, type Requirement } from './contracts';
import { acceptedTypes, fileProblem, readFile } from './files';
import { CommandForm, useDocuments, useOverview, usePinnedVersion, type Pinned } from './hooks';
import {
  CustomerSafeNotice,
  DocumentsSection,
  OverviewState,
  PhaseTabs,
  ReadinessCard,
  RequirementsTable,
  StaleBanner,
} from './shared';
import { validateUpload } from './validation';

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

function UploadForm({
  orderId,
  pinned,
  types,
}: {
  orderId: number;
  pinned: Pinned;
  types: string[];
}) {
  const [documentType, setDocumentType] = useState(types[0] ?? '');
  const [file, setFile] = useState<FileInput | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState('');
  const [reading, setReading] = useState(false);
  async function choose(selected: File | undefined) {
    setFile(null);
    setNotice('');
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
      label="Upload document version"
      title="Upload a document"
      pinned={pinned}
      submitLabel="Upload new version"
      busy={reading}
      send={(body) => complianceApi.upload(orderId, body)}
      fieldErrors={errors}
      build={() => {
        const result = validateUpload({
          documentType,
          file,
          fileProblem: problem,
          issuedDate,
          expiryDate,
          documentNumber,
        });
        setErrors(result.errors);
        return result.input;
      }}
      onDone={(receipt) =>
        setNotice(
          `Uploaded as document version ${receipt.entityId}. It is not submitted yet: submit it to the matching requirement above.`,
        )
      }
    >
      {(locked, fields) => (
        <>
          {notice && <Notice>{notice}</Notice>}
          <p className="muted">
            PDF, PNG or JPEG, at most 5 MiB. A new upload never replaces earlier versions.
          </p>
          <fieldset className="form-grid" disabled={locked}>
            <Field
              label="Document type"
              hint="Code from the requirement, e.g. HEALTH_CERTIFICATE."
              error={fields.documentType}
            >
              {(id) => (
                <input
                  id={id}
                  list="compliance-document-types"
                  maxLength={50}
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                />
              )}
            </Field>
            <datalist id="compliance-document-types">
              {types.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
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
            <Field label="Issued date" error={fields.issuedDate}>
              {(id) => <DateInput id={id} value={issuedDate} onChange={setIssuedDate} />}
            </Field>
            <Field label="Expiry date" error={fields.expiryDate}>
              {(id) => <DateInput id={id} value={expiryDate} onChange={setExpiryDate} />}
            </Field>
            <Field label="Document number (optional)" error={fields.documentNumber}>
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
        </>
      )}
    </CommandForm>
  );
}

function SubmitForm({
  orderId,
  pinned,
  requirement,
  versions,
  onClose,
}: {
  orderId: number;
  pinned: Pinned;
  requirement: Requirement;
  versions: { documentVersionId: number; versionNo: number }[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(
    versions[0] ? String(versions[0].documentVersionId) : '',
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label={`Submit ${requirement.documentType}`}
      title={`Submit a version for ${requirement.documentType}`}
      pinned={pinned}
      submitLabel="Submit for review"
      send={(body) => complianceApi.submit(orderId, requirement.requirementId, body)}
      fieldErrors={errors}
      build={() => {
        const next: FieldErrors = {};
        if (!selected)
          next.documentVersionId = 'Upload and choose a current version of this type first.';
        setErrors(next);
        return selected ? { documentVersionId: Number(selected) } : null;
      }}
      onDone={onClose}
    >
      {(locked, fields) => (
        <>
          <p className="muted">
            The specialist reviews exactly the version you submit. Reusing a version still needs a
            new review.
          </p>
          <fieldset disabled={locked}>
            <Field label="Document version" error={fields.documentVersionId}>
              {(id) => (
                <select id={id} value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {!versions.length && <option value="">No current version of this type</option>}
                  {versions.map((v) => (
                    <option key={v.documentVersionId} value={v.documentVersionId}>
                      Version {v.versionNo} (ID {v.documentVersionId})
                    </option>
                  ))}
                </select>
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

function CustomerWorkspace({ orderId }: { orderId: number }) {
  const { phase, page, setPhase, setPage } = usePhase();
  const [docPage, setDocPage] = useState(0);
  const overview = useOverview(orderId, phase, page);
  const documents = useDocuments(orderId, docPage);
  const pinned = usePinnedVersion(orderId, overview.data?.recordVersion);
  const [target, setTarget] = useState<Requirement | null>(null);
  const types = [...new Set(overview.data?.requirements.map((r) => r.documentType) ?? [])];
  const current = (documentType: string) =>
    (documents.data ?? []).filter(
      (d) => d.documentType === documentType && !d.revokedAt && d.fileKey,
    );
  return (
    <>
      <PhaseTabs
        phase={phase}
        onChange={(p) => {
          setTarget(null);
          setPhase(p);
        }}
      />
      <StaleBanner pinned={pinned} latest={overview.data?.recordVersion} />
      <OverviewState query={overview}>
        {(o) => (
          <>
            <ReadinessCard overview={o} />
            <RequirementsTable
              overview={o}
              page={page}
              onPage={setPage}
              action={(r) =>
                r.status === 'SUPERSEDED' ? null : (
                  <button
                    type="button"
                    disabled={pinned.changed}
                    onClick={() => setTarget(r)}
                    aria-label={`Submit a version for ${r.documentType}`}
                  >
                    {r.submissionId ? 'Submit another version' : 'Submit a version'}
                  </button>
                )
              }
            />
            {target && (
              <SubmitForm
                key={target.requirementId}
                orderId={orderId}
                pinned={pinned}
                requirement={target}
                versions={current(target.documentType)}
                onClose={() => setTarget(null)}
              />
            )}
            <UploadForm orderId={orderId} pinned={pinned} types={types} />
          </>
        )}
      </OverviewState>
      <DocumentsSection
        orderId={orderId}
        documents={documents}
        page={docPage}
        onPage={setDocPage}
      />
    </>
  );
}

/** Owning Customer: legal checklist, document versions and submissions. */
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
          <p>Upload the documents your specialist requires and submit them for review.</p>
        </div>
        <Link to={`/customer/requests/${orderId}`}>Back to the request</Link>
      </header>
      <CustomerSafeNotice />
      <CustomerWorkspace key={`${session.generation}/${orderId}`} orderId={orderId} />
    </>
  );
}
