import { z } from 'zod';
import { idSchema, versionSchema } from '../../shared/api/contracts';

// Mirrors BE DepartureModels (F11). Gates come only from the server; the FE
// never derives a gate or a "paid" state itself.
export const gateStates = ['PENDING', 'PASS', 'BLOCKED'] as const;
export type GateState = (typeof gateStates)[number];

const text = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const optionalId = idSchema.nullish().transform((v) => v ?? null);

export const gateSchema = z.object({
  status: z.enum(gateStates),
  blockers: z.array(z.string()),
});
export type Gate = z.infer<typeof gateSchema>;
export const receiptSchema = z.object({
  receiptId: idSchema,
  planId: idSchema,
  legId: optionalId,
  receivedBy: optionalId,
  observedMicrochip: text,
  observedPassportNumber: text,
  identityCheckResult: z.enum(['MATCHED', 'MISMATCHED', 'PENDING']),
  receiptStatus: z.enum(['ACCEPTED', 'REJECTED', 'PENDING']),
  conditionNotes: text,
  evidenceFileKey: text,
  locationDescription: text,
  receivedAt: z.string(),
});
export type HorseReceipt = z.infer<typeof receiptSchema>;
export const readinessSchema = z.object({
  orderId: idSchema,
  // Parent TransportOrder rowversion every departure write carries.
  recordVersion: versionSchema,
  orderStatus: z.string(),
  currentRevisionId: optionalId,
  planId: optionalId,
  planVersionNo: z
    .number()
    .int()
    .nullish()
    .transform((v) => v ?? null),
  planStatus: text,
  acceptedQuoteId: optionalId,
  firstLegId: optionalId,
  firstLegStatus: text,
  firstLegActualDeparture: text,
  asOf: z.string(),
  gatesCheckedAt: text,
  financialGate: gateSchema,
  // JSON name is legalGate (not docGate).
  legalGate: gateSchema,
  operationalGate: gateSchema,
  // Observations only: the BE rechecks everything inside each write.
  readyForAuthorization: z.boolean(),
  departureAuthorizedBy: optionalId,
  departureAuthorizedAt: text,
  readyForDeparture: z.boolean(),
  departureBlockers: z.array(z.string()),
  receipts: z.array(receiptSchema),
});
export type Readiness = z.infer<typeof readinessSchema>;

/** Flat command for useCaseCommand; the adapter nests `command`. */
export type Command<T> = T & { recordVersion: string; operationId: string };
export type AuthorizeInput = { planId: number };
export type ReceiptInput = {
  planId: number;
  legId: number;
  observedMicrochip: string;
  observedPassportNumber: string;
  fitToTravel: boolean;
  conditionNotes: string | null;
  evidenceFileKey: string | null;
  locationDescription: string;
};
export type DepartInput = { planId: number; legId: number; receiptId: number };

/** The latest receipt that can support departure: MATCHED identity and ACCEPTED. */
export function usableReceipt(r: Readiness) {
  const forLeg = r.receipts
    .filter((x) => x.planId === r.planId && x.legId === r.firstLegId)
    .sort((a, b) => b.receiptId - a.receiptId);
  const latest = forLeg[0];
  return latest && latest.identityCheckResult === 'MATCHED' && latest.receiptStatus === 'ACCEPTED'
    ? latest
    : null;
}

/** Codes emitted by BE DepartureGateService/Policy and the compliance facade. */
export const blockerLabels: Record<string, string> = {
  CURRENT_PLAN_MISSING: 'There is no current operational plan',
  PLAN_NOT_CONFIRMED: 'The current plan is not confirmed',
  ACCEPTED_QUOTE_MISSING: 'No accepted quotation is linked to the plan',
  ROAD_VEHICLE_MISSING: 'The first road leg has no vehicle',
  ROAD_VEHICLE_UNAVAILABLE: 'The assigned vehicle is not available',
  ROAD_DRIVER_INACTIVE: 'The assigned driver is not active',
  ROAD_DRIVER_OVERLAP: 'The driver has an overlapping assignment',
  AIR_STALL_UNAVAILABLE: 'An assigned air stall is not available',
  HORSE_SCHEDULE_OVERLAP: 'The horse has another active plan in this window',
  COMPLIANCE_HOLD_ACTIVE: 'A legal hold is active',
  DEPARTURE_AUTHORIZATION_REQUIRED: 'A manager has not authorized departure',
  HORSE_RECEIPT_MISSING: 'The driver has not recorded receiving the horse',
  HORSE_RECEIPT_NOT_ACCEPTED: 'The latest horse receipt is not accepted',
  HORSE_IDENTITY_MISMATCHED: 'The observed microchip or passport does not match',
  REVISION_MISMATCH: 'The request revision changed',
  PHASE_CLEARANCE_PENDING: 'Pre-export legal clearance is pending',
  DOCUMENT_EVIDENCE_PENDING: 'Required legal documents are not approved',
  AUTHORITY_EVIDENCE_PENDING: 'An authority decision with evidence is still required',
};
export const blockerText = (code: string) => blockerLabels[code] ?? code;

export const errorHelp: Record<string, string> = {
  ORDER_VERSION_MISMATCH: 'The case changed. Reload and review before trying again.',
  IDEMPOTENCY_CONFLICT:
    'This operation was already used with different input. Reload and start a new action.',
  DEPARTURE_GATE_BLOCKED: 'A gate is not passing. Re-evaluate and review the blockers.',
  DEPARTURE_NOT_AUTHORIZED: 'A manager must authorize departure first.',
  DEPARTURE_SCHEMA_PENDING: 'Departure is not deployed on this server yet (migration 012).',
  DEPARTURE_DATA_UNSUPPORTED: 'This case holds legacy data that cannot be changed safely.',
  DEPARTURE_CONSTRAINT_VIOLATION: 'The database rejected this departure. Reload and review.',
  FIRST_ROAD_LEG_REQUIRED: 'Only the first road leg can be received and departed here.',
  LEG_NOT_READY_FOR_RECEIPT: 'This leg is not ready for a horse receipt.',
  LEG_ALREADY_DEPARTED_OR_INVALID: 'This leg already departed or is not valid.',
  HORSE_RECEIPT_INVALID: 'The receipt is not valid for this leg.',
  HORSE_RECEIPT_REJECTED_OR_MISMATCHED:
    'The latest receipt is rejected or the identity did not match. Record a new receipt.',
  PLAN_MISMATCH: 'The plan changed. Reload and review.',
  PLAN_NOT_CONFIRMED: 'The current plan is not confirmed.',
  CURRENT_PLAN_MISSING: 'There is no current operational plan.',
  CASE_NOT_FOUND: 'This case is not available to you.',
  RESOURCE_LOCK_BUSY: 'Resources are busy. Retry sends exactly the same action.',
};
