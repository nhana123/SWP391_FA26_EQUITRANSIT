import { z } from 'zod';
import { idSchema, versionSchema } from '../../shared/api/contracts';

// Mirrors BE PlanModels (F10). Only an active Manager or the case's assigned
// active Coordinator may read or write operational plans.
export const planStates = [
  'DRAFT',
  'PROPOSED',
  'PLANNED',
  'CONFIRMED',
  'ACTIVE',
  'IN_TRANSIT',
  // Set by F14 final delivery.
  'COMPLETED',
  'SUPERSEDED',
  'CANCELLED',
  'REJECTED',
] as const;
export const legModes = ['ROAD', 'AIR'] as const;
export type LegMode = (typeof legModes)[number];
export const reservationStates = ['HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED'] as const;
export type ReservationState = (typeof reservationStates)[number];
export const assignmentStates = [
  'HELD',
  'CONFIRMED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'INACTIVE',
] as const;
export type AssignmentState = (typeof assignmentStates)[number];
export const carrierStates = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type CarrierState = (typeof carrierStates)[number];
const gate = z.enum(['PENDING', 'PASS', 'BLOCKED']);

const text = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const optionalId = idSchema.nullish().transform((v) => v ?? null);
const optionalInt = z
  .number()
  .int()
  .nullish()
  .transform((v) => v ?? null);
/** Size/slot/km BigDecimals are JSON numbers; keep them as text for display. */
const decimal = z.union([z.number(), z.string()]).transform(String);

