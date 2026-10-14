import { request } from '../../shared/api/client';
import { casePageSchema, type ReviewState } from './contracts';

export const QUEUE_PAGE_SIZE = 20;

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
};
