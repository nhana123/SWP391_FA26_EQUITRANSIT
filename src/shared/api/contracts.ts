import { z } from 'zod';

export const idSchema = z
  .number()
  .int()
  .positive()
  .refine(Number.isSafeInteger, 'ID exceeds JavaScript safe integer range');
export const versionSchema = z.string().regex(/^[\da-f]{16}$/i);
export const roleSchema = z.enum(['CUSTOMER', 'MANAGER', 'SPECIALIST', 'COORDINATOR', 'DRIVER']);
export type Role = z.infer<typeof roleSchema>;
export const orderStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
  'IN_PREPARATION',
  'CONFIRMED',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'CANCELED',
  'CLOSED',
]);
export const messageSchema = z.object({ message: z.string() });
export const loginSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().positive(),
  role: roleSchema,
});
export type LoginResponse = z.infer<typeof loginSchema>;
export const customerSchema = z.object({
  customerId: idSchema,
  userId: idSchema,
  fullName: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
});
export const horseSchema = z.object({
  horseId: idSchema,
  name: z.string(),
  microchipId: z.string().nullable(),
  passportNumber: z.string().nullable(),
  breed: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  sexCode: z.enum(['STALLION', 'MARE', 'GELDING']).nullable(),
  weightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
  bodyWidthCm: z.number().nullable(),
  measuredAt: z.string().nullable(),
  specialCareNotes: z.string().nullable(),
  handlingNotes: z.string().nullable(),
  feedWaterRequirements: z.string().nullable(),
  stallPreferences: z.string().nullable(),
  veterinaryInstructions: z.string().nullable(),
  veterinaryInstructionSource: z.string().nullable(),
  recordVersion: versionSchema,
  measurementsComplete: z.boolean(),
});
export type Horse = z.infer<typeof horseSchema>;
export type HorseInput = Omit<Horse, 'horseId' | 'recordVersion' | 'measurementsComplete'>;
export const preferencesSchema = z.object({
  roadArrangement: z.enum(['EQUITRANSIT', 'CUSTOMER']).nullable().optional(),
  veterinaryArrangement: z.enum(['EQUITRANSIT', 'CUSTOMER']).nullable().optional(),
  airStall: z.enum(['SHARED_ONE', 'WIDE', 'PRIVATE']).nullable().optional(),
  enhancedCare: z.boolean().nullable().optional(),
  groomingDays: z.number().int().nullable().optional(),
  boardingNights: z.number().int().nullable().optional(),
  quarantinePackage: z.enum(['STANDARD', 'ENHANCED']).nullable().optional(),
  insurance: z.enum(['NONE', 'EXISTING', 'MORTALITY', 'COMBINED']).nullable().optional(),
  declaredValue: z.string().nullable().optional(),
  existingPolicyReference: z.string().nullable().optional(),
  escortNotes: z.string().nullable().optional(),
  roadProviderName: z.string().nullable().optional(),
  roadProviderContact: z.string().nullable().optional(),
  veterinaryProviderName: z.string().nullable().optional(),
  veterinaryProviderContact: z.string().nullable().optional(),
});
export type ServicePreferences = z.infer<typeof preferencesSchema>;
const nullableText = z.string().nullable();
export const draftSchema = z.object({
  horseId: idSchema.nullable(),
  originCountryCode: nullableText,
  destinationCountryCode: nullableText,
  originAddress: nullableText,
  destinationAddress: nullableText,
  originTimezone: nullableText,
  destinationTimezone: nullableText,
  preferredDepartureAt: nullableText,
  deliveryDeadline: nullableText,
  dateFlexibilityNotes: nullableText,
  importType: z.enum(['TEMPORARY', 'PERMANENT', 'NEEDS_ADVICE']).nullable(),
  receiverName: nullableText,
  receiverPhone: nullableText,
  receiverEmail: nullableText,
  receiverAuthority: nullableText,
  eventStartAt: nullableText,
  eventName: nullableText,
  eventVenue: nullableText,
  eventTimezone: nullableText,
  transitAirports: z.array(z.string()).nullable(),
  specialNeeds: nullableText,
  services: preferencesSchema.nullable(),
});
export type OrderDraft = z.infer<typeof draftSchema>;
export const orderSchema = z.object({
  orderId: idSchema,
  orderNumber: z.string(),
  orderStatus: orderStatusSchema,
  currency: z.string(),
  recordVersion: versionSchema,
  currentRevisionId: idSchema.nullable(),
  currentPlanId: idSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  draft: draftSchema,
});
export type Order = z.infer<typeof orderSchema>;
export const horsePageSchema = z.object({
  items: z.array(horseSchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const submitReceiptSchema = z.object({ revisionId: idSchema }).passthrough();
