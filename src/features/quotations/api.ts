import { ApiError, request } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import { quotePageSchema, quoteResponseSchema } from './contracts';

export const QUOTE_PAGE_SIZE = 20;
export function validQuotePage(page: number, size: number) {
  return (
    Number.isSafeInteger(page) &&
    page >= 0 &&
    page <= 2_147_483_647 &&
    Number.isInteger(size) &&
    size >= 1 &&
    size <= 100
  );
}
function orderPath(orderId: number) {
  if (!idSchema.safeParse(orderId).success) throw new ApiError(400, 'Invalid request ID.');
  return `/api/transport-orders/${orderId}/quotes`;
}
// Dev2 can add mutations here using the shared contracts; reads never mutate.
export const quotationsApi = {
  list: (orderId: number, page = 0, size = QUOTE_PAGE_SIZE, signal?: AbortSignal) => {
    if (!validQuotePage(page, size)) throw new ApiError(400, 'Invalid quotation page.');
    return request(
      `${orderPath(orderId)}?${new URLSearchParams({ page: String(page), size: String(size) })}`,
      quotePageSchema,
      { signal },
    );
  },
  get: (orderId: number, quoteId: number, signal?: AbortSignal) => {
    if (!idSchema.safeParse(quoteId).success) throw new ApiError(400, 'Invalid quotation ID.');
    return request(`${orderPath(orderId)}/${quoteId}`, quoteResponseSchema, { signal });
  },
};
