import { ApiError, request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import {
  overviewSchema,
  receiptSchema,
  type Command,
  type MilestoneInput,
  type TransitionInput,
  type WelfareInput,
} from './contracts';

export const EXECUTION_PAGE_SIZE = 20;
function id(v: number) {
  if (!idSchema.safeParse(v).success) throw new ApiError(400, 'Invalid ID.');
  return String(v);
}
const base = (orderId: number) => `/api/transport-orders/${id(orderId)}`;
const leg = (orderId: number, legId: number) => `${base(orderId)}/legs/${id(legId)}`;
/** Every execution write nests `command: {recordVersion, operationId}` (order version). */
function post<T>(path: string, { recordVersion, operationId, ...input }: Command<T>) {
  return request(path, receiptSchema, {
    method: 'POST',
    body: { command: { recordVersion, operationId }, ...input },
  });
}

export const executionApi = {
  get: (orderId: number, page: number, signal?: AbortSignal) => {
    if (!Number.isSafeInteger(page) || page < 0) throw new ApiError(400, 'Invalid page.');
    return request(
      `${base(orderId)}/execution?${new URLSearchParams({ page: String(page), size: String(EXECUTION_PAGE_SIZE) })}`,
      overviewSchema,
      { signal },
    );
  },
  start: (orderId: number, legId: number, body: Command<TransitionInput>) =>
    post(`${leg(orderId, legId)}/start`, body),
  complete: (orderId: number, legId: number, body: Command<TransitionInput>) =>
    post(`${leg(orderId, legId)}/complete`, body),
  milestone: (orderId: number, legId: number, body: Command<MilestoneInput>) =>
    post(`${leg(orderId, legId)}/milestones`, body),
  welfare: (orderId: number, legId: number, body: Command<WelfareInput>) =>
    post(`${leg(orderId, legId)}/welfare-logs`, body),
};
