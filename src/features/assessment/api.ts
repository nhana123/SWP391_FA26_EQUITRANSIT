import { z } from 'zod';
import { request } from '../../shared/api/client';
import {
  assessmentReceiptSchema,
  caseDecisionSchema,
  casePageSchema,
  caseSchema,
  caseStaffPageSchema,
  type AssessmentCommand,
  type CaseRole,
  type ReviewState,
} from './contracts';

export const QUEUE_PAGE_SIZE = 20;
export const STAFF_PAGE_SIZE = 20;
export const HISTORY_PAGE_SIZE = 20;

const base = '/api/manager/transport-orders';

export const assessmentApi = {
  queue: (state: ReviewState, page: number, signal?: AbortSignal) =>
    request(
      `${base}?${new URLSearchParams({
        state,
        page: String(page),
        size: String(QUEUE_PAGE_SIZE),
      })}`,
      casePageSchema,
      { signal },
    ),
  staff: (role: CaseRole, page: number, signal?: AbortSignal) =>
    request(
      `${base}/staff?${new URLSearchParams({
        role,
        page: String(page),
        size: String(STAFF_PAGE_SIZE),
      })}`,
      caseStaffPageSchema,
      { signal },
    ),
  getCase: (id: number, signal?: AbortSignal) => request(`${base}/${id}`, caseSchema, { signal }),
  decide: (id: number, body: AssessmentCommand) =>
    request(`${base}/${id}/decisions`, assessmentReceiptSchema, { method: 'POST', body }),
  // Bounded array, newest first; BE sends no page count.
  decisions: (id: number, page: number, signal?: AbortSignal) =>
    request(
      `${base}/${id}/decisions?${new URLSearchParams({
        page: String(page),
        size: String(HISTORY_PAGE_SIZE),
      })}`,
      z.array(caseDecisionSchema),
      { signal },
    ),
};
