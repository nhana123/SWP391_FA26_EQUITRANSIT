import { DateTimeInput } from '../../shared/ui/DateTimeInput';
import { useState, type ReactNode } from 'react';
import { Icon } from '../../components/ui/Icons';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { idSchema } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { displayDate, type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice, Field, Loading, Notice, Pagination } from '../../shared/ui/common';
import { useAssignedCase } from '../assigned-cases/hooks';
import { ReferenceSheet } from '../specialist-desk/ReferenceSheet';
import { COMPLIANCE_PAGE_SIZE, complianceApi } from './api';
import {
  authorityDecisions,
  blockerText,
  decisionLabels,
  phaseLabels,
  phases,
  type ComplianceDocument,
  type FileInput,
  type Overview,
  type Phase,
  type Requirement,
  type Rule,
} from './contracts';
import { usePhase } from './CustomerCompliancePage';
import { acceptedTypes, fileProblem, readFile } from './files';
import {
  CommandForm,
  complianceKeys,
  useDocuments,
  useOverview,
  usePinnedVersion,
  type Pinned,
} from './hooks';
import { DocumentsSection, FileViewer, OverviewState, ReadinessCard, StaleBanner } from './shared';
import {
  validateAssessment,
  validateAuthority,
  validateChecklist,
  validateClearance,
  validateReview,
  validateRevoke,
  validateRule,
  type AssessmentForm,
  type AuthorityForm,
  type RuleForm,
} from './validation';

