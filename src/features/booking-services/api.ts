import { request } from '../../shared/api/client';
import {
  confirmationSchema,
  disclosureSchema,
  type ConfirmCommand,
  type Preferences,
} from './contracts';

/** Read-only preview: no operationId, no persisted side effect. */
export type PreviewCommand = {
  recordVersion: string;
  horseRecordVersion: string | null;
  services: Preferences;
};

export const bookingApi = {
  preview: (id: number, body: PreviewCommand, signal?: AbortSignal) =>
    request(`/api/transport-orders/${id}/services/preview`, disclosureSchema, {
      method: 'POST',
      body,
      signal,
    }),
  get: (id: number, signal?: AbortSignal) =>
    request(`/api/transport-orders/${id}/services`, disclosureSchema, { signal }),
  confirm: (id: number, body: ConfirmCommand) =>
    request(`/api/transport-orders/${id}/services/confirm`, confirmationSchema, {
      method: 'POST',
      body,
    }),
};
