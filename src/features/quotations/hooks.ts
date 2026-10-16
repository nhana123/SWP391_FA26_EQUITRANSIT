import { useQuery } from '@tanstack/react-query';
import { idSchema, type Role } from '../../shared/api/contracts';
import { ApiError } from '../../shared/api/client';
import { useSession } from '../../shared/api/session';
import { quotationsApi, validQuotePage } from './api';

export const canReadQuotations = (role: Role | undefined) =>
  role === 'CUSTOMER' || role === 'MANAGER' || role === 'COORDINATOR';
export const quotationKeys = {
  all: (generation: string) => ['session', generation, 'quotations'] as const,
  order: (generation: string, role: Role, orderId: number) =>
    [...quotationKeys.all(generation), role, orderId] as const,
  list: (generation: string, role: Role, orderId: number, page: number, size: number) =>
    [...quotationKeys.order(generation, role, orderId), 'list', { page, size }] as const,
  detail: (generation: string, role: Role, orderId: number, quoteId: number) =>
    [...quotationKeys.order(generation, role, orderId), 'detail', quoteId] as const,
};
// Deployment/authorization errors need an explicit review, not background retry loops.
const retry = (count: number, error: Error) =>
  count < 1 &&
  error instanceof ApiError &&
  error.code !== 'QUOTE_SCHEMA_PENDING' &&
  (error.status === 0 || error.status >= 500);

export function useQuotations(orderId: number, page: number, size: number) {
  const session = useSession();
  return useQuery({
    queryKey: quotationKeys.list(
      session?.generation || 'signed-out',
      session?.role || 'DRIVER',
      orderId,
      page,
      size,
    ),
    queryFn: ({ signal }) => quotationsApi.list(orderId, page, size, signal),
    enabled:
      canReadQuotations(session?.role) &&
      idSchema.safeParse(orderId).success &&
      validQuotePage(page, size),
    retry,
  });
}
export function useQuotation(orderId: number, quoteId: number) {
  const session = useSession();
  return useQuery({
    queryKey: quotationKeys.detail(
      session?.generation || 'signed-out',
      session?.role || 'DRIVER',
      orderId,
      quoteId,
    ),
    queryFn: ({ signal }) => quotationsApi.get(orderId, quoteId, signal),
    enabled:
      canReadQuotations(session?.role) &&
      idSchema.safeParse(orderId).success &&
      idSchema.safeParse(quoteId).success,
    retry,
  });
}
