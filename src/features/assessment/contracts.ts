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

// Mirrors BE DecisionCode.
export const decisionCodes = ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'] as const;
export const decisionCodeSchema = z.enum(decisionCodes);
export type DecisionCode = z.infer<typeof decisionCodeSchema>;

export const caseDecisionSchema = z.object({
  decisionId: idSchema,
  revisionId: idSchema,
  managerId: idSchema,
  decision: decisionCodeSchema,
  reason: z.string().nullable(),
  decidedAt: z.string(),
});
export type CaseDecision = z.infer<typeof caseDecisionSchema>;

export const caseAssignmentSchema = z.object({
  assignmentId: idSchema,
  staffId: idSchema,
  role: caseRoleSchema,
  assignedAt: z.string(),
  endedAt: z.string().nullable(),
  assignedBy: idSchema.nullable(),
  dueAt: z.string().nullable(),
  assignmentNote: z.string().nullable(),
});
export type CaseAssignment = z.infer<typeof caseAssignmentSchema>;

// Only the snapshot fields this screen renders are validated; the captured
// revision is shown as-is and never re-read from the live horse/order.
const text = z.string().nullable().optional();
const amount = z.number().nullable().optional();
export const snapshotSchema = z.object({
  schemaVersion: z.number().int(),
  request: z.object({
    originCountryCode: text,
    destinationCountryCode: text,
    originAddress: text,
    destinationAddress: text,
    originTimezone: text,
    destinationTimezone: text,
    preferredDepartureAt: text,
    deliveryDeadline: text,
    dateFlexibilityNotes: text,
    importType: text,
    receiverName: text,
    receiverAuthority: text,
    eventName: text,
    eventStartAt: text,
    eventTimezone: text,
    transitAirports: z.array(z.string()).nullable().optional(),
    specialNeeds: text,
  }),
  horse: z
    .object({
      name: z.string(),
      microchipId: text,
      passportNumber: text,
      sexCode: text,
      weightKg: amount,
      heightCm: amount,
      bodyWidthCm: amount,
      measuredAt: text,
      handlingNotes: text,
      feedWaterRequirements: text,
      veterinaryInstructions: text,
    })
    .nullable(),
  services: z.array(
    z.object({
      serviceCode: z.string(),
      optionCode: text,
      arrangedBy: text,
      providerName: text,
    }),
  ),
});
export type OrderSnapshot = z.infer<typeof snapshotSchema>;

export const revisionSchema = z.object({
  revisionId: idSchema,
  orderId: idSchema,
  revisionNo: z.number().int().positive(),
  changeReason: z.string().nullable(),
  submittedAt: z.string(),
  snapshot: snapshotSchema,
});

export const caseSchema = z.object({
  orderId: idSchema,
  orderNumber: z.string(),
  orderStatus: orderStatusSchema,
  recordVersion: versionSchema,
  currentRevisionId: idSchema.nullable(),
  revision: revisionSchema.nullable(),
  decision: caseDecisionSchema.nullable(),
  assignments: z.array(caseAssignmentSchema),
});
export type ManagerCase = z.infer<typeof caseSchema>;

export const assessmentReceiptSchema = z.object({
  orderId: idSchema,
  orderStatus: orderStatusSchema,
  recordVersion: versionSchema,
  decision: caseDecisionSchema.nullable(),
  assignments: z.array(caseAssignmentSchema),
});
export type AssessmentReceipt = z.infer<typeof assessmentReceiptSchema>;

/** Exact BE AssessmentRequest; assignment fields must be null unless APPROVED. */
export type AssessmentCommand = {
  revisionId: number;
  recordVersion: string;
  operationId: string;
  decision: DecisionCode;
  reason: string | null;
  specialistId: number | null;
  coordinatorId: number | null;
  dueAt: string | null;
  assignmentNote: string | null;
};

/** BE CaseAssignmentRequest: full replacement, omitted dueAt/note clear them. */
export type AssignCommand = {
  recordVersion: string;
  operationId: string;
  staffId: number;
  reason: string;
  dueAt: string | null;
  assignmentNote: string | null;
};

/** BE EndCaseAssignmentRequest. */
export type EndAssignmentCommand = {
  recordVersion: string;
  operationId: string;
  reason: string;
};
