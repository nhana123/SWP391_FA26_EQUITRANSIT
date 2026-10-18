import { validOffsetDate, type FieldErrors } from '../../shared/lib/validation';
import type {
  AssessmentInput,
  AuthorityInput,
  ChecklistInput,
  ClearanceInput,
  Phase,
  ReviewInput,
  RuleInput,
  UploadInput,
  Applicability,
  AuthorityDecision,
  LegalDecision,
  FileInput,
} from './contracts';

type Result<T> = { input: T | null; errors: FieldErrors };
const done = <T>(input: T, errors: FieldErrors): Result<T> =>
  Object.keys(errors).length ? { input: null, errors } : { input, errors };
const code = /^[A-Z0-9_-]{1,50}$/;
const country = /^[A-Z]{2}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optional = (v: string) => v.trim() || null;
const localDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

function text(errors: FieldErrors, name: string, value: string, max: number, required = true) {
  const v = value.trim();
  if (required && !v) errors[name] = 'This field is required.';
  else if (v.length > max) errors[name] = `Use at most ${max} characters.`;
  return v;
}
function date(
  errors: FieldErrors,
  name: string,
  value: string,
  opts: { future?: boolean; past?: boolean } = {},
) {
  const v = value.trim();
  if (!validOffsetDate(v)) errors[name] = 'Use an ISO date with offset, e.g. 2027-02-01T00:00:00Z.';
  else if (opts.future && Date.parse(v) <= Date.now()) errors[name] = 'Use a future date.';
  else if (opts.past && Date.parse(v) > Date.now()) errors[name] = 'This cannot be in the future.';
  return v;
}
/** Whole number in range; an empty field is missing, never zero. */
function whole(errors: FieldErrors, name: string, value: string, min: number, max: number) {
  const v = value.trim();
  if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) {
    errors[name] = v ? `Use a whole number from ${min} to ${max}.` : 'Enter the assessed number.';
    return 0;
  }
  return Number(v);
}

export type UploadForm = {
  documentType: string;
  file: FileInput | null;
  fileProblem: string | null;
  issuedDate: string;
  expiryDate: string;
  documentNumber: string;
};
export function validateUpload(f: UploadForm): Result<UploadInput> {
  const e: FieldErrors = {};
  const documentType = f.documentType.trim().toUpperCase();
  if (!code.test(documentType))
    e.documentType = 'Use the document type code, e.g. HEALTH_CERTIFICATE.';
  if (f.fileProblem) e.file = f.fileProblem;
  else if (!f.file) e.file = 'Choose a PDF, PNG or JPEG file.';
  if (!localDate(f.issuedDate)) e.issuedDate = 'Use a date like 2026-10-01.';
  if (!localDate(f.expiryDate)) e.expiryDate = 'Use a date like 2027-03-01.';
  else if (!e.issuedDate && f.expiryDate < f.issuedDate)
    e.expiryDate = 'The expiry cannot be before the issue date.';
  const documentNumber = text(e, 'documentNumber', f.documentNumber, 50, false);
  return done(
    {
      ...(f.file ?? { fileName: '', contentType: '', contentBase64: '' }),
      documentType,
      issuedDate: f.issuedDate,
      expiryDate: f.expiryDate,
      documentNumber: documentNumber || null,
    },
    e,
  );
}

export type RuleForm = Omit<
  RuleInput,
  'transitCountryCode' | 'effectiveTo' | 'instructions' | 'authorityRequired'
> & {
  transitCountryCode: string;
  effectiveTo: string;
  instructions: string;
  authorityRequired: '' | 'true' | 'false';
};
export function validateRule(f: RuleForm): Result<RuleInput> {
  const e: FieldErrors = {};
  const ruleCode = f.ruleCode.trim().toUpperCase();
  const documentType = f.documentType.trim().toUpperCase();
  if (!code.test(ruleCode)) e.ruleCode = 'Use 1–50 uppercase letters, digits, - or _.';
  if (!code.test(documentType)) e.documentType = 'Use 1–50 uppercase letters, digits, - or _.';
  const displayName = text(e, 'displayName', f.displayName, 200);
  const transit = f.transitCountryCode.trim().toUpperCase();
  if (transit && !country.test(transit)) e.transitCountryCode = 'Use a 2-letter country code.';
  const sourceUrl = text(e, 'sourceUrl', f.sourceUrl, 2048);
  if (sourceUrl && !/^https:\/\/[^\s/@]+(\/|$)/.test(sourceUrl))
    e.sourceUrl = 'Use an HTTPS link to the official source, without credentials.';
  const effectiveFrom = date(e, 'effectiveFrom', f.effectiveFrom);
  const to = f.effectiveTo.trim();
  if (to) {
    date(e, 'effectiveTo', to);
    if (!e.effectiveTo && !e.effectiveFrom && Date.parse(to) <= Date.parse(effectiveFrom))
      e.effectiveTo = 'The rule end must follow its start.';
  }
  const instructions = text(e, 'instructions', f.instructions, 2000, false);
  // The BE rejects an omitted choice: authority evidence is never assumed either way.
  if (f.authorityRequired === '')
    e.authorityRequired = 'State whether the source requires an authority decision.';
  return done(
    {
      phase: f.phase,
      ruleCode,
      documentType,
      displayName,
      transitCountryCode: transit || null,
      sourceUrl,
      effectiveFrom,
      effectiveTo: to || null,
      instructions: instructions || null,
      authorityRequired: f.authorityRequired === 'true',
    },
    e,
  );
}