type Setter<T> = (patch: Partial<T>) => void;
function useForm<T extends object>(initial: T): [T, Setter<T>] {
  const [value, setValue] = useState(initial);
  return [value, (patch) => setValue((v) => ({ ...v, ...patch }))];
}
function TextInput({
  label,
  value,
  onChange,
  error,
  hint,
  max,
  area,
  date,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  max: number;
  area?: boolean;
  date?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) =>
        date ? (
          <DateTimeInput id={id} value={value} onChange={onChange} />
        ) : area ? (
          <textarea
            id={id}
            maxLength={max}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input id={id} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}
function Choice<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  error,
}: {
  label: string;
  value: T | '';
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (v: T) => void;
  error?: string;
}) {
  return (
    <Field label={label} error={error}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          <option value="" disabled>
            Choose…
          </option>
          {options.map((o) => (
            <option key={o} value={o}>
              {labels?.[o] ?? o}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** One click: the exact submission passes, with no feedback to write. */
function ApproveButton({
  orderId,
  pinned,
  requirement,
}: {
  orderId: number;
  pinned: Pinned;
  requirement: Requirement;
}) {
  return (
    <CommandForm
      compact
      label={`Approve ${requirement.documentType}`}
      title={`Approve submission ${requirement.submissionId}`}
      pinned={pinned}
      submitLabel="Approve (Pass)"
      send={(body) => complianceApi.review(orderId, requirement.submissionId!, body)}
      build={() => validateReview({ decision: 'APPROVED', feedback: '' }).input}
    >
      {() => null}
    </CommandForm>
  );
}

/** Sends the exact submission back; the reason is shown to the customer. */
function RejectForm({
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
  const [feedback, setFeedback] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label={`Request changes to ${requirement.documentType}`}
      title={`Send ${readableType(requirement.documentType)} back — submission ${requirement.submissionId}, version ID ${requirement.documentVersionId}`}
      pinned={pinned}
      submitLabel="Send back to the customer"
      send={(body) => complianceApi.review(orderId, requirement.submissionId!, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateReview({ decision: 'REJECTED', feedback });
        setErrors(r.errors);
        return r.input;
      }}
      onDone={onClose}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <TextInput
            label="Reason for the customer"
            hint="Say what to fix, e.g. an unreadable scan or a date that expires too soon."
            area
            max={2000}
            value={feedback}
            onChange={setFeedback}
            error={fields.feedback}
          />
          <button type="button" onClick={onClose} disabled={locked}>
            Cancel
          </button>
        </fieldset>
      )}
    </CommandForm>
  );
}

/** The clearance may not outlast the earliest evidence; minutes floor in UTC+07:00. */
function inOperationalZone(iso: string | null) {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '';
  return `${new Date(t + 7 * 3_600_000).toISOString().slice(0, 16)}:00+07:00`;
}

/** What still stands between the Specialist and the clearance, in plain words. */
function pendingWork(blockers: string[]) {
  if (blockers.includes('RULE_ASSESSMENT_PENDING'))
    return 'Record the route checklist in step 1 first.';
  if (blockers.includes('ROUTE_RULE_PENDING'))
    return 'A legal rule for this route is missing: publish it under the legal rules in step 1.';
  if (blockers.includes('DOCUMENT_EVIDENCE_PENDING'))
    return 'Approve every required document in step 2 first.';
  if (blockers.includes('AUTHORITY_EVIDENCE_PENDING'))
    return 'Record the authority decision with its evidence in step 2 first.';
  const other = blockers.find((b) => b !== 'PHASE_CLEARANCE_PENDING');
  return other ? blockerText(other) : null;
}

function ClearanceForm({
  orderId,
  pinned,
  phase,
  suggestedExpiry,
}: {
  orderId: number;
  pinned: Pinned;
  phase: Phase;
  /** The latest expiry the server accepts, from the earliest current evidence. */
  suggestedExpiry: string;
}) {
  // Follows the server's suggestion until the Specialist edits it.
  const [edited, setEdited] = useState<string | null>(null);
  const expiresAt = edited ?? suggestedExpiry;
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label={`Clear ${phaseLabels[phase]}`}
      title={`${phaseLabels[phase]} clearance stamp`}
      pinned={pinned}
      submitLabel={`Clear ${phaseLabels[phase].toLowerCase()}`}
      send={(body) => complianceApi.clear(orderId, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateClearance(phase, expiresAt);
        setErrors(r.errors);
        return r.input;
      }}
    >
      {(locked, fields) => (
        <>
          <p className="muted">
            {suggestedExpiry
              ? 'The expiry is filled in from the earliest current evidence; you can shorten it.'
              : 'The expiry cannot outlast the earliest evidence.'}{' '}
            The server clears only when every current rule, document review and required authority
            result passes.
          </p>
          <fieldset className="form-grid" disabled={locked}>
            <TextInput
              label="Clearance expires at"
              date
              max={35}
              value={expiresAt}
              onChange={setEdited}
              error={fields.expiresAt}
            />
          </fieldset>
        </>
      )}
    </CommandForm>
  );
}

function RulesSection({
  orderId,
  pinned,
  phase,
  rules,
}: {
  orderId: number;
  pinned: Pinned;
  phase: Phase;
  rules: { data?: Rule[]; isPending: boolean; error: unknown };
}) {
  const [f, set] = useForm<RuleForm>({
    phase,
    ruleCode: '',
    documentType: '',
    displayName: '',
    transitCountryCode: '',
    sourceUrl: '',
    effectiveFrom: '',
    effectiveTo: '',
    instructions: '',
    authorityRequired: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <section className="card" aria-labelledby="rules-heading">
      <h2 id="rules-heading">Legal rules — {phaseLabels[phase]}</h2>
      {rules.isPending ? (
        <Loading />
      ) : rules.error ? (
        <ErrorNotice error={rules.error} />
      ) : !rules.data!.length ? (
        <p>No current rules for this route and phase. Readiness stays pending.</p>
      ) : (
        <div className="table-scroll">
          <table aria-label="Legal rules">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Code / version</th>
                <th scope="col">Document</th>
                <th scope="col">Transit</th>
                <th scope="col">Authority</th>
                <th scope="col">Effective</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {rules.data!.map((r) => (
                <tr key={r.ruleId}>
                  <td>{r.ruleId}</td>
                  <td>
                    {r.ruleCode} v{r.versionNo}
                  </td>
                  <td>{r.documentType}</td>
                  <td>{r.transitCountryCode ?? 'Route'}</td>
                  <td>{r.authorityRequired ? 'Required' : 'Not required (sourced)'}</td>
                  <td>
                    {displayDate(r.effectiveFrom)} →{' '}
                    {r.effectiveTo ? displayDate(r.effectiveTo) : 'open-ended'}
                  </td>
                  <td className="compliance-source">{r.sourceUrl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CommandForm
        label="Publish legal rule"
        title="Publish a rule version"
        pinned={pinned}
        submitLabel="Publish rule"
        send={(body) => complianceApi.rule(orderId, body)}
        fieldErrors={errors}
        build={() => {
          const r = validateRule({ ...f, phase });
          setErrors(r.errors);
          return r.input;
        }}
      >
        {(locked, fields) => (
          <>
            <p className="muted">
              Records your sourced legal assessment for this route; it is not a verification of the
              issuing body. A rule code keeps the same route, phase and document type.
            </p>
            <fieldset className="form-grid" disabled={locked}>
              <TextInput
                label="Rule code"
                max={50}
                value={f.ruleCode}
                onChange={(ruleCode) => set({ ruleCode })}
                error={fields.ruleCode}
              />
              <TextInput
                label="Document type code"
                max={50}
                value={f.documentType}
                onChange={(documentType) => set({ documentType })}
                error={fields.documentType}
              />
              <TextInput
                label="Display name"
                max={200}
                value={f.displayName}
                onChange={(displayName) => set({ displayName })}
                error={fields.displayName}
              />
              <TextInput
                label="Transit country (optional)"
                hint="2-letter code; empty for the origin/destination route."
                max={2}
                value={f.transitCountryCode}
                onChange={(transitCountryCode) => set({ transitCountryCode })}
                error={fields.transitCountryCode}
              />
              <TextInput
                label="Official source (HTTPS)"
                max={2048}
                value={f.sourceUrl}
                onChange={(sourceUrl) => set({ sourceUrl })}
                error={fields.sourceUrl}
              />
              <TextInput
                label="Effective from"
                date
                max={35}
                value={f.effectiveFrom}
                onChange={(effectiveFrom) => set({ effectiveFrom })}
                error={fields.effectiveFrom}
              />
              <TextInput
                label="Effective to (optional)"
                date
                hint="Empty = open-ended, still bounded by checklist validity."
                max={35}
                value={f.effectiveTo}
                onChange={(effectiveTo) => set({ effectiveTo })}
                error={fields.effectiveTo}
              />
              <TextInput
                label="Instructions for the customer (optional)"
                area
                max={2000}
                value={f.instructions}
                onChange={(instructions) => set({ instructions })}
                error={fields.instructions}
              />
              <Choice
                label="Authority decision required by the source"
                value={f.authorityRequired}
                options={['true', 'false'] as const}
                labels={{
                  true: 'Yes — authority decision needed',
                  false: 'No — source says not required',
                }}
                onChange={(authorityRequired) => set({ authorityRequired })}
                error={fields.authorityRequired}
              />
            </fieldset>
          </>
        )}
      </CommandForm>
    </section>
  );
}

/** 90 days ahead at 23:59 in UTC+07:00, the operational zone. */
function suggestedValidUntil(now = Date.now()) {
  const day = new Date(now + 90 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
  return `${day}T23:59:00+07:00`;
}
const transitPicks = ['SG', 'QA', 'AE', 'HK'] as const;

function ChecklistForm({
  orderId,
  pinned,
  phase,
  route = null,
}: {
  orderId: number;
  pinned: Pinned;
  phase: Phase;
  route?: string | null;
}) {
  const [f, set] = useForm({
    transitCountryCodes: '',
    sourceReference: `Sourced rules for ${route ?? 'this route'}, ${phaseLabels[phase].toLowerCase()} phase, checked by the assigned specialist.`,
    validUntil: suggestedValidUntil(),
  });
  const [advanced, setAdvanced] = useState(false);
  const codes = f.transitCountryCodes
    .split(/[\s,]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const toggleTransit = (code: string) =>
    set({
      transitCountryCodes: (codes.includes(code)
        ? codes.filter((c) => c !== code)
        : [...codes, code]
      ).join(', '),
    });
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label="Assess route checklist"
      title={`Set up the ${phaseLabels[phase].toLowerCase()} checklist`}
      className="dossier-checklist"
      pinned={pinned}
      submitLabel="Record checklist"
      send={(body) => complianceApi.checklist(orderId, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateChecklist({ ...f, phase });
        setErrors(r.errors);
        return r.input;
      }}
    >
      {(locked, fields) => {
        // A server or local error on a folded field opens the advanced options.
        const open =
          advanced || !!(fields.transitCountryCodes || fields.sourceReference || fields.validUntil);
        return (
          <fieldset disabled={locked}>
            <p className="muted">
              Pick the transit stops of the actual route, then record. Matching sourced rules become
              the required documents below.
            </p>
            <div className="dossier-quick-picks" role="group" aria-label="Quick transit picks">
              <button
                type="button"
                aria-pressed={!codes.length}
                onClick={() => set({ transitCountryCodes: '' })}
              >
                {!codes.length && <Icon name="check" size={14} />} Direct
              </button>
              {transitPicks.map((code) => (
                <button
                  type="button"
                  key={code}
                  aria-pressed={codes.includes(code)}
                  onClick={() => toggleTransit(code)}
                >
                  {code}
                </button>
              ))}
            </div>
            <p className="dossier-route-line">
              {route ?? 'Route'}
              {codes.length ? ` · via ${codes.join(', ')}` : ' · direct'} · valid until{' '}
              {displayDate(f.validUntil)}
            </p>
            <button
              type="button"
              className="dossier-link-button"
              aria-expanded={open}
              onClick={() => setAdvanced(!open)}
            >
              Advanced options
            </button>
            {open && (
              <div className="form-grid">
                <TextInput
                  label="Transit countries"
                  hint="2-letter codes separated by commas; empty for a direct route."
                  max={60}
                  value={f.transitCountryCodes}
                  onChange={(transitCountryCodes) => set({ transitCountryCodes })}
                  error={fields.transitCountryCodes}
                />
                <TextInput
                  label="Source reference"
                  area
                  max={1000}
                  value={f.sourceReference}
                  onChange={(sourceReference) => set({ sourceReference })}
                  error={fields.sourceReference}
                />
                <TextInput
                  label="Valid until"
                  date
                  max={35}
                  value={f.validUntil}
                  onChange={(validUntil) => set({ validUntil })}
                  error={fields.validUntil}
                />
              </div>
            )}
          </fieldset>
        );
      }}
    </CommandForm>
  );
}

function AuthoritySection({
  orderId,
  pinned,
  phase,
  rules,
  presetRuleId,
}: {
  orderId: number;
  pinned: Pinned;
  phase: Phase;
  rules: Rule[];
  /** Opened from a document sheet: that sheet's rule is preselected. */
  presetRuleId?: number;
}) {
  const { generation } = useSession()!;
  const procedures = useQuery({
    queryKey: complianceKeys.procedures(generation, orderId, phase),
    queryFn: ({ signal }) => complianceApi.procedures(orderId, phase, signal),
    retry: false,
  });
  const [evidence, setEvidence] = useState<FileInput | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [f, set] = useForm<AuthorityForm>({
    ruleId: presetRuleId ? String(presetRuleId) : '',
    decision: '',
    authorityName: '',
    applicationReference: '',
    sourceReference: '',
    evidenceFileKey: '',
    // Opened from a document card: the decision is usually being recorded now.
    decidedAt: presetRuleId ? inOperationalZone(new Date().toISOString()) : '',
    expiresAt: '',
    holdReason: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const authorityRules = rules.filter((r) => r.authorityRequired);
  const [reading, setReading] = useState(false);
  async function choose(file: File | undefined) {
    setEvidence(null);
    const issue = file ? fileProblem(file) : null;
    setProblem(issue);
    if (!file || issue) return;
    setReading(true);
    try {
      setEvidence(await readFile(file));
    } catch {
      setProblem('The file could not be read. Choose it again.');
    } finally {
      setReading(false);
    }
  }
  return (
    <section className="card" aria-labelledby="authority-heading">
      <h2 id="authority-heading">Authority decisions — {phaseLabels[phase]}</h2>
      <p className="muted">
        Record decisions the competent authority actually made, with inspected evidence. This does
        not issue a permit. The latest result per rule applies.
      </p>
      {procedures.isPending ? (
        <Loading />
      ) : procedures.error ? (
        <ErrorNotice error={procedures.error} />
      ) : !procedures.data.length ? (
        <p>No authority results recorded for this phase.</p>
      ) : (
        <ul aria-label="Authority results">
          {procedures.data.map((p) => (
            <li key={p.procedureId}>
              Rule {p.ruleId}: <strong>{p.decision}</strong> by {p.authorityName}
              {p.expiresAt && `, expires ${displayDate(p.expiresAt)}`} — {p.sourceReference}
            </li>
          ))}
        </ul>
      )}
      <CommandForm
        label="Upload authority evidence"
        title="1. Upload authority evidence"
        pinned={pinned}
        submitLabel="Upload evidence"
        busy={reading}
        send={(body) => complianceApi.evidence(orderId, body)}
        fieldErrors={evidenceError ? { file: evidenceError } : {}}
        build={() => {
          const issue = problem ?? (evidence ? null : 'Choose the evidence file.');
          setEvidenceError(issue);
          return issue ? null : evidence;
        }}
        onDone={(receipt) => receipt.fileKey && set({ evidenceFileKey: receipt.fileKey })}
      >
        {(locked, fields) => (
          <fieldset disabled={locked}>
            <Field
              label="Evidence file"
              hint="PDF, PNG or JPEG, at most 5 MiB. Upload alone records no decision."
              error={fields.file}
            >
              {(id) => (
                <input
                  id={id}
                  type="file"
                  accept={acceptedTypes}
                  onChange={(e) => void choose(e.target.files?.[0])}
                />
              )}
            </Field>
          </fieldset>
        )}
      </CommandForm>
      <CommandForm
        label="Record authority decision"
        title="2. Record the authority decision"
        pinned={pinned}
        submitLabel="Record decision"
        send={(body) => complianceApi.procedure(orderId, body)}
        fieldErrors={errors}
        build={() => {
          const r = validateAuthority(f);
          setErrors(r.errors);
          return r.input;
        }}
      >
        {(locked, fields) => (
          <fieldset className="form-grid" disabled={locked}>
            <Field label="Rule" error={fields.ruleId}>
              {(id) => (
                <select id={id} value={f.ruleId} onChange={(e) => set({ ruleId: e.target.value })}>
                  <option value="" disabled>
                    {authorityRules.length ? 'Choose…' : 'No rule requires an authority decision'}
                  </option>
                  {authorityRules.map((r) => (
                    <option key={r.ruleId} value={r.ruleId}>
                      {r.ruleCode} v{r.versionNo} — {r.documentType}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Choice
              label="Recorded decision"
              value={f.decision}
              options={authorityDecisions}
              onChange={(decision) => set({ decision })}
              error={fields.decision}
            />
            <TextInput
              label="Authority name"
              max={300}
              value={f.authorityName}
              onChange={(authorityName) => set({ authorityName })}
              error={fields.authorityName}
            />
            <TextInput
              label="Application reference"
              max={150}
              value={f.applicationReference}
              onChange={(applicationReference) => set({ applicationReference })}
              error={fields.applicationReference}
            />
            <TextInput
              label="Source reference"
              area
              max={1000}
              value={f.sourceReference}
              onChange={(sourceReference) => set({ sourceReference })}
              error={fields.sourceReference}
            />
            <TextInput
              label="Evidence file key"
              hint="Filled in after the evidence upload above."
              max={36}
              value={f.evidenceFileKey}
              onChange={(evidenceFileKey) => set({ evidenceFileKey })}
              error={fields.evidenceFileKey}
            />
            <TextInput
              label="Decided at"
              date
              max={35}
              value={f.decidedAt}
              onChange={(decidedAt) => set({ decidedAt })}
              error={fields.decidedAt}
            />
            <TextInput
              label="Expires at"
              date
              max={35}
              value={f.expiresAt}
              onChange={(expiresAt) => set({ expiresAt })}
              error={fields.expiresAt}
            />
            <TextInput
              label="Hold reason"
              hint="Required unless approved."
              area
              max={2000}
              value={f.holdReason}
              onChange={(holdReason) => set({ holdReason })}
              error={fields.holdReason}
            />
          </fieldset>
        )}
      </CommandForm>
    </section>
  );
}

function AssessmentSection({ orderId, pinned }: { orderId: number; pinned: Pinned }) {
  const { generation } = useSession()!;
  const current = useQuery({
    queryKey: complianceKeys.assessment(generation, orderId),
    queryFn: ({ signal }) => complianceApi.assessment(orderId, signal),
    retry: false,
  });
  const [f, set] = useForm<AssessmentForm>({
    applicability: '',
    requiredDays: '',
    visitCount: '',
    testCount: '',
    doseCount: '',
    certificateCount: '',
    sourceReference: '',
    validUntil: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const shown = (v: number | null) => (v === null ? 'Pending' : String(v));
  return (
    <section className="card" aria-labelledby="assessment-heading">
      <h2 id="assessment-heading">Veterinary and quarantine assessment</h2>
      {current.isPending ? (
        <Loading />
      ) : current.error ? (
        <ErrorNotice error={current.error} />
      ) : (
        <p>
          Current: quarantine{' '}
          {current.data.applicability === null
            ? 'pending'
            : current.data.applicability === 'REQUIRED'
              ? `required, ${shown(current.data.requiredDays)} days`
              : 'not required'}
          ; visits {shown(current.data.visitCount)}, tests {shown(current.data.testCount)}, doses{' '}
          {shown(current.data.doseCount)}, certificates {shown(current.data.certificateCount)}
          {current.data.validUntil && `; valid until ${displayDate(current.data.validUntil)}`}.
        </p>
      )}
      <CommandForm
        label="Record assessment"
        title="Record a sourced assessment"
        pinned={pinned}
        submitLabel="Record assessment"
        send={(body) => complianceApi.assess(orderId, body)}
        fieldErrors={errors}
        build={() => {
          const r = validateAssessment(f);
          setErrors(r.errors);
          return r.input;
        }}
      >
        {(locked, fields) => (
          <>
            <p className="muted">
              Pricing and quotations use these counts after refresh. An unaccepted quotation may
              need a new version; an accepted one changes only through the change process.
            </p>
            <fieldset className="form-grid" disabled={locked}>
              <Choice
                label="Quarantine"
                value={f.applicability}
                options={['REQUIRED', 'NOT_REQUIRED'] as const}
                labels={{ REQUIRED: 'Required', NOT_REQUIRED: 'Not required' }}
                onChange={(applicability) => set({ applicability, requiredDays: '' })}
                error={fields.applicability}
              />
              {f.applicability === 'REQUIRED' && (
                <TextInput
                  label="Required days"
                  max={4}
                  value={f.requiredDays}
                  onChange={(requiredDays) => set({ requiredDays })}
                  error={fields.requiredDays}
                />
              )}
              <TextInput
                label="Veterinary visits"
                max={5}
                value={f.visitCount}
                onChange={(visitCount) => set({ visitCount })}
                error={fields.visitCount}
              />
              <TextInput
                label="Tests"
                max={5}
                value={f.testCount}
                onChange={(testCount) => set({ testCount })}
                error={fields.testCount}
              />
              <TextInput
                label="Vaccine doses"
                max={5}
                value={f.doseCount}
                onChange={(doseCount) => set({ doseCount })}
                error={fields.doseCount}
              />
              <TextInput
                label="Certificates"
                max={5}
                value={f.certificateCount}
                onChange={(certificateCount) => set({ certificateCount })}
                error={fields.certificateCount}
              />
              <TextInput
                label="Source reference"
                area
                max={1000}
                value={f.sourceReference}
                onChange={(sourceReference) => set({ sourceReference })}
                error={fields.sourceReference}
              />
              <TextInput
                label="Valid until"
                date
                max={35}
                value={f.validUntil}
                onChange={(validUntil) => set({ validUntil })}
                error={fields.validUntil}
              />
            </fieldset>
          </>
        )}
      </CommandForm>
    </section>
  );
}

function RevokeForm({
  orderId,
  pinned,
  document,
  onClose,
}: {
  orderId: number;
  pinned: Pinned;
  document: ComplianceDocument;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label={`Revoke document version ${document.documentVersionId}`}
      title={`Revoke ${document.documentType} version ${document.versionNo} (ID ${document.documentVersionId})`}
      pinned={pinned}
      submitLabel="Revoke version"
      send={(body) => complianceApi.revoke(orderId, document.documentVersionId, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateRevoke(reason);
        setErrors(r.errors);
        return r.input;
      }}
      onDone={onClose}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <p className="muted">
            The file and its history are kept; the version stops counting as evidence.
          </p>
          <TextInput
            label="Reason"
            area
            max={2000}
            value={reason}
            onChange={setReason}
            error={fields.reason}
          />
          <button type="button" onClick={onClose} disabled={locked}>
            Cancel
          </button>
        </fieldset>
      )}
    </CommandForm>
  );
}

/** Where a step of the open dossier sits, top to bottom in business order. */
function DossierStep({
  step,
  title,
  state = '',
  children,
}: {
  step: number;
  title: string;
  /** 'waiting' dims a step whose prerequisites are open; 'ready' highlights it. */
  state?: '' | 'waiting' | 'ready';
  children: ReactNode;
}) {
  return (
    <section className={`dossier-step ${state}`.trim()} aria-label={`Step ${step}: ${title}`}>
      <h2 className="dossier-step-title">
        <span className="dossier-step-number" aria-hidden="true">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Step 1. The route checklist is set up first; once the phase has one it
 * folds into a summary so the documents stay in view.
 */
function RouteChecklistStep({
  orderId,
  pinned,
  phase,
  overview,
  rules,
  route,
}: {
  orderId: number;
  pinned: Pinned;
  phase: Phase;
  overview: Overview;
  rules: { data?: Rule[]; isPending: boolean; error: unknown };
  route: string | null;
}) {
  const needed = overview.readiness.blockers.includes('RULE_ASSESSMENT_PENDING');
  const [editing, setEditing] = useState(false);
  // Transit stops show only where a matched requirement's rule names one.
  const matched = new Set(overview.requirements.map((r) => r.ruleId));
  const transit = [
    ...new Set(
      (rules.data ?? [])
        .filter((r) => matched.has(r.ruleId) && r.transitCountryCode)
        .map((r) => r.transitCountryCode!),
    ),
  ];
  return (
    <>
      {needed || editing ? (
        <>
          {needed && (
            <p className="dossier-callout">
              This phase has no route checklist yet. One click sets it up: its rules become the
              required documents below.
            </p>
          )}
          <ChecklistForm
            key={`checklist-${phase}-${route ?? ''}`}
            orderId={orderId}
            pinned={pinned}
            phase={phase}
            route={route}
          />
          {!needed && (
            <button type="button" onClick={() => setEditing(false)}>
              Keep the current checklist
            </button>
          )}
        </>
      ) : (
        <div className="dossier-summary-bar">
          <span>
            <Icon name="check" size={16} /> Route checklist recorded
            {route && ` · ${route}`}
            {transit.length ? ` via ${transit.join(', ')}` : ''} · {overview.totalElements} required
            document{overview.totalElements === 1 ? '' : 's'}
          </span>
          <button type="button" onClick={() => setEditing(true)}>
            Change route
          </button>
        </div>
      )}
      <details className="dossier-disclosure">
        <summary>Legal rules for this phase{rules.data ? ` (${rules.data.length})` : ''}</summary>
        <RulesSection
          key={`rules-${phase}`}
          orderId={orderId}
          pinned={pinned}
          phase={phase}
          rules={rules}
        />
      </details>
    </>
  );
}

/** HEALTH_CERTIFICATE → Health certificate (the code stays visible beside it). */
const readableType = (code: string) =>
  code.charAt(0) + code.slice(1).toLowerCase().replaceAll('_', ' ');
const sheetStatus = (r: Requirement) =>
  r.status === 'SUPERSEDED'
    ? 'Superseded'
    : r.decision
      ? decisionLabels[r.decision]
      : r.submissionId
        ? 'Awaiting review'
        : 'Not submitted';

/**
 * Step 2. Each required document is a card with the customer's submitted file
 * and one-click Pass / Request changes; the authority decision a rule needs
 * is recorded on the same card.
 */
function RequirementStack({
  orderId,
  pinned,
  phase,
  overview,
  page,
  onPage,
  rules,
  documents,
}: {
  orderId: number;
  pinned: Pinned;
  phase: Phase;
  overview: Overview;
  page: number;
  onPage: (page: number) => void;
  rules: Rule[];
  /** The loaded page of uploaded versions; a submitted one may sit on another page. */
  documents: ComplianceDocument[];
}) {
  const { generation } = useSession()!;
  const procedures = useQuery({
    queryKey: complianceKeys.procedures(generation, orderId, phase),
    queryFn: ({ signal }) => complianceApi.procedures(orderId, phase, signal),
    retry: false,
  });
  const [open, setOpen] = useState<{ id: number; kind: 'reject' | 'authority' } | null>(null);
  const pages = Math.ceil(overview.totalElements / COMPLIANCE_PAGE_SIZE);
  const toggle = (id: number, kind: 'reject' | 'authority') =>
    setOpen((o) => (o?.id === id && o.kind === kind ? null : { id, kind }));
  const blockers = overview.readiness.blockers;
  return (
    <>
      {blockers.includes('RULE_ASSESSMENT_PENDING') ? (
        <p className="muted">
          Record the route checklist in step 1 first: its rules decide which documents this phase
          needs.
        </p>
      ) : !overview.requirements.length ? (
        blockers.includes('ROUTE_RULE_PENDING') ? (
          <p className="dossier-callout">
            A legal rule for this route or a transit country is missing, so no documents could be
            matched. Publish it under the legal rules in step 1.
          </p>
        ) : (
          <p className="dossier-callout positive" role="status">
            <Icon name="check" size={16} /> No extra documents are required for this phase. Go
            straight to step 3 to clear it.
          </p>
        )
      ) : (
        <ol className="dossier-sheet-stack" aria-label="Required documents">
          {overview.requirements.map((r) => {
            const rule = rules.find((x) => x.ruleId === r.ruleId);
            const result = procedures.data
              ?.filter((p) => p.ruleId === r.ruleId)
              .sort((a, b) => b.procedureId - a.procedureId)[0];
            const reviewable = !!r.submissionId && r.status !== 'SUPERSEDED';
            const rejecting = open?.id === r.requirementId && open.kind === 'reject';
            const recording = open?.id === r.requirementId && open.kind === 'authority';
            const submitted = documents.find((d) => d.documentVersionId === r.documentVersionId);
            return (
              <li key={r.requirementId} className="dossier-sheet">
                <div className="dossier-sheet-head">
                  <span className="dossier-sheet-type">
                    <Icon name="file" size={16} />
                    <strong>{readableType(r.documentType)}</strong>
                    <small>{rule ? `${rule.ruleCode} v${rule.versionNo}` : r.documentType}</small>
                  </span>
                  <StatusBadge
                    status={
                      r.decision === 'APPROVED'
                        ? 'APPROVED'
                        : r.decision
                          ? 'REJECTED'
                          : r.submissionId
                            ? 'PENDING_REVIEW'
                            : 'PENDING'
                    }
                  >
                    {sheetStatus(r)}
                  </StatusBadge>
                </div>
                <dl className="dossier-sheet-facts">
                  <div>
                    <dt>Customer's submitted version</dt>
                    <dd>
                      {!r.documentVersionId
                        ? 'Not submitted yet'
                        : submitted
                          ? `v${submitted.versionNo} · expires ${submitted.expiryDate ?? 'not recorded'}${submitted.revokedAt ? ' · revoked' : ''}`
                          : `Version ID ${r.documentVersionId}`}
                    </dd>
                  </div>
                  {submitted?.fileKey && (
                    <div>
                      <dt>File</dt>
                      <dd>
                        <FileViewer
                          orderId={orderId}
                          fileKey={submitted.fileKey}
                          label="View the customer's file"
                        />
                      </dd>
                    </div>
                  )}
                  {rule?.authorityRequired && (
                    <div>
                      <dt>Authority decision</dt>
                      <dd>
                        {result
                          ? `${result.decision} by ${result.authorityName}`
                          : 'Required, not recorded'}
                      </dd>
                    </div>
                  )}
                  {r.instructions && (
                    <div className="wide">
                      <dt>Instructions to the customer</dt>
                      <dd>{r.instructions}</dd>
                    </div>
                  )}
                </dl>
                <div className="dossier-sheet-actions">
                  {reviewable && r.decision !== 'APPROVED' && (
                    <ApproveButton
                      key={`approve-${r.submissionId}`}
                      orderId={orderId}
                      pinned={pinned}
                      requirement={r}
                    />
                  )}
                  {reviewable && r.decision !== 'REJECTED' && (
                    <button
                      type="button"
                      disabled={pinned.changed}
                      aria-expanded={rejecting}
                      onClick={() => toggle(r.requirementId, 'reject')}
                      aria-label={`Request changes to ${r.documentType}`}
                    >
                      Request changes / Reject
                    </button>
                  )}
                  {reviewable && r.decision === 'REJECTED' && (
                    <span className="muted">Sent back: waiting for a new version.</span>
                  )}
                  {rule?.authorityRequired && (
                    <button
                      type="button"
                      disabled={pinned.changed}
                      aria-expanded={recording}
                      onClick={() => toggle(r.requirementId, 'authority')}
                    >
                      {result ? 'Update authority decision' : 'Record authority decision'}
                    </button>
                  )}
                  {!reviewable && (
                    <span className="muted">Waiting for the customer to submit this document.</span>
                  )}
                </div>
                {rejecting && (
                  <RejectForm
                    key={r.submissionId}
                    orderId={orderId}
                    pinned={pinned}
                    requirement={r}
                    onClose={() => setOpen(null)}
                  />
                )}
                {recording && (
                  <AuthoritySection
                    key={`authority-${r.requirementId}`}
                    orderId={orderId}
                    pinned={pinned}
                    phase={phase}
                    rules={rules}
                    presetRuleId={r.ruleId}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
      {(pages > 1 || page > 0) && <Pagination page={page} pages={pages} onChange={onPage} />}
    </>
  );
}

/**
 * The open dossier: reference sheet on the left, the phase's working sheets on
 * the right (checklist, then documents, then clearance). Every write keeps the
 * pinned order version and a fresh operation ID per action.
 */
export function SpecialistWorkspace({
  orderId,
  caseFile,
}: {
  orderId: number;
  /** Read-only case details, folded at the end of the right page. */
  caseFile?: ReactNode;
}) {
  const { generation } = useSession()!;
  const { phase, page, setPhase, setPage } = usePhase();
  const [docPage, setDocPage] = useState(0);
  const overview = useOverview(orderId, phase, page);
  const documents = useDocuments(orderId, docPage);
  const caseQuery = useAssignedCase(orderId);
  const rules = useQuery({
    queryKey: complianceKeys.rules(generation, orderId, phase),
    queryFn: ({ signal }) => complianceApi.rules(orderId, phase, signal),
    retry: false,
  });
  const pinned = usePinnedVersion(orderId, overview.data?.recordVersion);
  const [revoking, setRevoking] = useState<ComplianceDocument | null>(null);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const request = caseQuery.data?.revision?.snapshot.request;
  const route =
    request?.originCountryCode && request.destinationCountryCode
      ? `${request.originCountryCode} → ${request.destinationCountryCode}`
      : null;
  function openAssessment() {
    setAssessmentOpen(true);
    requestAnimationFrame(() =>
      document.getElementById('dossier-assessment')?.scrollIntoView?.({ behavior: 'smooth' }),
    );
  }
  return (
    <div className="dossier-open">
      <ReferenceSheet
        orderId={orderId}
        phase={phase}
        onPhase={setPhase}
        onAssessment={openAssessment}
      />
      <div className="dossier-sheets">
        {/* The legal stamps on the reference sheet switch the phase. */}
        <p className="dossier-phase-now">
          <small className="eyebrow">
            PHASE {phases.indexOf(phase) + 1} OF {phases.length}
          </small>
          <strong>{phaseLabels[phase]}</strong>
          <span className="muted">Switch phase with the legal stamps.</span>
        </p>
        <StaleBanner pinned={pinned} latest={overview.data?.recordVersion} />
        {assessmentOpen && (
          <section id="dossier-assessment" className="dossier-assessment">
            <AssessmentSection orderId={orderId} pinned={pinned} />
            <button type="button" onClick={() => setAssessmentOpen(false)}>
              Close the assessment
            </button>
          </section>
        )}
        <OverviewState query={overview}>
          {(o) => {
            const waiting = pendingWork(o.readiness.blockers);
            return (
              <>
                <DossierStep step={1} title="Route checklist">
                  <RouteChecklistStep
                    key={`route-${phase}`}
                    orderId={orderId}
                    pinned={pinned}
                    phase={phase}
                    overview={o}
                    rules={rules}
                    route={route}
                  />
                </DossierStep>
                <DossierStep step={2} title="Required documents">
                  <RequirementStack
                    key={`stack-${phase}`}
                    orderId={orderId}
                    pinned={pinned}
                    phase={phase}
                    overview={o}
                    page={page}
                    onPage={setPage}
                    rules={rules.data ?? []}
                    documents={documents.data ?? []}
                  />
                  {o.requirements.length > 0 && (
                    <div className="dossier-uploads">
                      <DocumentsSection
                        orderId={orderId}
                        documents={documents}
                        page={docPage}
                        onPage={setDocPage}
                        action={(d) =>
                          d.revokedAt ? null : (
                            <button
                              type="button"
                              disabled={pinned.changed}
                              onClick={() => setRevoking(d)}
                            >
                              Revoke
                            </button>
                          )
                        }
                      />
                      {revoking && (
                        <RevokeForm
                          key={revoking.documentVersionId}
                          orderId={orderId}
                          pinned={pinned}
                          document={revoking}
                          onClose={() => setRevoking(null)}
                        />
                      )}
                    </div>
                  )}
                </DossierStep>
                <DossierStep
                  step={3}
                  title={`Clear the ${phaseLabels[phase].toLowerCase()} phase`}
                  state={o.readiness.status === 'READY' ? '' : waiting ? 'waiting' : 'ready'}
                >
                  {waiting && o.readiness.status !== 'READY' && (
                    <p className="dossier-next">
                      <Icon name="arrow" size={16} /> {waiting}
                    </p>
                  )}
                  <ReadinessCard overview={o} />
                  <ClearanceForm
                    key={`clear-${phase}`}
                    orderId={orderId}
                    pinned={pinned}
                    phase={phase}
                    suggestedExpiry={inOperationalZone(o.readiness.expiresAt)}
                  />
                </DossierStep>
              </>
            );
          }}
        </OverviewState>
        {caseFile && (
          <details className="dossier-disclosure">
            <summary>Full case file (read-only)</summary>
            {caseFile}
          </details>
        )}
      </div>
    </div>
  );
}

/** Assigned Specialist: the open legal dossier of one case. */
export function SpecialistCompliancePage() {
  const session = useSession();
  const orderId = Number(useParams().id);
  if (!session) return null;
  if (session.role !== 'SPECIALIST')
    return <Notice>Only the assigned specialist records legal decisions.</Notice>;
  if (!idSchema.safeParse(orderId).success) return <Notice>This case is unavailable.</Notice>;
  return (
    <>
      <header className="page-heading">
        <div>
          <small className="eyebrow">LEGAL COMPLIANCE · OPEN DOSSIER</small>
          <h1>Legal compliance</h1>
          <p>Checklist, document reviews, authority decisions and phase clearance.</p>
        </div>
        <Link to={`/staff/cases/${orderId}`}>Back to the case</Link>
      </header>
      <Notice>
        Managers and coordinators cannot override legal decisions. A cleared phase is not a
        government permit and does not authorize departure on its own.
      </Notice>
      <SpecialistWorkspace key={`${session.generation}/${orderId}`} orderId={orderId} />
    </>
  );
}
