import { request } from '../../shared/api/client';
import { casePageSchema, caseSchema } from '../assessment/contracts';

export const ASSIGNED_PAGE_SIZE = 20;
const base = '/api/staff/transport-orders';

// Staff routes only: the BE scopes both reads to the caller's live
// assignment, so no customer/manager endpoint or client-side filtering.
export const assignedCasesApi = {
  list: (page: number, signal?: AbortSignal) =>
    request(
      `${base}?${new URLSearchParams({ page: String(page), size: String(ASSIGNED_PAGE_SIZE) })}`,
      casePageSchema,
      { signal },
    ),
  get: (id: number, signal?: AbortSignal) => request(`${base}/${id}`, caseSchema, { signal }),
};
