import { z } from 'zod';
import { idSchema } from '../../shared/api/contracts';

// Mirrors BE activity DTOs TaskPage/TaskView and TimelineResponse/TimelinePoint.
// Neither carries prices, actual cost, notes or other internal data.
export const taskSchema = z.object({
  assignmentId: idSchema,
  orderId: idSchema,
  // Case tasks have no leg; driver tasks identify the exact leg.
  legId: idSchema.nullish().transform((v) => v ?? null),
  role: z.string(),
  dueAt: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
});
export type Task = z.infer<typeof taskSchema>;
export const taskPageSchema = z.object({
  items: z.array(taskSchema),
  totalElements: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
});

/** Known ActivityCode values; an unknown future code is shown as received. */
export const milestones = [
  'SUBMITTED',
  'ACCEPTED',
  'PAYMENT_ALLOCATED',
  'PAID',
  'CLEARED',
  'DEPARTED',
  'DELIVERED',
  'CLOSED',
  'UPDATED',
] as const;
export const timelinePointSchema = z.object({ milestone: z.string(), occurredAt: z.string() });
export type TimelinePoint = z.infer<typeof timelinePointSchema>;
// The observed timeline has no totalElements.
export const timelineSchema = z.object({
  orderId: idSchema,
  items: z.array(timelinePointSchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
});

/** Labels say exactly what each recorded fact means, never more. */
export const milestoneLabels: Record<(typeof milestones)[number], string> = {
  SUBMITTED: 'Request submitted',
  ACCEPTED: 'Quotation accepted',
  PAYMENT_ALLOCATED: 'Payment allocated',
  PAID: 'Fully paid from reconciled bank transfers',
  CLEARED: 'Legally cleared',
  DEPARTED: 'Departed',
  DELIVERED: 'Delivered',
  CLOSED: 'Closed',
  UPDATED: 'Updated',
};
export const milestoneText = (code: string) =>
  (milestoneLabels as Record<string, string>)[code] ?? code;

export const taskRoleLabels: Record<string, string> = {
  SPECIALIST: 'Specialist review',
  COORDINATOR: 'Coordination',
  DRIVER: 'Road leg',
};
