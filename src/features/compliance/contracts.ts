import { z } from 'zod';
import { idSchema, versionSchema } from '../../shared/api/contracts';

// Mirrors BE F08 compliance DTOs (dev 5c5b167+). Only the owning Customer and
// the assigned, active Specialist can read; only that Specialist decides.
export const phases = ['PRE_EXPORT', 'ARRIVAL', 'QUARANTINE_RELEASE'] as const;
export type Phase = (typeof phases)[number];
export const legalDecisions = ['APPROVED', 'REJECTED', 'REVOKED'] as const;
export type LegalDecision = (typeof legalDecisions)[number];
export const authorityDecisions = ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'] as const;
export type AuthorityDecision = (typeof authorityDecisions)[number];
export type Applicability = 'REQUIRED' | 'NOT_REQUIRED';

const text = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const optionalId = idSchema.nullish().transform((v) => v ?? null);
const count = z
  .number()
  .int()
  .nonnegative()
  .nullish()
  .transform((v) => v ?? null);

export const readinessSchema = z.object({
  revisionId: idSchema,
  phase: z.enum(phases),
  asOf: z.string(),
  expiresAt: text,
  status: z.enum(['PENDING', 'READY']),
  blockers: z.array(z.string()),
});
export const attachmentSchema = z.object({
  fileKey: text,
  fileName: z.string(),
  contentType: z.string(),
  fileSizeBytes: z.number().int().nonnegative(),
  referenceNumber: text,
  expiresAt: text,
});
export type Attachment = z.infer<typeof attachmentSchema>;
export const requirementSchema = z.object({
  requirementId: idSchema,
  ruleId: idSchema,
  documentType: z.string(),
  phase: z.enum(phases),
  // Checklist projection only; the root readiness decides legal status.
  status: z.string(),
  submissionId: optionalId,
  documentVersionId: optionalId,
  decision: z
    .enum(legalDecisions)
    .nullish()
    .transform((v) => v ?? null),
  instructions: text,
  // The Specialist's note on the latest review; older servers omit it.
  feedback: text,
  // The latest submitted file, when the server reports it.
  attachment: attachmentSchema.nullish().transform((v) => v ?? null),
});
export const overviewSchema = z.object({
  revisionId: idSchema,
  recordVersion: versionSchema,
  readiness: readinessSchema,
  requirements: z.array(requirementSchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(),
});
export type Overview = z.infer<typeof overviewSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Readiness = z.infer<typeof readinessSchema>;

export const documentSchema = z.object({
  documentVersionId: idSchema,
  documentId: idSchema,
  versionNo: z.number().int(),
  documentType: z.string(),
  // Legacy external rows may have no private key or dates.
  fileKey: text,
  issuedDate: text,
  expiryDate: text,
  revokedAt: text,
});
export type ComplianceDocument = z.infer<typeof documentSchema>;
export const fileSchema = z.object({
  fileKey: z.string(),
  contentType: z.string(),
  fileName: z.string(),
  contentBase64: z.string(),
});
export type ComplianceFile = z.infer<typeof fileSchema>;
export const ruleSchema = z.object({
  ruleId: idSchema,
  ruleCode: z.string(),
  versionNo: z.number().int(),
  documentType: z.string(),
  phase: z.enum(phases),
  sourceUrl: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: text,
  authorityRequired: z.boolean(),
  transitCountryCode: text,
  instructions: text,
});
export type Rule = z.infer<typeof ruleSchema>;
export const procedureSchema = z.object({
  procedureId: idSchema,
  ruleId: idSchema,
  phase: z.enum(phases),
  decision: z.enum(authorityDecisions),
  authorityName: z.string(),
  sourceReference: z.string(),
  evidenceFileKey: text,
  expiresAt: text,
});
export type Procedure = z.infer<typeof procedureSchema>;
// Null counts are unavailable/expired, never assessed zeros.
export const assessmentSchema = z.object({
  applicability: z
    .enum(['REQUIRED', 'NOT_REQUIRED'])
    .nullish()
    .transform((v) => v ?? null),
  requiredDays: count,
  visitCount: count,
  testCount: count,
  doseCount: count,
  certificateCount: count,
  validUntil: text,
});
export type Assessment = z.infer<typeof assessmentSchema>;
export const receiptSchema = z.object({
  entityId: idSchema,
  operationId: z.string(),
  recordVersion: versionSchema,
  fileKey: text,
});
export type Receipt = z.infer<typeof receiptSchema>;

/** Flat command for useCaseCommand; the adapter nests `command`. */
export type Command<T> = T & { recordVersion: string; operationId: string };
export type RuleInput = {
  phase: Phase;
  ruleCode: string;
  documentType: string;
  displayName: string;
  transitCountryCode: string | null;
  sourceUrl: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  instructions: string | null;
  authorityRequired: boolean;
};
export type ChecklistInput = {
  phase: Phase;
  transitCountryCodes: string[];
  sourceReference: string;
  validUntil: string;
};
export type FileInput = { fileName: string; contentType: string; contentBase64: string };
export type UploadInput = FileInput & {
  documentType: string;
  issuedDate: string;
  expiryDate: string;
  documentNumber: string | null;
};
export type SubmissionInput = { documentVersionId: number };
/** Flat one-step upload + submit: the BE takes no nested `command`. */
export type UploadSubmitInput = FileInput & {
  expiresAt: string;
  referenceNumber: string | null;
};
export type ReviewInput = { decision: LegalDecision; feedback: string | null };
export type AuthorityInput = {
  ruleId: number;
  decision: AuthorityDecision;
  authorityName: string;
  applicationReference: string;
  sourceReference: string;
  evidenceFileKey: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  holdReason: string | null;
};
export type AssessmentInput = {
  applicability: Applicability;
  requiredDays: number | null;
  visitCount: number;
  testCount: number;
  doseCount: number;
  certificateCount: number;
  sourceReference: string;
  validUntil: string;
};
export type ClearanceInput = { phase: Phase; expiresAt: string };
export type RevokeInput = { reason: string };

export const phaseLabels: Record<Phase, string> = {
  PRE_EXPORT: 'Pre-export',
  ARRIVAL: 'Arrival',
  QUARANTINE_RELEASE: 'Quarantine release',
};
export const decisionLabels: Record<LegalDecision, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REVOKED: 'Revoked',
};

