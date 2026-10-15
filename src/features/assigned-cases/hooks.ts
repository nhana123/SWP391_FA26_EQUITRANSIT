import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { assignedCasesApi } from './api';

export const assignedKeys = {
  all: (generation: string) => [...queryKeys.session(generation), 'assigned-cases'] as const,
  list: (generation: string, page: number) =>
    [...assignedKeys.all(generation), 'list', { page }] as const,
  detail: (generation: string, id: number) =>
    [...assignedKeys.all(generation), 'detail', id] as const,
};

// Assignments can be ended or reassigned at any time, so these reads are
// always stale: refocusing the tab re-asks the BE instead of trusting cache.
export function useAssignedCases(page: number) {
  const session = useSession()!;
  return useQuery({
    queryKey: assignedKeys.list(session.generation, page),
    queryFn: ({ signal }) => assignedCasesApi.list(page, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
}

export function useAssignedCase(id: number) {
  const session = useSession()!;
  return useQuery({
    queryKey: assignedKeys.detail(session.generation, id),
    queryFn: async ({ signal }) => {
      try {
        return await assignedCasesApi.get(id, signal);
      } catch (error) {
        // 404 = ended/reassigned/missing. The page shows the error before any
        // cached data, and the list is refreshed so the row disappears.
        if (error instanceof ApiError && error.status === 404) {
          void queryClient.invalidateQueries({
            queryKey: [...assignedKeys.all(session.generation), 'list'],
          });
        }
        throw error;
      }
    },
    enabled: Number.isSafeInteger(id) && id > 0,
    staleTime: 0,
  });
}