export function validateChecklist(f: {
  phase: Phase;
  transitCountryCodes: string;
  sourceReference: string;
  validUntil: string;
}): Result<ChecklistInput> {
  const e: FieldErrors = {};
  const codes = f.transitCountryCodes
    .split(/[\s,]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (codes.some((c) => !country.test(c)))
    e.transitCountryCodes = 'Use 2-letter country codes separated by commas.';
  else if (codes.length > 15) e.transitCountryCodes = 'List at most 15 transit countries.';
  else if (new Set(codes).size !== codes.length)
    e.transitCountryCodes = 'Each transit country can be listed once.';
  const sourceReference = text(e, 'sourceReference', f.sourceReference, 1000);
  const validUntil = date(e, 'validUntil', f.validUntil, { future: true });
  return done({ phase: f.phase, transitCountryCodes: codes, sourceReference, validUntil }, e);
}

export function validateReview(f: {
  decision: LegalDecision | '';
  feedback: string;
}): Result<ReviewInput> {
  const e: FieldErrors = {};
  if (!f.decision) e.decision = 'Choose a decision.';
  const feedback = text(e, 'feedback', f.feedback, 2000, false);
  return done({ decision: f.decision as LegalDecision, feedback: feedback || null }, e);
}

export type AuthorityForm = {
  ruleId: string;
  decision: AuthorityDecision | '';
  authorityName: string;
  applicationReference: string;
  sourceReference: string;
  evidenceFileKey: string;
  decidedAt: string;
  expiresAt: string;
  holdReason: string;
};
export function validateAuthority(f: AuthorityForm): Result<AuthorityInput> {
  const e: FieldErrors = {};
  if (!/^\d+$/.test(f.ruleId.trim()) || Number(f.ruleId) < 1) e.ruleId = 'Choose the rule.';
  if (!f.decision) e.decision = 'Choose the recorded authority decision.';
  const authorityName = text(e, 'authorityName', f.authorityName, 300);
  const applicationReference = text(e, 'applicationReference', f.applicationReference, 150);
  const sourceReference = text(e, 'sourceReference', f.sourceReference, 1000);
  const key = f.evidenceFileKey.trim();
  if (key && !uuid.test(key))
    e.evidenceFileKey = 'Use the file key returned by the evidence upload.';
  const approved = f.decision === 'APPROVED';
  const decidedAt = optional(f.decidedAt);
  const expiresAt = optional(f.expiresAt);
  if (approved) {
    // A click is not a permit: approval needs inspected evidence, a real decision time and expiry.
    if (!key) e.evidenceFileKey = 'Upload the authority evidence first.';
    if (!decidedAt) e.decidedAt = 'Enter when the authority decided.';
    else date(e, 'decidedAt', decidedAt, { past: true });
    if (!expiresAt) e.expiresAt = 'Enter when the authority decision expires.';
    else date(e, 'expiresAt', expiresAt, { future: true });
  } else {
    if (decidedAt) date(e, 'decidedAt', decidedAt, { past: true });
    if (expiresAt) date(e, 'expiresAt', expiresAt);
  }
  const holdReason = text(e, 'holdReason', f.holdReason, 2000, !approved && !!f.decision);
  return done(
    {
      ruleId: Number(f.ruleId),
      decision: f.decision as AuthorityDecision,
      authorityName,
      applicationReference,
      sourceReference,
      evidenceFileKey: key || null,
      decidedAt,
      expiresAt,
      holdReason: holdReason || null,
    },
    e,
  );
}

export type AssessmentForm = {
  applicability: Applicability | '';
  requiredDays: string;
  visitCount: string;
  testCount: string;
  doseCount: string;
  certificateCount: string;
  sourceReference: string;
  validUntil: string;
};
export function validateAssessment(f: AssessmentForm): Result<AssessmentInput> {
  const e: FieldErrors = {};
  if (!f.applicability) e.applicability = 'Choose whether quarantine is required.';
  let requiredDays: number | null = null;
  if (f.applicability === 'REQUIRED')
    requiredDays = whole(e, 'requiredDays', f.requiredDays, 1, 3650);
  // NOT_REQUIRED sends null days, never 0.
  const input = {
    applicability: f.applicability as Applicability,
    requiredDays,
    visitCount: whole(e, 'visitCount', f.visitCount, 0, 10000),
    testCount: whole(e, 'testCount', f.testCount, 0, 10000),
    doseCount: whole(e, 'doseCount', f.doseCount, 0, 10000),
    certificateCount: whole(e, 'certificateCount', f.certificateCount, 0, 10000),
    sourceReference: text(e, 'sourceReference', f.sourceReference, 1000),
    validUntil: date(e, 'validUntil', f.validUntil, { future: true }),
  };
  return done(input, e);
}

export function validateClearance(phase: Phase, expiresAt: string): Result<ClearanceInput> {
  const e: FieldErrors = {};
  const v = date(e, 'expiresAt', expiresAt, { future: true });
  return done({ phase, expiresAt: v }, e);
}

export function validateRevoke(reason: string): Result<{ reason: string }> {
  const e: FieldErrors = {};
  return done({ reason: text(e, 'reason', reason, 2000) }, e);
}
