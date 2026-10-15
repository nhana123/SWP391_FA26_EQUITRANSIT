import { z } from 'zod';
import { request } from '../../shared/api/client';
import { idSchema, type OrderDraft } from '../../shared/api/contracts';
import { revisionSchema } from '../assessment/contracts';

export const REVISION_PAGE_SIZE = 20;

export const changeStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED'] as const;
export const changeSchema = z.object({
  changeRequestId: idSchema,
  orderId: idSchema,
  baseRevisionId: idSchema.nullable(),
  status: z.enum(changeStatuses),
  createdAt: z.string(),
});
export type ChangeReceipt = z.infer<typeof changeSchema>;

/** BE OrderRevisionRequest: the full editable request plus version, UUID and reason. */
export type RevisionCommand = OrderDraft & {
  recordVersion: string;
  operationId: string;
  changeReason: string;
};

const base = (id: number) => `/api/transport-orders/${id}`;

export const revisionsApi = {
  // Bounded array, newest first; the BE sends no page count.
  list: (id: number, page: number, signal?: AbortSignal) =>
    request(
      `${base(id)}/revisions?${new URLSearchParams({
        page: String(page),
        size: String(REVISION_PAGE_SIZE),
      })}`,
      z.array(revisionSchema),
      { signal },
    ),
  get: (id: number, revisionId: number, signal?: AbortSignal) =>
    request(`${base(id)}/revisions/${revisionId}`, revisionSchema, { signal }),
  revise: (id: number, body: RevisionCommand) =>
    request(`${base(id)}/revisions`, revisionSchema, { method: 'POST', body }),
  requestChange: (id: number, body: RevisionCommand) =>
    request(`${base(id)}/change-requests`, changeSchema, { method: 'POST', body }),
  change: (id: number, changeId: number, signal?: AbortSignal) =>
    request(`${base(id)}/change-requests/${changeId}`, changeSchema, { signal }),
};
