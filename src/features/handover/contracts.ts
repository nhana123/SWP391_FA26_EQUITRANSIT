import { z } from 'zod';
import { idSchema } from '../../shared/api/contracts';

// Mirrors BE F14 DTOs (dto/handover, commit 3d6dd6d). Writes carry no
// operationId or recordVersion; the server cannot de-duplicate a retry.
export const intermediateTypes = [
  'INTERMEDIATE_CARRIER',
  'INTERMEDIATE_AIRPORT',
  'INTERMEDIATE_QUARANTINE',
] as const;
export type IntermediateType = (typeof intermediateTypes)[number];
export const conditions = ['EXCELLENT', 'GOOD', 'FAIR', 'INJURED', 'DISTRESSED'] as const;
export type Condition = (typeof conditions)[number];
export const outcomes = ['SUCCESSFUL', 'EXCEPTION', 'DISPUTED'] as const;
export type Outcome = (typeof outcomes)[number];
export const decisions = ['ACCEPTED', 'EXCEPTION', 'NOT_DELIVERED'] as const;
export type Decision = (typeof decisions)[number];
export const costCodes = [
  'AIR_FREIGHT',
  'ROAD_TOLL',
  'FUEL',
  'QUARANTINE_LODGING',
  'CUSTOMS_DUTY',
  'VET_EMERGENCY',
  'HANDLING_FEE',
  'OTHER',
] as const;
export type CostCode = (typeof costCodes)[number];

export const typeLabels: Record<string, string> = {
  INTERMEDIATE_CARRIER: 'Transfer to carrier',
  INTERMEDIATE_AIRPORT: 'Transfer at airport',
  INTERMEDIATE_QUARANTINE: 'Transfer to quarantine',
  FINAL_RECEIVER: 'Final delivery to receiver',
};
export const conditionLabels: Record<string, string> = {
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  FAIR: 'Fair',
  INJURED: 'Injured',
  DISTRESSED: 'Distressed',
};
export const outcomeLabels: Record<string, string> = {
  SUCCESSFUL: 'Successful',
  EXCEPTION: 'With exception',
  DISPUTED: 'Disputed',
};
export const decisionLabels: Record<string, string> = {
  ACCEPTED: 'I accept the delivery',
  EXCEPTION: 'Delivered with a problem',
  NOT_DELIVERED: 'Not delivered',
};
export const costLabels: Record<string, string> = {
  AIR_FREIGHT: 'Air freight',
  ROAD_TOLL: 'Road toll',
  FUEL: 'Fuel',
  QUARANTINE_LODGING: 'Quarantine lodging',
  CUSTOMS_DUTY: 'Customs duty',
  VET_EMERGENCY: 'Emergency vet',
  HANDLING_FEE: 'Handling fee',
  OTHER: 'Other',
};
export const label = (labels: Record<string, string>, code: string | null) =>
  code === null ? '—' : (labels[code] ?? code);

const time = z.string();
const text = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const decimal = z.union([z.number(), z.string()]).transform((v) => String(v));

/** Staff view: full record with staff identity and internal notes. */
export const handoverSchema = z.object({
  handoverId: idSchema,
  legId: idSchema,
  orderId: idSchema,
  planId: idSchema,
  recordedByName: text,
  handoverType: z.string(),
  handoverTime: time,
  receivedByName: z.string(),
  receiverAuthority: text,
  receiverSignatureFileKey: text,
  horseConditionStatus: z.string(),
  outcome: z.string(),
  exceptionNotes: text,
  photoFileKey: text,
  locationDescription: text,
  customerDecision: text,
  customerFeedback: text,
  customerRespondedAt: text,
});
export type Handover = z.infer<typeof handoverSchema>;

/** Customer view: the BE redacts staff identity, notes and every cost. */
export const customerHandoverSchema = z.object({
  handoverId: idSchema,
  orderId: idSchema,
  handoverType: z.string(),
  handoverTime: time,
  receivedByName: z.string(),
  horseConditionStatus: z.string(),
  outcome: z.string(),
  photoFileKey: text,
  receiverSignatureFileKey: text,
  locationDescription: text,
  customerDecision: text,
  customerFeedback: text,
  customerRespondedAt: text,
});
export type CustomerHandover = z.infer<typeof customerHandoverSchema>;

export const completionSchema = z.object({
  handoverId: idSchema,
  orderId: idSchema,
  planId: idSchema,
  legId: idSchema,
  orderStatus: z.string(),
  planStatus: z.string(),
  completedAt: time,
  receivedByName: z.string(),
  horseConditionStatus: z.string(),
  quarantineReleaseVerified: z.boolean(),
});
export type Completion = z.infer<typeof completionSchema>;

export const costSchema = z.object({
  costId: idSchema,
  planId: idSchema,
  legId: idSchema.nullish().transform((v) => v ?? null),
  costCode: z.string(),
  amount: decimal,
  currency: z.string(),
  incurredAt: time,
  description: text,
  recordedByName: text,
  evidenceFileKey: text,
});
export type ActualCost = z.infer<typeof costSchema>;

export const profitabilitySchema = z.object({
  planId: idSchema,
  orderId: idSchema,
  currency: z.string(),
  totalQuotedAmount: decimal,
  totalActualCost: decimal,
  grossProfit: decimal,
  profitMarginPercent: decimal,
  costCount: z.number().int().nonnegative(),
});
export type Profitability = z.infer<typeof profitabilitySchema>;

export interface HandoverInput {
  handoverTime: string;
  receivedByName: string;
  receiverAuthority: string | null;
  receiverSignatureFileKey: string | null;
  horseConditionStatus: Condition;
  outcome: Outcome;
  exceptionNotes: string | null;
  photoFileKey: string | null;
  locationDescription: string | null;
}
export interface CostInput {
  legId: number | null;
  costCode: CostCode;
  /** BigDecimal on the BE: sent as a JSON number. */
  amount: number;
  currency: string;
  incurredAt: string;
  description: string | null;
  evidenceFileKey: string | null;
}

/** BE error codes for F14, explained in plain words. */
export const errorHelp: Record<string, string> = {
  QUARANTINE_RELEASE_REQUIRED:
    'Final delivery is blocked: the destination quarantine release has not passed yet.',
  RECEIVER_IDENTITY_MISMATCH:
    'The receiver does not match the order receiver. Enter their authority (e.g. STABLE_MANAGER, TRAINER, GROOM, VETERINARIAN) if they receive on the owner’s behalf.',
  SIGNATURE_REQUIRED: 'Final delivery needs the receiver’s signature file key.',
  HANDOVER_PHOTO_REQUIRED: 'Final delivery needs a photo of the horse at the destination stall.',
  NOT_FINAL_LEG: 'Final delivery is only possible on the last leg of the plan.',
  LEG_NOT_IN_TRANSIT: 'This leg is not in transit, so no handover can be recorded.',
  INVALID_HANDOVER_TYPE: 'That handover type does not fit this action.',
  INVALID_CUSTOMER_DECISION: 'Choose one of the listed answers.',
  HANDOVER_ALREADY_DECIDED:
    'An answer was already recorded for this handover and cannot be changed.',
  NEGATIVE_COST_AMOUNT: 'The amount cannot be negative.',
  LEG_NOT_IN_PLAN: 'That leg does not belong to this plan.',
  FUTURE_TIMESTAMP_NOT_PERMITTED: 'The time cannot be in the future.',
  INVALID_JSON: 'The evidence data is not valid.',
};
