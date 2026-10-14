import { z } from 'zod';
import { idSchema, orderStatusSchema, versionSchema } from '../../shared/api/contracts';

// Mirrors BE ReviewState; DRAFT is never part of the Manager review queue.
export const reviewStates = ['SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'] as const;
export const reviewStateSchema = z.enum(reviewStates);
export type ReviewState = z.infer<typeof reviewStateSchema>;

export const caseSummarySchema = z.object({
  orderId: idSchema,
  orderNumber: z.string(),
  orderStatus: orderStatusSchema,
  recordVersion: versionSchema,
  currentRevisionId: idSchema.nullable(),
  originCountryCode: z.string(),
  destinationCountryCode: z.string(),
  deliveryDeadline: z.string().nullable(),
});
export type CaseSummary = z.infer<typeof caseSummarySchema>;

export const casePageSchema = z.object({
  items: z.array(caseSummarySchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type CasePage = z.infer<typeof casePageSchema>;

// Mirrors BE CaseRole: only these preparation roles can be assigned to a case.
export const caseRoles = ['SPECIALIST', 'COORDINATOR'] as const;
export const caseRoleSchema = z.enum(caseRoles);
export type CaseRole = z.infer<typeof caseRoleSchema>;

export const caseStaffSchema = z.object({
  // StaffID, never UserID: assignment commands reference this key.
  staffId: idSchema,
  fullName: z.string(),
  role: caseRoleSchema,
  activeCases: z.number().int().nonnegative(),
  // BE currently only sends NOT_CONFIGURED; keep it open so a new value is
  // shown as unknown instead of breaking the directory.
  availabilityStatus: z.string(),
});
export type CaseStaff = z.infer<typeof caseStaffSchema>;

export const caseStaffPageSchema = z.object({
  items: z.array(caseStaffSchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type CaseStaffPage = z.infer<typeof caseStaffPageSchema>;
