import { z } from 'zod';
import { idSchema, versionSchema } from '../../shared/api/contracts';

export const moneySchema = z.string().regex(/^\d{1,16}(\.\d{1,2})?$/);
export const timestampSchema = z.string().datetime({ offset: true });
export const proofKeySchema = z.uuid();
export const imageTypeSchema = z.enum(['image/png', 'image/jpeg']);
export const obligationSchema = z.object({
  paymentRequestId: idSchema,
  scheduleId: idSchema,
  quoteId: idSchema,
  paymentStage: z.string(),
  amountDue: moneySchema,
  currency: z.string(),
  dueAt: timestampSchema.nullable(),
  paidAmount: moneySchema,
});
export const reportSchema = z.object({
  reportId: idSchema,
  paymentRequestId: idSchema,
  reportedAmount: moneySchema,
  reportedCurrency: z.string(),
  transferredAt: timestampSchema,
  proofFileKey: proofKeySchema,
  status: z.enum(['SUBMITTED', 'REJECTED']),
});
export const allocationSchema = z.object({
  allocationId: idSchema,
  transactionId: idSchema,
  paymentRequestId: idSchema,
  amount: moneySchema,
});
export const refundSchema = z.object({
  refundId: idSchema,
  allocationId: idSchema,
  amount: moneySchema,
  reason: z.string(),
  status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED']),
  refundedAt: timestampSchema.nullable(),
});
// Public-safe whitelist: no account identifiers, purchase costs, or internal notes.
export const overviewSchema = z.object({
  recordVersion: versionSchema,
  obligations: z.array(obligationSchema),
  reports: z.array(reportSchema),
  allocations: z.array(allocationSchema),
  refunds: z.array(refundSchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive().max(100),
});
export const receiptSchema = z.object({ entityId: idSchema, recordVersion: versionSchema });
export const proofReceiptSchema = z.object({
  fileKey: proofKeySchema,
  mediaType: imageTypeSchema,
  size: z.number().int().positive().max(5242880),
});
export const proofViewSchema = z.object({
  fileKey: proofKeySchema,
  mediaType: imageTypeSchema,
  contentBase64: z
    .string()
    .min(1)
    .max(6990508)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
export type Overview = z.infer<typeof overviewSchema>;
export type Obligation = z.infer<typeof obligationSchema>;
export type Allocation = z.infer<typeof allocationSchema>;
export type Refund = z.infer<typeof refundSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type ProofReceipt = z.infer<typeof proofReceiptSchema>;
export type Command = { recordVersion: string; operationId: string };
export type ReportInput = {
  paymentRequestId: number;
  reportedAmount: string;
  reportedCurrency: 'USD';
  transferredAt: string;
  bankReference: string;
  proofFileKey: string;
};
export type RefundInput = { allocationId: number; amount: string; reason: string };
export type ProofInput = { mediaType: 'image/png' | 'image/jpeg'; contentBase64: string };
export type Values = Record<string, string>;
