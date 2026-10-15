import { z } from 'zod';
import { idSchema, orderSchema, type Order } from '../../shared/api/contracts';

export const orderPageSchema = z.object({
  items: z.array(orderSchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type OrderPage = z.infer<typeof orderPageSchema>;

// Public customer view only: decision is null while the Manager has not
// decided, and reason is never sent for APPROVED (no internal notes).
export const customerAssessmentSchema = z.object({
  currentRevisionId: idSchema.nullable(),
  decision: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']).nullable(),
  reason: z.string().nullable(),
});
export type CustomerAssessment = z.infer<typeof customerAssessmentSchema>;

export const orderStatusLabels: Record<Order['orderStatus'], string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting assessment',
  APPROVED: 'Approved for preparation',
  CHANGES_REQUESTED: 'Changes requested',
  REJECTED: 'Rejected',
  IN_PREPARATION: 'In preparation',
  CONFIRMED: 'Confirmed',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  CANCELED: 'Cancelled',
  CLOSED: 'Closed',
};
