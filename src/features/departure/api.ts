import { ApiError, request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import {
  readinessSchema,
  type AuthorizeInput,
  type Command,
  type DepartInput,
  type ReceiptInput,
} from './contracts';

function base(orderId: number) {
  if (!idSchema.safeParse(orderId).success) throw new ApiError(400, 'Invalid request ID.');
  return `/api/transport-orders/${orderId}/departure`;
}
/** Every departure write nests `command: {operationId, recordVersion}` (order version). */
function post<T>(path: string, { recordVersion, operationId, ...input }: Command<T>) {
  return request(path, readinessSchema, {
    method: 'POST',
    body: { command: { operationId, recordVersion }, ...input },
  });
}

export const departureApi = {
  get: (orderId: number, signal?: AbortSignal) =>
    request(base(orderId), readinessSchema, { signal }),
  evaluate: (orderId: number, body: Command<object>) =>
    post(`${base(orderId)}/gates/evaluate`, body),
  authorize: (orderId: number, body: Command<AuthorizeInput>) =>
    post(`${base(orderId)}/authorize`, body),
  // There is no separate receipts GET: receipts come back inside readiness.
  receipt: (orderId: number, body: Command<ReceiptInput>) =>
    post(`${base(orderId)}/horse-receipts`, body),
  depart: (orderId: number, body: Command<DepartInput>) => post(`${base(orderId)}/depart`, body),
};
