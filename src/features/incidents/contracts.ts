import { z } from 'zod';
import { idSchema } from '../../shared/api/contracts';

// Mirrors the F13 DTOs on BE branch feature/13-incidents-controlled-operational-
// adjustments (not yet merged into BE dev). These writes carry no operationId
// or record version: the server cannot de-duplicate a retried request.
export const incidentTypes = [
  'HORSE_WELFARE_EMERGENCY',
  'VEHICLE_BREAKDOWN',
  'TRAFFIC_DELAY',
  'FLIGHT_DELAY',
  'WEATHER_DISRUPTION',
  'BORDER_HOLD',
  'FACILITY_ISSUE',
  'OTHER',
] as const;
export type IncidentType = (typeof incidentTypes)[number];
export const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof severities)[number];

const text = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const optionalId = idSchema.nullish().transform((v) => v ?? null);
/** BigDecimal arrives as a JSON number; keep exact text for display. */
const money = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v.toFixed(2) : v));

export const incidentSchema = z.object({
  incidentId: idSchema,
  legId: idSchema,
  reportedBy: idSchema,
  reporterName: text,
  incidentType: z.string(),
  severityLevel: z.string(),
  incidentTime: text,
  description: z.string(),
  status: z.string(),
  immediateActionNotes: text,
  emergencyContact: text,
  acknowledgedBy: optionalId,
  acknowledgedByName: text,
  acknowledgedAt: text,
  resolvedBy: optionalId,
  resolvedByName: text,
  resolvedAt: text,
  resolutionNotes: text,
  evidenceFilesJson: text,
});
export type Incident = z.infer<typeof incidentSchema>;

export const adjustmentSchema = z.object({
  adjustmentId: idSchema,
  planId: idSchema,
  orderId: idSchema,
  incidentId: optionalId,
  changeRequestId: optionalId,
  proposedBy: idSchema,
  proposerName: text,
  approvedBy: optionalId,
  approverName: text,
  proposedChanges: z.string(),
  additionalCostEstimate: money,
  approvalStatus: z.string(),
  proposedAt: text,
  decidedAt: text,
  customerDecision: z.string(),
  respondedByCustomerId: optionalId,
  customerRespondedAt: text,
  customerResponseNotes: text,
});
export type Adjustment = z.infer<typeof adjustmentSchema>;
/** Redacted customer view: no staff identity or internal cost breakdown. */
export const customerAdjustmentSchema = z.object({
  adjustmentId: idSchema,
  orderId: idSchema,
  additionalCost: money,
  customerDecision: z.string(),
  approvalStatus: z.string(),
  summary: text,
  proposedAt: text,
  customerResponseNotes: text,
  respondedAt: text,
});
export type CustomerAdjustment = z.infer<typeof customerAdjustmentSchema>;
export const evolutionSchema = z.object({
  adjustmentId: idSchema,
  orderId: idSchema,
  previousPlanId: idSchema,
  newPlanId: idSchema,
  newVersionNo: z.number().int(),
  evolvedLegCount: z.number().int(),
  approvalStatus: z.string(),
  decidedAt: text,
  message: text,
});

export type IncidentInput = {
  incidentType: IncidentType;
  severityLevel: Severity;
  incidentTime: string | null;
  description: string;
  immediateActionNotes: string | null;
  emergencyContact: string | null;
  evidenceFilesJson: string | null;
};
export type AdjustmentInput = {
  incidentId: number | null;
  changeRequestId: number | null;
  proposedChanges: string;
  additionalCostEstimate: string;
  customerDescription: string | null;
};

export const typeLabels: Record<IncidentType, string> = {
  HORSE_WELFARE_EMERGENCY: 'Horse welfare emergency',
  VEHICLE_BREAKDOWN: 'Vehicle breakdown',
  TRAFFIC_DELAY: 'Traffic delay',
  FLIGHT_DELAY: 'Flight delay',
  WEATHER_DISRUPTION: 'Weather disruption',
  BORDER_HOLD: 'Border hold',
  FACILITY_ISSUE: 'Facility issue',
  OTHER: 'Other',
};
/** Reads the human summary from the ProposedChanges JSON, or shows it as text. */
export function changeSummary(json: string) {
  try {
    const value: unknown = JSON.parse(json);
    if (value && typeof value === 'object' && 'summary' in value) return String(value.summary);
  } catch {
    // Legacy or free-form content is shown as recorded.
  }
  return json;
}

export const errorHelp: Record<string, string> = {
  CUSTOMER_CONSENT_REQUIRED: 'The customer has not accepted the additional cost yet.',
  ADJUSTMENT_NOT_PENDING_CONSENT: 'This adjustment is no longer waiting for your decision.',
  ADJUSTMENT_ALREADY_DECIDED: 'This adjustment was already decided.',
  INVALID_CUSTOMER_DECISION: 'Choose accept or reject.',
  INVALID_PROPOSED_CHANGES: 'Describe the proposed change.',
  INVALID_JSON: 'The change details or evidence list are not valid.',
  NEGATIVE_COST_ESTIMATE: 'The additional cost cannot be negative.',
  RESOLUTION_NOTES_REQUIRED: 'Resolution notes are required to resolve an incident.',
  FUTURE_TIMESTAMP_NOT_PERMITTED: 'The incident time cannot be in the future.',
  INVALID_INCIDENT_STATUS_TRANSITION: 'This incident is no longer in a state that allows this.',
  ACCESS_DENIED: 'You are not assigned to this work.',
};
