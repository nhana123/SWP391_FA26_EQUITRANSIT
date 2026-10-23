import { z } from 'zod';
import { request } from '../../../shared/api/client';
import { idSchema, versionSchema } from '../../../shared/api/contracts';
import {
  nodeKinds,
  type Checkpoint,
  type Journey,
  type Layout,
  type Wire,
  ordered,
  atOffset,
  TIMEZONE,
} from './model';
const optionalText = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const optionalId = idSchema.nullish().transform((v) => v ?? null);
const decimal = z.union([z.string(), z.number()]).transform(Number);
const detailsSchema = z.object({
  contactPerson: optionalText,
  requireMicrochipCheck: z.boolean().nullish(),
  preDepartureVetNote: optionalText,
  feedingAndWateringPlan: optionalText,
  mandatoryVetCheck: z.boolean().nullish(),
  facilitySupplierId: optionalId,
  quarantineType: z.enum(['PRE_EXPORT', 'POST_ARRIVAL']).nullish(),
  reservedStallCount: z.number().nullish(),
  biosecurityLevel: z.enum(['STANDARD', 'HIGH_ISOLATION']).nullish(),
  groundHandlerSupplierId: optionalId,
  receiverName: optionalText,
  receiverPhone: optionalText,
  insurerSupplierId: optionalId,
  policyNumber: optionalText,
  coverageAmount: optionalText,
});
const nodeSchema = z.object({
  nodeKey: z.string(),
  nodeType: z.enum(nodeKinds),
  sequenceOrder: z.number(),
  locationName: z.string(),
  countryCode: z.string(),
  plannedArrivalAt: optionalText,
  plannedDepartureAt: optionalText,
  dwellMinutes: z.number(),
  transitCustomsMode: z
    .enum(['STAY_ON_AIRCRAFT', 'AIRSIDE_TRANSFER', 'TERMINAL_HOLDING'])
    .nullish()
    .transform((v) => v ?? null),
  transitPermitRef: optionalText,
  welfareCareNotes: optionalText,
  quarantineReservationId: optionalId,
  posX: decimal,
  posY: decimal,
  details: detailsSchema.nullish().transform((v) => v ?? null),
});
const wireSchema = z.object({
  legId: idSchema,
  sequenceNo: z.number(),
  fromNodeKey: z.string(),
  toNodeKey: z.string(),
  transportMode: z.enum(['ROAD', 'AIR']),
  legStatus: z.string(),
  startPoint: z.string(),
  endPoint: z.string(),
  distanceKm: z.union([z.number(), z.string()]).transform(String),
  distanceSource: optionalText,
  plannedDeparture: z.string(),
  plannedArrival: z.string(),
  actualDeparture: optionalText,
  actualArrival: optionalText,
  vehicleId: optionalId,
  driverStaffId: optionalId,
  flightNumber: optionalText,
  stallEquipmentId: optionalId,
  assignedToCurrentDriver: z.boolean(),
});
export const graphSchema = z.object({
  orderId: idSchema,
  planId: idSchema,
  revisionId: idSchema,
  planStatus: z.string(),
  recordVersion: versionSchema,
  editable: z.boolean(),
  checkpointNodes: z.array(nodeSchema),
  wires: z.array(wireSchema),
  layout: z.object({ zoom: decimal, panX: decimal, panY: decimal }),
});
export type GraphView = z.infer<typeof graphSchema>;
const base = (orderId: number) => `/api/transport-orders/${idSchema.parse(orderId)}/plans`;
const endpoint = (orderId: number, planId: number) =>
  `${base(orderId)}/${idSchema.parse(planId)}/graph`;
export function fromGraph(g: GraphView): Journey {
  return {
    nodes: g.checkpointNodes,
    wires: g.wires.map((w) => ({
      ...w,
      id: `leg-${w.legId}`,
      distanceSource: w.distanceSource ?? '',
    })),
    layout: g.layout,
  };
}
function canonical(value: string | null) {
  return value ? atOffset(Date.parse(value)) : null;
}
const round = (n: number) => Math.round(n * 100) / 100;
export function cleanLayout(l: Layout) {
  return { zoom: round(l.zoom), panX: round(l.panX), panY: round(l.panY) };
}
/** Typed compilation: checkpoints never bypass resource/evidence commands. */
export function compileBody(
  j: Journey,
  revisionId: number,
  recordVersion: string,
  operationId: string,
) {
  const chain = ordered(j);
  if (!chain) throw new Error('Hành trình chưa được nối thành một tuyến.');
  const nodes: Checkpoint[] = chain.nodes.map((n, i) => ({
    ...n,
    sequenceOrder: i + 1,
    posX: round(n.posX),
    posY: round(n.posY),
    plannedArrivalAt: canonical(n.plannedArrivalAt),
    plannedDepartureAt: canonical(n.plannedDepartureAt),
  }));
  chain.wires.forEach((w, i) => {
    nodes[i].plannedDepartureAt = canonical(w.plannedDeparture);
    nodes[i + 1].plannedArrivalAt = canonical(w.plannedArrival);
  });
  return {
    draft: {
      command: { recordVersion, operationId },
      revisionId,
      setAsCurrentDraft: true,
      legs: chain.wires.map((w: Wire, i: number) => ({
        sequenceNo: i + 1,
        transportMode: w.transportMode,
        startPoint: nodes[i].locationName.trim(),
        endPoint: nodes[i + 1].locationName.trim(),
        distanceKm: Number(w.distanceKm),
        distanceSource: w.distanceSource,
        plannedDeparture: canonical(w.plannedDeparture),
        plannedArrival: canonical(w.plannedArrival),
        startTimezone: TIMEZONE,
        endTimezone: TIMEZONE,
        supplierId: w.supplierId ?? null,
        plannedFlightNumber: w.flightNumber || null,
        connectionBufferMinutes: nodes[i].dwellMinutes,
        restDurationMinutes: nodes[i].nodeType === 'REST_STOP' ? nodes[i].dwellMinutes : null,
        careInstructions: null,
        estimatedAirfare:
          w.transportMode === 'AIR' && w.estimatedAirfare ? Number(w.estimatedAirfare) : null,
      })),
    },
    checkpointNodes: nodes,
    wires: chain.wires.map((w, i) => ({
      sequenceNo: i + 1,
      fromNodeKey: w.fromNodeKey,
      toNodeKey: w.toNodeKey,
    })),
    layout: cleanLayout(j.layout),
  };
}
export const graphApi = {
  get: (orderId: number, planId: number, signal?: AbortSignal) =>
    request(endpoint(orderId, planId), graphSchema, { signal }),
  compile: (orderId: number, body: ReturnType<typeof compileBody>) =>
    request(`${base(orderId)}/graph-drafts`, graphSchema, { method: 'POST', body }),
  positions: (
    orderId: number,
    planId: number,
    j: Journey,
    recordVersion: string,
    operationId: string,
  ) =>
    request(endpoint(orderId, planId), graphSchema, {
      method: 'PUT',
      body: {
        command: { recordVersion, operationId },
        positions: j.nodes.map((n) => ({
          nodeKey: n.nodeKey,
          posX: round(n.posX),
          posY: round(n.posY),
        })),
        layout: cleanLayout(j.layout),
      },
    }),
  drivers: (orderId: number, planId: number, legId: number, search: string) =>
    request(
      `${base(orderId)}/${planId}/legs/${legId}/graph-drivers?${new URLSearchParams({ search, bufferMinutes: '0' })}`,
      z.array(z.object({ staffId: idSchema, fullName: z.string() })),
    ),
};
