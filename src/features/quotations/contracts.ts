import { z } from 'zod';
import { idSchema, versionSchema } from '../../shared/api/contracts';

// F06 DTOs at BE 5b8b369. Do not reuse F05 estimate states or recalculate money.
export const quotationStatuses = [
  'DRAFT',
  'APPROVED',
  'ISSUED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED',
] as const;
export const quotationStatusSchema = z.enum(quotationStatuses);
export type QuotationStatus = z.infer<typeof quotationStatusSchema>;
export const quoteLineStatuses = [
  'PRICED',
  'INCLUDED',
  'PENDING',
  'NOT_REQUIRED',
  'EXTERNAL_PROVIDER',
  'NOT_SELECTED',
  'EVENT_ONLY',
] as const;
export const quoteMoneySchema = z.string().regex(/^\d+(\.\d{1,2})?$/);
export const quoteQuantitySchema = z.string().regex(/^\d+(\.\d{1,3})?$/);
const timestamp = z.string().datetime({ offset: true });
export const QUOTATION_CURRENCY = 'USD' as const; // The current BE contract allows USD only.
export const quoteSummarySchema = z.object({
  quoteId: idSchema,
  revisionId: idSchema,
  quoteNumber: z.string().min(1).max(30),
  version: z.number().int().positive(),
  status: quotationStatusSchema,
  total: quoteMoneySchema.nullable(),
  validUntil: timestamp,
});
export type QuoteSummary = z.infer<typeof quoteSummarySchema>;
export const quotePageSchema = z.object({
  items: z.array(quoteSummarySchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().min(1).max(100),
  totalElements: z.number().int().nonnegative().refine(Number.isSafeInteger),
});
export type QuotePage = z.infer<typeof quotePageSchema>;
export const quoteLineSchema = z.object({
  code: z.string().min(1).max(50),
  costGroup: z.string().min(1).max(50),
  description: z.string().min(1).max(2000),
  unit: z.string().min(1).max(50),
  quantity: quoteQuantitySchema.nullable(),
  unitRate: quoteMoneySchema.nullable(),
  amount: quoteMoneySchema.nullable(),
  pricingStatus: z.enum(quoteLineStatuses),
  blockers: z.array(z.string()),
});
export type QuoteLine = z.infer<typeof quoteLineSchema>;
export const quoteScheduleSchema = z.object({
  // Older servers omit the key; payment creation stays unavailable then.
  scheduleId: idSchema.nullish(),
  sequenceNo: z.number().int().positive(),
  paymentStage: z.string().min(1).max(50),
  amountDue: quoteMoneySchema,
  dueAt: timestamp,
});
export type QuoteSchedule = z.infer<typeof quoteScheduleSchema>;
// Zod strips unknown properties: only the public-safe DTO enters feature caches.
export const quoteResponseSchema = z.object({
  quote: quoteSummarySchema,
  recordVersion: versionSchema, // TransportOrder version, never a tariff/quote version.
  currency: z.literal(QUOTATION_CURRENCY),
  termsVersion: z.string().min(1).max(50),
  terms: z.string().min(1).max(10000),
  cancellationTerms: z.string().min(1).max(10000),
  issuedAt: timestamp.nullable(),
  acceptedAt: timestamp.nullable(),
  items: z.array(quoteLineSchema),
  paymentSchedule: z.array(quoteScheduleSchema),
  blockers: z.array(z.string()),
});
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
