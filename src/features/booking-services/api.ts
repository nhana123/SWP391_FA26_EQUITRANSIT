import { request } from '../../shared/api/client';
import { confirmationSchema, disclosureSchema, type ConfirmCommand } from './contracts';

// No pricing-preview endpoint exists: estimates only change after confirm.
export const bookingApi = {
  get: (id: number, signal?: AbortSignal) =>
    request(`/api/transport-orders/${id}/services`, disclosureSchema, { signal }),
  confirm: (id: number, body: ConfirmCommand) =>
    request(`/api/transport-orders/${id}/services/confirm`, confirmationSchema, {
      method: 'POST',
      body,
    }),
};
