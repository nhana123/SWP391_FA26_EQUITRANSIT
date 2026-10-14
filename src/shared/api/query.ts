import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';
import { configureSessionCleanup } from './session';
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      retry: (count, error) =>
        count < 1 && error instanceof ApiError && (error.status === 0 || error.status >= 500),
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
configureSessionCleanup(() => {
  void queryClient.cancelQueries();
  queryClient.clear();
});
export const queryKeys = {
  session: (generation: string) => ['session', generation] as const,
  horses: (generation: string) => ['session', generation, 'horses'] as const,
  horse: (generation: string, id: number) =>
    ['session', generation, 'horses', 'detail', id] as const,
  orders: (generation: string) => ['session', generation, 'orders'] as const,
  order: (generation: string, id: number) =>
    ['session', generation, 'orders', 'detail', id] as const,
  services: (generation: string, id?: number) =>
    ['session', generation, 'services', ...(id ? [id] : [])] as const,
};
