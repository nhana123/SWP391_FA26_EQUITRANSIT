import { request } from '../../shared/api/client';
import { orderSchema, submitReceiptSchema, type OrderDraft } from '../../shared/api/contracts';
export type SubmitCommand = { recordVersion: string; operationId: string };
export const ordersApi = {
  get: (id: number, signal?: AbortSignal) =>
    request(`/api/transport-orders/${id}`, orderSchema, { signal }),
  create: (body: OrderDraft) =>
    request('/api/transport-orders', orderSchema, { method: 'POST', body }),
  update: (id: number, body: OrderDraft & { recordVersion: string }) =>
    request(`/api/transport-orders/${id}/draft`, orderSchema, { method: 'PUT', body }),
  submit: (id: number, body: SubmitCommand) =>
    request(`/api/transport-orders/${id}/submit`, submitReceiptSchema, { method: 'POST', body }),
};