/**
 * Readiness blockers emitted by BE ComplianceReadinessFacade. Unknown codes are
 * shown as received, never hidden or treated as cleared.
 */
export const blockerLabels: Record<string, string> = {
  REVISION_MISMATCH: 'The case revision changed; reload the current revision',
  COMPLIANCE_SCHEMA_PENDING: 'Legal compliance is not deployed on this server yet',
  RULE_ASSESSMENT_PENDING: 'The route checklist has not been assessed yet',
  ROUTE_RULE_PENDING: 'A rule for the route or a transit country is missing',
  CHECKLIST_EXPIRED: 'The checklist assessment has expired',
  SPECIALIST_ASSIGNMENT_CHANGED: 'The assigned specialist changed; reassessment is needed',
  RULE_EXPIRED: 'A current legal rule has expired',
  RULE_SOURCE_PENDING: 'A legal rule has no recorded source',
  DOCUMENT_EVIDENCE_PENDING: 'A required document is missing, pending review or not approved',
  AUTHORITY_EVIDENCE_PENDING: 'An authority decision with evidence is still required',
  PHASE_CLEARANCE_PENDING: 'This phase has not been cleared by the specialist',
};
export const blockerText = (code: string) => blockerLabels[code] ?? code;

/** BE codes with a specific meaning for the user. */
export const errorHelp: Record<string, string> = {
  ORDER_VERSION_CONFLICT: 'The case changed. Reload and review before trying again.',
  COMPLIANCE_RETRY_CONFLICT:
    'This operation was already used with different input. Reload and start a new action.',
  COMPLIANCE_SCHEMA_PENDING:
    'Legal compliance is not deployed on this server yet (migration 009 is pending).',
  COMPLIANCE_HOLD_ACTIVE: 'A legal hold is active for this case.',
  CUSTOMER_REQUIRED: 'Only the owning customer can upload or submit documents.',
  DOCUMENT_TYPE_UNKNOWN: 'This document type is not in the catalog.',
  DOCUMENT_TYPE_INACTIVE: 'This document type is no longer accepted.',
  DOCUMENT_TYPE_MISMATCH: 'This document version does not match the required type or horse.',
  DOCUMENT_DATES_INVALID: 'Check the issued and expiry dates.',
  DOCUMENT_ALREADY_REVOKED: 'This document version is already revoked.',
  FILE_TYPE_INVALID: 'Only PDF, PNG or JPEG files are accepted, matching their content.',
  FILE_SIZE_INVALID: 'The file must be at most 5 MiB.',
  FILE_NAME_INVALID: 'Use a simple file name without folders or unusual characters.',
  FILE_CONTENT_INVALID: 'The file content could not be read as the declared type.',
  FILE_PDF_ACTIVE: 'PDFs with scripts, actions, attachments or encryption are not accepted.',
  FILE_PDF_LIMITS: 'The PDF is too complex (at most 100 pages).',
  LEGAL_EVIDENCE_NOT_FOUND: 'The referenced evidence is not available for this case.',
  LEGAL_WORK_STATE_CONFLICT: 'This case no longer accepts legal changes in its current state.',
  SUBMITTED_REVISION_REQUIRED: 'The case needs a current submitted revision first.',
  AUTHORITY_PROOF_OWNER: 'Authority evidence must be uploaded by you for this case.',
  AUTHORITY_PROOF_REQUIRED: 'An approved authority decision needs uploaded evidence.',
  HOLD_REASON_REQUIRED: 'A pending, rejected or revoked decision needs a hold reason.',
  QUARANTINE_DAYS_INVALID: 'Required quarantine needs positive days; not required needs none.',
  RULE_DATES_INVALID: 'The rule end must follow its start.',
  RULE_LIMIT_EXCEEDED: 'At most 100 active rules are allowed per phase.',
  RULE_NOT_IN_CHECKLIST: 'This rule is not part of the current checklist.',
  RULE_SOURCE_INVALID: 'Use an HTTPS source URL.',
  RULE_VERSION_SCOPE_CONFLICT: 'A rule code keeps the same route, phase and document type.',
  TRANSIT_COUNTRIES_PENDING: 'Assess the transit countries of the actual route first.',
  TRANSIT_DUPLICATE: 'Each transit country can be listed once.',
  CLEARANCE_BLOCKED: 'This phase cannot be cleared: some evidence is missing or not approved.',
  CLEARANCE_EXPIRY_INVALID:
    'The clearance cannot outlast the earliest evidence, checklist or rule expiry.',
  CHECKLIST_DATES: 'Check the checklist validity date.',
  ASSESSMENT_DATES: 'Check the assessment validity date.',
};
