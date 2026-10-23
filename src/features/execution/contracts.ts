import { z } from 'zod';
import { idSchema, versionSchema } from '../../shared/api/contracts';

// Mirrors BE ExecutionModels (F12). Facts are append-only evidence entered by
// staff; nothing here is continuous tracking or an automated diagnosis.
export const sourceCodes = ['DRIVER_REPORT', 'CARRIER', 'AIRPORT', 'AUTHORITY'] as const;
export type SourceCode = (typeof sourceCodes)[number];
export const milestoneTypes = ['POSITION', 'DELAY', 'UPDATE'] as const;
export type MilestoneType = (typeof milestoneTypes)[number];
export const healthStatuses = ['NORMAL', 'CONCERN', 'URGENT'] as const;
export type HealthStatus = (typeof healthStatuses)[number];

const text = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
export const legSchema = z.object({
  legId: idSchema,
  sequenceNo: z.number().int().positive(),
  transportMode: z.enum(['ROAD', 'AIR']),
  legStatus: z.string(),
  plannedDeparture: z.string(),
  plannedArrival: z.string(),
  actualDeparture: text,
  actualArrival: text,
});
export type ExecutionLeg = z.infer<typeof legSchema>;
// NON_NULL on the BE: absent fields arrive missing, and customers never receive
// internal/behavior/care notes.
export const milestoneSchema = z.object({
  milestoneId: idSchema,
  legId: idSchema,
  milestoneType: z.string(),
  occurredAt: z.string(),
  recordedAt: z.string(),
  sourceCode: z.string(),
  sourceReference: text,
  latitude: text,
  longitude: text,
  locationDescription: text,
  estimatedArrivalAt: text,
  delayReason: text,
  publicNote: text,
  internalNotes: text,
  customerVisible: z.boolean(),
});
export type Milestone = z.infer<typeof milestoneSchema>;
export const welfareSchema = z.object({
  welfareLogId: idSchema,
  legId: idSchema,
  healthStatus: z.enum(healthStatuses),
  occurredAt: z.string(),
  recordedAt: z.string(),
  temperatureCelsius: text,
  waterIntakeLiters: text,
  feedIntakeKg: text,
  sourceCode: z.string(),
  sourceReference: text,
  behaviorNotes: text,
  careNotes: text,
  publicNote: text,
  supersedesLogId: idSchema.nullish().transform((v) => v ?? null),
  customerVisible: z.boolean(),
});
export type WelfareLog = z.infer<typeof welfareSchema>;
export const overviewSchema = z.object({
  orderId: idSchema,
  planId: idSchema,
  // Parent order version every execution write carries.
  recordVersion: versionSchema,
  orderStatus: z.string(),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
  legCount: z.number().int().nonnegative(),
  milestoneCount: z.number().int().nonnegative(),
  welfareCount: z.number().int().nonnegative(),
  lastUpdateAt: text,
  legs: z.array(legSchema),
  milestones: z.array(milestoneSchema),
  welfareLogs: z.array(welfareSchema),
  // The consignee from the request, for the final handover; older servers omit it.
  receiverName: text,
  receiverAuthority: text,
});
export type ExecutionOverview = z.infer<typeof overviewSchema>;
export const receiptSchema = z.object({
  orderId: idSchema,
  recordVersion: versionSchema,
  operationId: z.string(),
  legId: idSchema,
  entityId: idSchema,
  // An URGENT welfare log opens one critical incident for staff response.
  incidentId: idSchema.nullish().transform((v) => v ?? null),
});
export type ExecutionReceipt = z.infer<typeof receiptSchema>;

export type Command<T> = T & { recordVersion: string; operationId: string };
export type TransitionInput = {
  occurredAt: string;
  sourceCode: SourceCode;
  sourceReference: string;
};
export type MilestoneInput = TransitionInput & {
  milestoneType: MilestoneType;
  latitude: string | null;
  longitude: string | null;
  locationDescription: string | null;
  estimatedArrivalAt: string | null;
  delayReason: string | null;
  publicNote: string | null;
  internalNotes: string | null;
  customerVisible: boolean;
};
export type WelfareInput = {
  occurredAt: string;
  healthStatus: HealthStatus;
  sourceCode: SourceCode;
  sourceReference: string;
  temperatureCelsius: string | null;
  waterIntakeLiters: string | null;
  feedIntakeKg: string | null;
  behaviorNotes: string | null;
  careNotes: string | null;
  publicNote: string | null;
  customerVisible: boolean;
  supersedesLogId: number | null;
};

export const sourceLabels: Record<SourceCode, string> = {
  DRIVER_REPORT: 'Driver report',
  CARRIER: 'Carrier',
  AIRPORT: 'Airport',
  AUTHORITY: 'Authority',
};
/** AIR facts never come from a driver report. */
export const sourcesFor = (mode: 'ROAD' | 'AIR') =>
  mode === 'AIR' ? sourceCodes.filter((s) => s !== 'DRIVER_REPORT') : sourceCodes;
export const milestoneLabels: Record<string, string> = {
  POSITION: 'Position',
  DELAY: 'Delay',
  UPDATE: 'Update',
  LEG_STARTED: 'Leg started',
  LEG_COMPLETED: 'Leg completed',
};

export const errorHelp: Record<string, string> = {
  ORDER_VERSION_CONFLICT: 'The case changed. Reload and review before trying again.',
  IDEMPOTENCY_CONFLICT:
    'This operation was already used with different input. Reload and start a new action.',
  EXECUTION_NOT_DEPARTED: 'The first leg has not departed yet (departure happens in F11).',
  EXECUTION_REVISION_MISMATCH: 'The request revision changed. Reload.',
  EXECUTION_SCHEMA_PENDING: 'Leg execution is not deployed on this server yet (migration 014).',
  EXECUTION_NOT_FOUND: 'This leg is not available to you.',
  FIRST_LEG_REQUIRES_F11: 'The first leg starts through the departure page.',
  PREVIOUS_LEG_NOT_COMPLETED: 'The previous leg must be completed first.',
  LEG_NOT_DEPARTED: 'This leg has not started yet.',
  LEG_NOT_IN_TRANSIT: 'This leg is not in transit.',
  LEG_STATE_CONFLICT: 'This leg changed state. Reload and review.',
  ETA_BEFORE_EVENT: 'The estimated arrival cannot be before the event.',
  EXECUTION_TIME_INVALID:
    'The time must be within the leg’s actual interval and not in the future.',
  AIR_SOURCE_REQUIRED: 'Air leg facts need a carrier, airport or authority source.',
  COORDINATE_PAIR_REQUIRED: 'Enter both latitude and longitude, or neither.',
  COORDINATES_OUT_OF_RANGE: 'Latitude is ±90 and longitude ±180.',
  PUBLIC_CORRECTION_MUST_REMAIN_VISIBLE:
    'A correction of a customer-visible entry must stay visible to the customer.',
  WELFARE_ALREADY_SUPERSEDED: 'That entry was already corrected; correct the latest one.',
  WELFARE_CORRECTION_WRONG_LEG: 'A correction must be for the same leg.',
};
