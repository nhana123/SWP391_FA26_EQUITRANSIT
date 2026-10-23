import { z } from 'zod';
import { idSchema, orderStatusSchema } from '../../shared/api/contracts';

export const countSchema = z.number().int().nonnegative().refine(Number.isSafeInteger);
export const activityTimestamp = z.string().datetime({ offset: true });
const pageFields = {
  totalElements: countSchema,
  page: z.number().int().min(0).max(2147483647),
  size: z.number().int().min(1).max(100),
};
// Explicit public-safe boundaries: unknown bank/cost/private fields are stripped.
export const dashboardSchema = z.object({
  role: z.literal('CUSTOMER'),
  counts: z.array(z.object({ status: orderStatusSchema, count: countSchema })),
  items: z.array(
    z.object({ orderId: idSchema, orderNumber: z.string(), status: orderStatusSchema }),
  ),
  ...pageFields,
});
export const notificationSchema = z.object({
  notificationId: idSchema,
  orderId: idSchema.nullable(),
  title: z.string(),
  message: z.string(),
  createdAt: activityTimestamp,
  readAt: activityTimestamp.nullable(),
});
export const notificationsSchema = z.object({ items: z.array(notificationSchema), ...pageFields });
export const emailPreferenceSchema = z.object({ enabled: z.boolean() });
export type Dashboard = z.infer<typeof dashboardSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationPage = z.infer<typeof notificationsSchema>;
export type EmailPreference = z.infer<typeof emailPreferenceSchema>;
