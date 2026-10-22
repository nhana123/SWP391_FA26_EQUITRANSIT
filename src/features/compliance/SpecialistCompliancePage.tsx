import { DateTimeInput } from '../../shared/ui/DateTimeInput';
import { useState, type ReactNode } from 'react';
import { Icon } from '../../components/ui/Icons';
import { EmptyState } from '../../components/ui/Primitives';
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
  decisionLabels,
  legalDecisions,
  phaseLabels,
  type ComplianceDocument,
  type FileInput,
  type LegalDecision,
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
import { DocumentsSection, OverviewState, PhaseTabs, ReadinessCard, StaleBanner } from './shared';
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

function ReviewForm({
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
  const [f, set] = useForm({ decision: '' as LegalDecision | '', feedback: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label={`Review ${requirement.documentType}`}
      title={`Review submission ${requirement.submissionId} — ${requirement.documentType}, version ID ${requirement.documentVersionId}`}
      pinned={pinned}
      submitLabel="Record review"
      send={(body) => complianceApi.review(orderId, requirement.submissionId!, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateReview(f);
        setErrors(r.errors);
        return r.input;
      }}
      onDone={onClose}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <Choice
            label="Decision"
            value={f.decision}
            options={legalDecisions}
            labels={decisionLabels}
            onChange={(decision) => set({ decision })}
            error={fields.decision}
          />
          <TextInput
            label="Feedback to the customer (optional)"
            area
            max={2000}
            value={f.feedback}
            onChange={(feedback) => set({ feedback })}
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

function ClearanceForm({
  orderId,
  pinned,
  phase,
}: {
  orderId: number;
  pinned: Pinned;
  phase: Phase;
}) {
  const [expiresAt, setExpiresAt] = useState('');
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
            The server clears only when every current rule, exact document review and required
            authority result passes. The expiry cannot outlast the earliest evidence.
          </p>
          <fieldset className="form-grid" disabled={locked}>
            <TextInput
              label="Clearance expires at"
              date
              max={35}
              value={expiresAt}
              onChange={setExpiresAt}
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
    sourceReference: route
      ? `Sourced rules for ${route}, ${phaseLabels[phase].toLowerCase()} phase, checked by the assigned specialist.`
      : '',
    validUntil: suggestedValidUntil(),
  });
  const codes = f.transitCountryCodes
    .split(/[s,]+/)
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
      title={`Route checklist — ${phaseLabels[phase]}`}
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
      {(locked, fields) => (
        <>
          <p className="muted">
            List every transit country of the actual route as you assessed it. Matching current
            rules become this case's requirements; missing rules keep the phase pending.
          </p>
          <fieldset className="form-grid" disabled={locked}>
            <TextInput
              label="Transit countries"
              hint="2-letter codes separated by commas; empty for a direct route."
              max={60}
              value={f.transitCountryCodes}
              onChange={(transitCountryCodes) => set({ transitCountryCodes })}
              error={fields.transitCountryCodes}
            />
            <div className="dossier-quick-picks" role="group" aria-label="Quick transit picks">
              <button
                type="button"
                aria-pressed={!codes.length}
                onClick={() => set({ transitCountryCodes: '' })}
              >
                Direct (empty)
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
    decidedAt: '',
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
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="dossier-step" aria-label={`Step ${step}: ${title}`}>
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
  return (
    <>
      {needed || editing ? (
        <>
          {needed && (
            <p className="dossier-callout">
              This phase has no route checklist yet. Set it up first: its rules become the required
              documents below.
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
              Close the route checklist
            </button>
          )}
        </>
      ) : (
        <div className="dossier-summary-bar">
          <span>
            <Icon name="check" size={16} /> Route checklist recorded for {phaseLabels[phase]} ·{' '}
            {overview.totalElements} required document
            {overview.totalElements === 1 ? '' : 's'}
          </span>
          <button type="button" onClick={() => setEditing(true)}>
            Edit Route Checklist
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
 * Step 2. Each required document is a sheet; its review or authority form
 * opens on that sheet only when the Specialist acts on it.
 */
function RequirementStack({
  orderId,
  pinned,
  phase,
  overview,
  page,
  onPage,
  rules,
}: {
  orderId: number;
  pinned: Pinned;
  phase: Phase;
  overview: Overview;
  page: number;
  onPage: (page: number) => void;
  rules: Rule[];
}) {
  const { generation } = useSession()!;
  const procedures = useQuery({
    queryKey: complianceKeys.procedures(generation, orderId, phase),
    queryFn: ({ signal }) => complianceApi.procedures(orderId, phase, signal),
    retry: false,
  });
  const [open, setOpen] = useState<{ id: number; kind: 'review' | 'authority' } | null>(null);
  const pages = Math.ceil(overview.totalElements / COMPLIANCE_PAGE_SIZE);
  const toggle = (id: number, kind: 'review' | 'authority') =>
    setOpen((o) => (o?.id === id && o.kind === kind ? null : { id, kind }));
  return (
    <>
      {!overview.requirements.length ? (
        <EmptyState
          title="No required documents yet"
          description="They appear once the route checklist matches sourced rules for this phase."
        />
      ) : (
        <ol className="dossier-sheet-stack" aria-label="Required documents">
          {overview.requirements.map((r) => {
            const rule = rules.find((x) => x.ruleId === r.ruleId);
            const result = procedures.data
              ?.filter((p) => p.ruleId === r.ruleId)
              .sort((a, b) => b.procedureId - a.procedureId)[0];
            const reviewable = !!r.submissionId && r.status !== 'SUPERSEDED';
            const reviewing = open?.id === r.requirementId && open.kind === 'review';
            const recording = open?.id === r.requirementId && open.kind === 'authority';
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
                    <dt>Submitted version</dt>
                    <dd>{r.documentVersionId ?? 'Not submitted yet'}</dd>
                  </div>
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
                  {reviewable && (
                    <button
                      type="button"
                      className="primary"
                      disabled={pinned.changed}
                      aria-expanded={reviewing}
                      onClick={() => toggle(r.requirementId, 'review')}
                      aria-label={`Review ${r.documentType}`}
                    >
                      {r.decision ? 'Review again' : 'Approve or reject'}
                    </button>
                  )}
                  {rule?.authorityRequired && (
                    <button
                      type="button"
                      disabled={pinned.changed}
                      aria-expanded={recording}
                      onClick={() => toggle(r.requirementId, 'authority')}
                    >
                      Authority decision
                    </button>
                  )}
                  {!reviewable && !rule?.authorityRequired && (
                    <span className="muted">Waiting for the customer to submit this document.</span>
                  )}
                </div>
                {reviewing && (
                  <ReviewForm
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
      {open?.kind !== 'authority' && (
        <details className="dossier-disclosure">
          <summary>Authority decisions for this phase</summary>
          <AuthoritySection
            key={`authority-${phase}`}
            orderId={orderId}
            pinned={pinned}
            phase={phase}
            rules={rules}
          />
        </details>
      )}
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
        <PhaseTabs phase={phase} onChange={setPhase} />
        <StaleBanner pinned={pinned} latest={overview.data?.recordVersion} />
        <OverviewState query={overview}>
          {(o) => (
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
                />
                <details className="dossier-disclosure">
                  <summary>Uploaded document versions</summary>
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
                </details>
              </DossierStep>
              <DossierStep step={3} title={`Clear the ${phaseLabels[phase].toLowerCase()} phase`}>
                <ReadinessCard overview={o} />
                <ClearanceForm
                  key={`clear-${phase}`}
                  orderId={orderId}
                  pinned={pinned}
                  phase={phase}
                />
              </DossierStep>
            </>
          )}
        </OverviewState>
        <details
          id="dossier-assessment"
          className="dossier-disclosure"
          open={assessmentOpen}
          onToggle={(e) => setAssessmentOpen(e.currentTarget.open)}
        >
          <summary>Veterinary & quarantine assessment</summary>
          <AssessmentSection orderId={orderId} pinned={pinned} />
        </details>
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
