import { z } from 'zod';
import { ApiError, request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import {
  candidateSchema,
  planDetailSchema,
  planPageSchema,
  type Command,
  type ConfirmInput,
  type DraftInput,
  type FlightInput,
  type InsuranceInput,
  type QuarantineInput,
  type RoadInput,
  type StallInput,
} from './contracts';

export const PLAN_PAGE_SIZE = 20;

function id(value: number) {
  if (!idSchema.safeParse(value).success) throw new ApiError(400, 'Invalid ID.');
  return String(value);
}
const base = (orderId: number) => `/api/transport-orders/${id(orderId)}/plans`;
const plan = (orderId: number, planId: number) => `${base(orderId)}/${id(planId)}`;
/** Every plan write nests `command: {operationId, recordVersion}` (order version). */
function post<T>(path: string, { recordVersion, operationId, ...input }: Command<T>) {
  return request(path, planDetailSchema, {
    method: 'POST',
    body: { command: { operationId, recordVersion }, ...input },
  });
}

export const plansApi = {
  list: (orderId: number, page: number, signal?: AbortSignal) =>
    request(
      `${base(orderId)}?${new URLSearchParams({ page: String(page), size: String(PLAN_PAGE_SIZE) })}`,
      planPageSchema,
      { signal },
    ),
  get: (orderId: number, planId: number, signal?: AbortSignal) =>
    request(plan(orderId, planId), planDetailSchema, { signal }),
  /** Advisory shortlist only; there is no auto-match or auto-book endpoint. */
  candidates: (orderId: number, signal?: AbortSignal) =>
    request(`${base(orderId)}/shared-stall-candidates`, z.array(candidateSchema), { signal }),
  draft: (orderId: number, body: Command<DraftInput>) => post(base(orderId), body),
  road: (orderId: number, planId: number, legId: number, body: Command<RoadInput>) =>
    post(`${plan(orderId, planId)}/legs/${id(legId)}/road-assignment`, body),
  stall: (orderId: number, planId: number, legId: number, body: Command<StallInput>) =>
    post(`${plan(orderId, planId)}/legs/${id(legId)}/stall-assignment`, body),
  flight: (orderId: number, planId: number, legId: number, body: Command<FlightInput>) =>
    post(`${plan(orderId, planId)}/legs/${id(legId)}/flight-reservation`, body),
  quarantine: (orderId: number, planId: number, body: Command<QuarantineInput>) =>
    post(`${plan(orderId, planId)}/quarantine-reservation`, body),
  insurance: (orderId: number, planId: number, body: Command<InsuranceInput>) =>
    post(`${plan(orderId, planId)}/insurance-policy`, body),
  confirm: (orderId: number, planId: number, body: Command<ConfirmInput>) =>
    post(`${plan(orderId, planId)}/confirm`, body),
};