export const tripAssignmentSchema = z.object({
  assignmentId: idSchema,
  legId: idSchema,
  staffId: idSchema,
  roleInTrip: z.enum(['DRIVER', 'GROOM', 'ATTENDANT', 'VETERINARIAN', 'ESCORT']),
  assignedFrom: text,
  assignedTo: text,
  status: z.enum(assignmentStates),
  bufferMinutes: optionalInt,
  conflictNotes: text,
});
export const stallAssignmentSchema = z.object({
  stallAssignmentId: idSchema,
  legId: idSchema,
  stallId: idSchema,
  slotQuantity: decimal,
  sharingCode: z.enum(['PRIVATE', 'SHARED', 'WIDE']),
  fitStatus: z.string(),
  carrierAcceptanceStatus: z.enum(carrierStates),
  assignedFrom: text,
  assignedTo: text,
  status: z.enum(assignmentStates),
  positionDescription: text,
  carrierApprovalFileKey: text,
  carrierApprovedAt: text,
  carrierContact: text,
});
export const flightReservationSchema = z.object({
  reservationId: idSchema,
  legId: idSchema,
  offerId: idSchema,
  airlineName: z.string(),
  flightNumber: z.string(),
  reservationReference: text,
  status: z.enum(reservationStates),
  confirmedAt: text,
  evidenceFileKey: text,
  expiresAt: text,
  confirmedBy: optionalId,
  supplierContact: text,
  usableCapacitySlots: decimal,
});
export const legSchema = z.object({
  legId: idSchema,
  planId: idSchema,
  vehicleId: optionalId,
  sequenceNo: z.number().int().positive(),
  transportMode: z.enum(legModes),
  startPoint: z.string(),
  endPoint: z.string(),
  distanceKm: decimal,
  plannedDeparture: z.string(),
  plannedArrival: z.string(),
  legStatus: z.string(),
  startTimezone: text,
  endTimezone: text,
  supplierId: optionalId,
  plannedFlightNumber: text,
  connectionBufferMinutes: optionalInt,
  restDurationMinutes: optionalInt,
  careInstructions: text,
  distanceSource: text,
  distanceConfirmedBy: optionalId,
  distanceConfirmedAt: text,
  staffAssignments: z.array(tripAssignmentSchema),
  stallAssignments: z.array(stallAssignmentSchema),
  flightReservations: z.array(flightReservationSchema),
});
export type Leg = z.infer<typeof legSchema>;
export const quarantineSchema = z.object({
  reservationId: idSchema,
  quarantineChoiceId: idSchema,
  facilityName: z.string(),
  reservationReference: text,
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(reservationStates),
  supplierId: optionalId,
  evidenceFileKey: text,
  confirmedBy: optionalId,
  confirmedAt: text,
  expiresAt: text,
  facilityContact: text,
});
export const insuranceSchema = z.object({
  policyId: idSchema,
  insuranceChoiceId: idSchema,
  insurerName: z.string(),
  policyNumber: z.string(),
  evidenceFileKey: text,
  coverageFrom: z.string(),
  coverageTo: z.string(),
  status: z.enum(reservationStates),
  verifiedBy: optionalId,
  verifiedAt: text,
  policyTerms: text,
});
const summaryFields = {
  planId: idSchema,
  revisionId: idSchema,
  versionNo: z.number().int().positive(),
  planStatus: z.enum(planStates),
  currentPlan: z.boolean(),
  acceptedQuoteId: optionalId,
  createdBy: idSchema,
  plannedStartTime: z.string(),
  plannedEndTime: z.string(),
  financialGateStatus: gate,
  operationalGateStatus: gate,
  docGateStatus: gate,
};
export const planSummarySchema = z.object({ orderId: idSchema, ...summaryFields });
export type PlanSummary = z.infer<typeof planSummarySchema>;
export const planPageSchema = z.object({
  items: z.array(planSummarySchema),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  totalElements: z.number().int().nonnegative(),
});
export const planDetailSchema = z.object({
  orderId: idSchema,
  // The parent TransportOrder rowversion every plan write must carry.
  recordVersion: versionSchema,
  ...summaryFields,
  gatesCheckedAt: text,
  legs: z.array(legSchema),
  quarantineReservations: z.array(quarantineSchema),
  insurancePolicies: z.array(insuranceSchema),
  confirmationBlockers: z.array(z.string()),
});
export type PlanDetail = z.infer<typeof planDetailSchema>;
export const candidateSchema = z.object({
  candidateOrderId: idSchema,
  candidateRevisionId: idSchema,
  originCountryCode: z.string(),
  destinationCountryCode: z.string(),
  sharingCode: z.enum(['PRIVATE', 'SHARED', 'WIDE']),
  candidateSlotQuantity: decimal,
  combinedSlotQuantity: decimal,
  candidatePlanId: optionalId,
  candidateAirLegId: optionalId,
  plannedFlightNumber: text,
  assignedStallId: optionalId,
  windowStart: z.string(),
  windowEnd: z.string(),
});
export type Candidate = z.infer<typeof candidateSchema>;

/** Flat command for useCaseCommand; the adapter nests `command`. */
export type Command<T> = T & { recordVersion: string; operationId: string };
export type LegInput = {
  sequenceNo: number;
  transportMode: LegMode;
  startPoint: string;
  endPoint: string;
  distanceKm: number;
  distanceSource: string;
  plannedDeparture: string;
  plannedArrival: string;
  startTimezone: string | null;
  endTimezone: string | null;
  supplierId: number | null;
  plannedFlightNumber: string | null;
  connectionBufferMinutes: number | null;
  restDurationMinutes: number | null;
  careInstructions: string | null;
  /**
   * AIR legs only: the surveyed fare in USD (> 0, 2 decimals). The BE totals
   * it into the AIRFARE quotation source; plan reads do not return it.
   */
  estimatedAirfare?: number | null;
};
export type DraftInput = { revisionId: number; setAsCurrentDraft: boolean; legs: LegInput[] };
export type RoadInput = {
  vehicleId: number;
  vehicleRecordVersion: string;
  driverStaffId: number;
  driverBufferMinutes: number;
  conflictNotes: string | null;
};
export type StallInput = {
  stallId: number;
  stallRecordVersion: string;
  carrierAcceptanceStatus: CarrierState;
  status: AssignmentState;
  positionDescription: string | null;
  carrierApprovalFileKey: string | null;
  carrierContact: string | null;
};
export type FlightInput = {
  offerId: number;
  airlineName: string;
  flightNumber: string;
  reservationReference: string | null;
  status: ReservationState;
  evidenceFileKey: string | null;
  expiresAt: string | null;
  supplierContact: string | null;
  usableCapacitySlots: number;
};
export type QuarantineInput = {
  revisionId: number;
  facilityName: string;
  reservationReference: string | null;
  startsAt: string;
  endsAt: string;
  status: ReservationState;
  supplierId: number | null;
  evidenceFileKey: string | null;
  expiresAt: string | null;
  facilityContact: string | null;
};
export type InsuranceInput = {
  revisionId: number;
  insurerName: string;
  policyNumber: string;
  evidenceFileKey: string | null;
  coverageFrom: string;
  coverageTo: string;
  status: ReservationState;
  policyTerms: string | null;
};
export type ConfirmInput = { acceptedQuoteId: number };

