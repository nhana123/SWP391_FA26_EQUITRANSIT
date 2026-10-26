import { request } from '../../shared/api/client';
import { bookingFlowStatusSchema } from '../../shared/api/contracts';
import { customerAssessmentSchema, orderPageSchema } from './status-contracts';

export const ORDER_PAGE_SIZE = 20;

// FE2 read adapters; FE1's ordersApi stays the owner of draft commands.
export const orderStatusApi = {
  list: (page: number, signal?: AbortSignal) =>
    request(
      `/api/transport-orders?${new URLSearchParams({
        page: String(page),
        size: String(ORDER_PAGE_SIZE),
      })}`,
      orderPageSchema,
      { signal },
    ),
  assessment: (id: number, signal?: AbortSignal) =>
    request(`/api/transport-orders/${id}/assessment`, customerAssessmentSchema, { signal }),
  bookingFlowStatus: (id: number, signal?: AbortSignal) =>
    request(`/api/transport-orders/${id}/booking-flow-status`, bookingFlowStatusSchema, { signal }),
};
