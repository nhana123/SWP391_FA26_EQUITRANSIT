import { z } from 'zod';
import { ApiError, request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import {
  adjustmentSchema,
  customerAdjustmentSchema,
  evolutionSchema,
  incidentSchema,
  type AdjustmentInput,
  type IncidentInput,
} from './contracts';

function id(v: number) {
  if (!idSchema.safeParse(v).success) throw new ApiError(400, 'Invalid ID.');
  return String(v);
}
// Paths and POST methods follow the BE controllers (the BE doc says PUT).
export const incidentsApi = {
  reportAsDriver: (legId: number, body: IncidentInput) =>
    request(`/api/driver/legs/${id(legId)}/incidents`, incidentSchema, { method: 'POST', body }),
  reportAsStaff: (legId: number, body: IncidentInput) =>
    request(`/api/coordinator/legs/${id(legId)}/incidents`, incidentSchema, {
      method: 'POST',
      body,
    }),
  forLeg: (legId: number, signal?: AbortSignal) =>
    request(`/api/coordinator/legs/${id(legId)}/incidents`, z.array(incidentSchema), { signal }),
  acknowledge: (incidentId: number, notes: string | null) =>
    request(`/api/coordinator/incidents/${id(incidentId)}/acknowledge`, incidentSchema, {
      method: 'POST',
      body: { notes },
    }),
  resolve: (incidentId: number, resolutionNotes: string) =>
    request(`/api/coordinator/incidents/${id(incidentId)}/resolve`, incidentSchema, {
      method: 'POST',
      body: { resolutionNotes },
    }),
  adjustments: (planId: number, signal?: AbortSignal) =>
    request(`/api/coordinator/plans/${id(planId)}/adjustments`, z.array(adjustmentSchema), {
      signal,
    }),
  propose: (planId: number, body: AdjustmentInput) =>
    request(`/api/coordinator/plans/${id(planId)}/adjustments`, adjustmentSchema, {
      method: 'POST',
      body,
    }),
  approve: (adjustmentId: number, approvalNotes: string | null) =>
    request(`/api/manager/adjustments/${id(adjustmentId)}/approve`, evolutionSchema, {
      method: 'POST',
      body: { approvalNotes },
    }),
  reject: (adjustmentId: number, approvalNotes: string | null) =>
    request(`/api/manager/adjustments/${id(adjustmentId)}/reject`, adjustmentSchema, {
      method: 'POST',
      body: { approvalNotes },
    }),
  customerAdjustments: (orderId: number, signal?: AbortSignal) =>
    request(
      `/api/customer/transport-orders/${id(orderId)}/adjustments`,
      z.array(customerAdjustmentSchema),
      { signal },
    ),
  decide: (
    orderId: number,
    adjustmentId: number,
    body: { decision: 'ACCEPTED' | 'REJECTED'; responseNotes: string | null },
  ) =>
    request(
      `/api/customer/transport-orders/${id(orderId)}/adjustments/${id(adjustmentId)}/decision`,
      customerAdjustmentSchema,
      { method: 'POST', body },
    ),
};
