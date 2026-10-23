import { z } from 'zod';
import { ApiError, request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import {
  assessmentSchema,
  documentSchema,
  fileSchema,
  overviewSchema,
  procedureSchema,
  receiptSchema,
  ruleSchema,
  type AssessmentInput,
  type AuthorityInput,
  type ChecklistInput,
  type ClearanceInput,
  type Command,
  type FileInput,
  type Phase,
  type ReviewInput,
  type RevokeInput,
  type RuleInput,
  type SubmissionInput,
  type UploadInput,
  type UploadSubmitInput,
} from './contracts';

export const COMPLIANCE_PAGE_SIZE = 20;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base(orderId: number) {
  if (!idSchema.safeParse(orderId).success) throw new ApiError(400, 'Invalid request ID.');
  return `/api/transport-orders/${orderId}/compliance`;
}
function id(value: number) {
  if (!idSchema.safeParse(value).success) throw new ApiError(400, 'Invalid ID.');
  return String(value);
}
const query = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
/** Every compliance write nests `command: {recordVersion, operationId}`. */
function post<T>(path: string, { recordVersion, operationId, ...input }: Command<T>) {
  return request(path, receiptSchema, {
    method: 'POST',
    body: { command: { recordVersion, operationId }, ...input },
  });
}

export const complianceApi = {
  overview: (orderId: number, phase: Phase, page: number, signal?: AbortSignal) =>
    request(
      `${base(orderId)}?${query({ phase, page, size: COMPLIANCE_PAGE_SIZE })}`,
      overviewSchema,
      { signal },
    ),
  rules: (orderId: number, phase: Phase, signal?: AbortSignal) =>
    request(`${base(orderId)}/rules?${query({ phase })}`, z.array(ruleSchema), { signal }),
  documents: (orderId: number, page: number, signal?: AbortSignal) =>
    request(
      `${base(orderId)}/documents?${query({ page, size: COMPLIANCE_PAGE_SIZE })}`,
      z.array(documentSchema),
      { signal },
    ),
  /** Private JSON content; there is no public URL or filesystem path. */
  file: (orderId: number, key: string, signal?: AbortSignal) => {
    if (!uuid.test(key)) throw new ApiError(400, 'Invalid file key.');
    return request(`${base(orderId)}/files/${key}`, fileSchema, { signal });
  },
  procedures: (orderId: number, phase: Phase, signal?: AbortSignal) =>
    request(`${base(orderId)}/procedures?${query({ phase })}`, z.array(procedureSchema), {
      signal,
    }),
  assessment: (orderId: number, signal?: AbortSignal) =>
    request(`${base(orderId)}/assessments`, assessmentSchema, { signal }),

  // Customer
  upload: (orderId: number, body: Command<UploadInput>) => post(`${base(orderId)}/documents`, body),
  submit: (orderId: number, requirementId: number, body: Command<SubmissionInput>) =>
    post(`${base(orderId)}/requirements/${id(requirementId)}/submissions`, body),
  /** One transaction: stores the file, creates the version and submits it. */
  uploadAndSubmit: (orderId: number, requirementId: number, body: Command<UploadSubmitInput>) =>
    request(`${base(orderId)}/requirements/${id(requirementId)}/upload-and-submit`, receiptSchema, {
      method: 'POST',
      body,
    }),
  // Assigned Specialist
  rule: (orderId: number, body: Command<RuleInput>) => post(`${base(orderId)}/rules`, body),
  checklist: (orderId: number, body: Command<ChecklistInput>) =>
    post(`${base(orderId)}/checklists`, body),
  evidence: (orderId: number, body: Command<FileInput>) => post(`${base(orderId)}/files`, body),
  review: (orderId: number, submissionId: number, body: Command<ReviewInput>) =>
    post(`${base(orderId)}/submissions/${id(submissionId)}/reviews`, body),
  procedure: (orderId: number, body: Command<AuthorityInput>) =>
    post(`${base(orderId)}/procedures`, body),
  assess: (orderId: number, body: Command<AssessmentInput>) =>
    post(`${base(orderId)}/assessments`, body),
  clear: (orderId: number, body: Command<ClearanceInput>) =>
    post(`${base(orderId)}/clearances`, body),
  revoke: (orderId: number, documentVersionId: number, body: Command<RevokeInput>) =>
    post(`${base(orderId)}/documents/${id(documentVersionId)}/revocations`, body),
};
