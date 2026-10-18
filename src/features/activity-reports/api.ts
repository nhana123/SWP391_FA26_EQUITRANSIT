import { z } from 'zod';
import { request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import { quoteMoneySchema } from '../quotations/contracts';
import { activityTimestamp, countSchema } from '../activity-customer/contracts';

// Separate Manager-only contracts. Never merge these into a Customer DTO/cache.
export const financialReportSchema = z.object({
  currency: z.literal('USD'),
  quotedValue: quoteMoneySchema,
  reportedTransfers: quoteMoneySchema,
  netBankReceipts: quoteMoneySchema,
  netAllocated: quoteMoneySchema,
  actualCost: quoteMoneySchema,
  operationallyCompletedOrders: countSchema,
  closedOrders: countSchema,
});
export type FinancialReport = z.infer<typeof financialReportSchema>;
export const auditSchema = z.object({
  items: z.array(
    z.object({
      eventId: idSchema,
      userId: idSchema.nullable(),
      entityType: z.string(),
      entityId: countSchema,
      actionCode: z.string(),
      occurredAt: activityTimestamp,
      redactedSnapshot: z.string(),
    }),
  ),
  totalElements: countSchema,
  page: z.number().int().min(0).max(2147483647),
  size: z.number().int().min(1).max(100),
});
export const managerActivityApi = {
  financial: (signal?: AbortSignal) =>
    request('/api/manager/reports/financial', financialReportSchema, { signal }),
  audit: (page: number, signal?: AbortSignal) =>
    request(`/api/manager/audit-events?page=${page}&size=20`, auditSchema, { signal }),
};