/** Plans that can still change; confirmed/superseded/terminal ones are immutable. */
export const editablePlan = (status: PlanDetail['planStatus']) =>
  status === 'DRAFT' || status === 'PROPOSED' || status === 'PLANNED';

/** Confirmation blockers emitted by BE OperationalPlanPolicy; unknown codes shown as is. */
export const blockerLabels: Record<string, string> = {
  NO_LEGS: 'The plan has no legs',
  LEG_DISTANCE_UNCONFIRMED: 'A leg distance has no confirmed source',
  ROAD_VEHICLE_MISSING: 'A road leg has no vehicle assigned',
  ROAD_DRIVER_MISSING: 'A road leg has no driver assigned',
  ROAD_LEG_HAS_AIR_RESOURCES: 'A road leg has a stall or flight attached',
  AIR_LEG_HAS_ROAD_RESOURCES: 'An air leg has a vehicle or driver attached',
  AIR_STALL_NOT_CONFIRMED: 'An air leg has no confirmed stall assignment',
  AIR_FLIGHT_NOT_CONFIRMED: 'An air leg has no confirmed flight reservation',
  CARRIER_ACCEPTANCE_REQUIRED: 'The carrier has not accepted the stall',
  CARRIER_PROOF_REQUIRED: 'Carrier approval evidence is missing',
  STALL_ASSIGNMENT_STATUS_INVALID: 'A stall assignment is not in a confirmable state',
  FLIGHT_CAPACITY_INSUFFICIENT: 'The flight has too little usable stall capacity',
  FLIGHT_CONFIRMATION_INCOMPLETE: 'A flight reservation lacks reference, evidence or confirmer',
  FLIGHT_RESERVATION_EXPIRED: 'A flight reservation has expired',
  FLIGHT_STATUS_INVALID: 'A flight reservation is held or cancelled, not confirmed',
  QUARANTINE_ASSESSMENT_PENDING: 'The specialist quarantine assessment is pending',
  QUARANTINE_NOT_CONFIRMED: 'Quarantine is required but not confirmed',
  QUARANTINE_CONFIRMATION_INCOMPLETE: 'The quarantine reservation lacks evidence or confirmer',
  QUARANTINE_DAYS_INSUFFICIENT: 'The quarantine reservation is shorter than the required days',
  QUARANTINE_WINDOW_INVALID: 'The quarantine window is invalid',
  INSURANCE_NOT_VERIFIED: 'The insurance policy is not verified',
  INSURANCE_EVIDENCE_REQUIRED: 'Insurance evidence is missing',
  INSURANCE_COVERAGE_GAP: 'Insurance does not cover the whole planned window',
  INSURANCE_WINDOW_INVALID: 'The insurance coverage window is invalid',
  DEPOSIT_REQUIRED_BEFORE_ROAD_ASSIGNMENT:
    'Customer must complete the 30% deposit payment before road vehicle and driver assignment',
  DEPOSIT_REQUIRED_BEFORE_AIR_ASSIGNMENT:
    'Customer must accept the quote and complete the 30% deposit payment before stall or flight assignment',
  BALANCE_REQUIRED_BEFORE_DEPARTURE:
    'The remaining 70% balance must be paid and reconciled before departure',
};
export const blockerText = (code: string) => blockerLabels[code] ?? code;

