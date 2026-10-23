import { z } from 'zod';
import { ApiError, request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import {
  closureSchema,
  completionSchema,
  costSchema,
  customerHandoverSchema,
  handoverFileSchema,
  handoverSchema,
  profitabilitySchema,
  type CostInput,
  type Decision,
  type HandoverFileInput,
  type HandoverInput,
  type IntermediateType,
} from './contracts';

function id(value: number) {
  if (!idSchema.safeParse(value).success) throw new ApiError(400, 'Invalid ID.');
  return String(value);
}
/** A driver uses the driver routes for their own leg; staff use the coordinator routes. */
const legBase = (asDriver: boolean, legId: number) =>
  `/api/${asDriver ? 'driver' : 'coordinator'}/legs/${id(legId)}`;
const customerBase = (orderId: number) => `/api/customer/transport-orders/${id(orderId)}/handovers`;

export const handoverApi = {
  forLeg: (asDriver: boolean, legId: number, signal?: AbortSignal) =>
    request(`${legBase(asDriver, legId)}/handovers`, z.array(handoverSchema), { signal }),
  intermediate: (
    asDriver: boolean,
    legId: number,
    body: HandoverInput & { handoverType: IntermediateType },
  ) =>
    request(`${legBase(asDriver, legId)}/intermediate-handover`, handoverSchema, {
      method: 'POST',
      body,
    }),
  finalDelivery: (asDriver: boolean, legId: number, body: HandoverInput) =>
    request(`${legBase(asDriver, legId)}/final-delivery`, completionSchema, {
      method: 'POST',
      body,
    }),
  customerList: (orderId: number, signal?: AbortSignal) =>
    request(customerBase(orderId), z.array(customerHandoverSchema), { signal }),
  decide: (orderId: number, handoverId: number, decision: Decision, feedback: string | null) =>
    request(`${customerBase(orderId)}/${id(handoverId)}/decision`, customerHandoverSchema, {
      method: 'PUT',
      body: { decision, feedback },
    }),
  costs: (planId: number, signal?: AbortSignal) =>
    request(`/api/coordinator/plans/${id(planId)}/actual-costs`, z.array(costSchema), { signal }),
  addCost: (planId: number, body: CostInput) =>
    request(`/api/coordinator/plans/${id(planId)}/actual-costs`, costSchema, {
      method: 'POST',
      body,
    }),
  /** Flat payload, no version or operation ID; returns the stored file and its key. */
  uploadFile: (orderId: number, body: HandoverFileInput) =>
    request(`/api/transport-orders/${id(orderId)}/handover-files`, handoverFileSchema, {
      method: 'POST',
      body,
    }),
  file: (orderId: number, fileKey: string, signal?: AbortSignal) =>
    request(
      `/api/transport-orders/${id(orderId)}/handover-files/${encodeURIComponent(fileKey)}`,
      handoverFileSchema,
      { signal },
    ),
  /** Manager only: DELIVERED → CLOSED against the reviewed order version. */
  closeOrder: (orderId: number, command: { recordVersion: string; operationId: string }) =>
    request(`/api/transport-orders/${id(orderId)}/handovers/close-order`, closureSchema, {
      method: 'POST',
      body: command,
    }),
  profitability: (planId: number, signal?: AbortSignal) =>
    request(`/api/manager/plans/${id(planId)}/profitability`, profitabilitySchema, { signal }),
};
