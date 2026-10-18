import { request } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/query';
import {
  overviewSchema,
  proofViewSchema,
  proofReceiptSchema,
  receiptSchema,
  type Command,
  type ReportInput,
  type RefundInput,
  type ProofInput,
} from './contracts';

export const PAYMENT_PAGE_SIZE = 20;
export const paymentKeys = {
  all: (generation: string, role: string, orderId: number) =>
    [...queryKeys.session(generation), 'payments', role, orderId] as const,
  overview: (generation: string, role: string, orderId: number, page: number) =>
    [...paymentKeys.all(generation, role, orderId), 'overview', page] as const,
};
export const paymentBase = (orderId: number) => `/api/transport-orders/${orderId}/payments`;
export const paymentsApi = {
  overview: (orderId: number, page: number, signal?: AbortSignal) =>
    request(
      `${paymentBase(orderId)}?${new URLSearchParams({ page: String(page), size: String(PAYMENT_PAGE_SIZE) })}`,
      overviewSchema,
      { signal },
    ),
  report: (orderId: number, command: Command, input: ReportInput) =>
    request(`${paymentBase(orderId)}/reports`, receiptSchema, {
      method: 'POST',
      body: { command, ...input },
    }),
  refund: (orderId: number, command: Command, input: RefundInput) =>
    request(`${paymentBase(orderId)}/refunds`, receiptSchema, {
      method: 'POST',
      body: { command, ...input },
    }),
  uploadProof: (orderId: number, command: Command, input: ProofInput) =>
    request(`${paymentBase(orderId)}/proofs`, proofReceiptSchema, {
      method: 'POST',
      body: { command, ...input },
    }),
  proof: (orderId: number, fileKey: string, signal?: AbortSignal) =>
    request(`${paymentBase(orderId)}/proofs/${encodeURIComponent(fileKey)}`, proofViewSchema, {
      signal,
    }),
};
