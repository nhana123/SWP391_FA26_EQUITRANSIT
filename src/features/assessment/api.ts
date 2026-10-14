import { request } from '../../shared/api/client';
import { casePageSchema, caseStaffPageSchema, type CaseRole, type ReviewState } from './contracts';

export const QUEUE_PAGE_SIZE = 20;
export const STAFF_PAGE_SIZE = 20;

export const assessmentApi = {
  queue: (state: ReviewState, page: number, signal?: AbortSignal) =>
    request(
      `/api/manager/transport-orders?${new URLSearchParams({
        state,
        page: String(page),
        size: String(QUEUE_PAGE_SIZE),
      })}`,
      casePageSchema,
      { signal },
    ),
  staff: (role: CaseRole, page: number, signal?: AbortSignal) =>
    request(
      `/api/manager/transport-orders/staff?${new URLSearchParams({
        role,
        page: String(page),
        size: String(STAFF_PAGE_SIZE),
      })}`,
      caseStaffPageSchema,
      { signal },
    ),
};