export const errorHelp: Record<string, string> = {
  ORDER_VERSION_CONFLICT: 'The case changed. Reload and review before trying again.',
  PLAN_RETRY_CONFLICT:
    'This operation was already used with different input. Reload and start a new action.',
  PLAN_REVISION_CONFLICT: 'The request revision changed. Reload the case and plan again.',
  PLAN_REVISION_MISMATCH: 'This plan belongs to another revision.',
  PLAN_IMMUTABLE: 'This plan version can no longer change. Create a new draft version.',
  PLAN_NOT_FOUND: 'This plan is not available.',
  PLAN_SCHEMA_PENDING: 'Operational planning is not deployed on this server yet (migration 011).',
  PLAN_DATA_UNSUPPORTED: 'This plan holds legacy data that cannot be changed safely.',
  PLAN_CONFIRMATION_BLOCKED: 'The plan still has confirmation blockers.',
  PLAN_SCHEDULE_CONFLICT: 'The schedule conflicts with another active plan.',
  PLAN_SEQUENCE_INVALID: 'Leg sequence numbers must run 1, 2, 3… without gaps.',
  PLAN_CONNECTION_OVERLAP: 'A leg departs before the previous leg arrives.',
  PLAN_WINDOW_INVALID: 'A leg must arrive after it departs.',
  PLAN_DISTANCE_INVALID: 'Distances must be positive.',
  PLAN_DISTANCE_SOURCE_BLANK: 'Every leg needs a distance source.',
  PLAN_LEGS_EMPTY: 'Add at least one leg.',
  PLAN_MODE_INVALID: 'Use ROAD or AIR legs only.',
  COORDINATOR_REQUIRED_FOR_DISTANCE: 'Only staff on this case can confirm distances.',
  CURRENT_PLAN_PROTECTED: 'A confirmed plan is current; a draft cannot replace it.',
  LEG_MODE_MISMATCH: 'This resource does not belong on this leg mode.',
  DRIVER_NOT_ELIGIBLE: 'This staff ID is not an active driver.',
  DRIVER_OVERLAP: 'The driver is already assigned in an overlapping window.',
  RESOURCE_SCHEDULE_OVERLAP: 'The resource is already assigned in an overlapping window.',
  RESOURCE_BUSY: 'Resources are busy. Retry sends exactly the same action.',
  RESOURCE_VERSION_CONFLICT: 'The resource changed. Check its availability again.',
  RESOURCE_NOT_AVAILABLE: 'The resource is not available for this leg. Check availability.',
  SUPPLIER_INACTIVE: 'The supplier is inactive.',
  OFFER_INVALID_OR_EXPIRED: 'The airfare offer is invalid or expired.',
  OFFER_REVISION_MISMATCH: 'The airfare offer belongs to another revision.',
  QUARANTINE_CHOICE_MISSING: 'The request has no quarantine choice to reserve.',
  INSURANCE_CHOICE_MISSING: 'The request has no insurance choice to verify.',
  HORSE_SCHEDULE_OVERLAP: 'The horse already has an active plan in this window.',
  DEPOSIT_REQUIRED_BEFORE_ROAD_ASSIGNMENT:
    'Chưa thể phân công Tài xế & Xe đường bộ: Khách hàng cần hoàn tất thanh toán đặt cọc 30% trước khi phân công.',
  DEPOSIT_REQUIRED_BEFORE_AIR_ASSIGNMENT:
    'Chưa thể phân công Chuồng bay & Chuyến bay: Khách hàng cần chấp nhận báo giá và hoàn tất đặt cọc 30% trước.',
  BALANCE_REQUIRED_BEFORE_DEPARTURE:
    'Khách hàng cần thanh toán 70% chi phí còn lại trước khi khởi hành.',
};
