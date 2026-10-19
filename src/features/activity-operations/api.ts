import { ApiError, request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import { staffDashboardSchema, taskPageSchema, timelineSchema } from './contracts';

export const OPERATIONS_PAGE_SIZE = 20;
const query = (page: number) =>
  new URLSearchParams({ page: String(page), size: String(OPERATIONS_PAGE_SIZE) });
function validPage(page: number) {
  if (!Number.isSafeInteger(page) || page < 0) throw new ApiError(400, 'Invalid page.');
}

export const operationsApi = {
  /** The caller's scoped overview; a response for another role is rejected. */
  dashboard: async (role: string, page: number, signal?: AbortSignal) => {
    validPage(page);
    const result = await request(`/api/dashboard?${query(page)}`, staffDashboardSchema, {
      signal,
    });
    if (result.role !== role) throw new ApiError(502, 'Dashboard scope mismatch.');
    return result;
  },
  /** Only the caller's live, active assigned work; other roles get no tasks. */
  tasks: (page: number, signal?: AbortSignal) => {
    validPage(page);
    return request(`/api/dashboard/tasks?${query(page)}`, taskPageSchema, { signal });
  },
  timeline: (orderId: number, page: number, signal?: AbortSignal) => {
    if (!idSchema.safeParse(orderId).success) throw new ApiError(400, 'Invalid request ID.');
    validPage(page);
    return request(`/api/activity/orders/${orderId}/timeline?${query(page)}`, timelineSchema, {
      signal,
    });
  },
};
