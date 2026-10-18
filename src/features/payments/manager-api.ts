import { z } from 'zod';
import { request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import { paymentBase } from './api';
import { moneySchema, receiptSchema, timestampSchema, type Command } from './contracts';

export const bankSchema = z.object({
  transactionId: idSchema,
  amountReceived: moneySchema,
  currency: z.string(),
  status: z.enum(['RECONCILED', 'REVERSED']),
  postedAt: timestampSchema,
});
export type Bank = z.infer<typeof bankSchema>;
export type BankInput = {
  amountReceived: string;
  currency: 'USD';
  recipientAccount: string;
  bankTransactionReference: string;
  postedAt: string;
  verificationSource: string;
  proofFileKey: string;
  internalNotes: string | null;
};
export type RefundAction = 'APPROVE' | 'REJECT' | 'COMPLETE';
export const managerPaymentsApi = {
  request: (orderId: number, command: Command, input: { quoteId: number; scheduleId: number }) =>
    request(`${paymentBase(orderId)}/requests`, receiptSchema, {
      method: 'POST',
      body: { command, ...input },
    }),
  reconcile: (orderId: number, command: Command, input: BankInput) =>
    request(`${paymentBase(orderId)}/transactions`, receiptSchema, {
      method: 'POST',
      body: { command, ...input },
    }),
  bank: (orderId: number, id: number, signal?: AbortSignal) =>
    request(`${paymentBase(orderId)}/transactions/${id}`, bankSchema, { signal }),
  allocate: (
    orderId: number,
    command: Command,
    input: { transactionId: number; paymentRequestId: number; amount: string },
  ) =>
    request(`${paymentBase(orderId)}/allocations`, receiptSchema, {
      method: 'POST',
      body: { command, ...input },
    }),
  rejectReport: (orderId: number, id: number, command: Command, reason: string) =>
    request(`${paymentBase(orderId)}/reports/${id}/reject`, receiptSchema, {
      method: 'POST',
      body: { command, reason },
    }),
  refundAction: (
    orderId: number,
    id: number,
    command: Command,
    input: {
      action: RefundAction;
      bankRefundReference: string | null;
      proofFileKey: string | null;
      refundedAt: string | null;
    },
  ) =>
    request(`${paymentBase(orderId)}/refunds/${id}/actions`, receiptSchema, {
      method: 'POST',
      body: { command, ...input },
    }),
  reverse: (
    orderId: number,
    id: number,
    command: Command,
    input: { reason: string; proofFileKey: string },
  ) =>
    request(`${paymentBase(orderId)}/transactions/${id}/reversal`, receiptSchema, {
      method: 'POST',
      body: { command, ...input },
    }),
};
