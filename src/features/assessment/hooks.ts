import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { assessmentApi } from './api';
import { reviewStateSchema, type ReviewState } from './contracts';

// FE2 keys stay beneath the session namespace so logout clears every case.
export const assessmentKeys = {
  all: (generation: string) => [...queryKeys.session(generation), 'manager-cases'] as const,
  queue: (generation: string, state: ReviewState, page: number) =>
    [...assessmentKeys.all(generation), 'queue', { state, page }] as const,
};

function parsePage(value: string | null) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 0 ? page : 0;
}

/** Queue filter lives in the URL so back/refresh keep the Manager's place. */
export function useManagerQueue() {
  const [params, setParams] = useSearchParams();
  const parsed = reviewStateSchema.safeParse(params.get('state'));
  const state: ReviewState = parsed.success ? parsed.data : 'SUBMITTED';
  const page = parsePage(params.get('page'));
  const session = useSession()!;
  const query = useQuery({
    queryKey: assessmentKeys.queue(session.generation, state, page),
    // TanStack aborts the superseded request when state/page changes.
    queryFn: ({ signal }) => assessmentApi.queue(state, page, signal),
    // Keep rows while paging, but never show one state's rows under another.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[4].state === state ? keepPreviousData(previous) : undefined,
  });
  return {
    state,
    page,
    query,
    setState: (next: ReviewState) => setParams({ state: next, page: '0' }),
    setPage: (next: number) => setParams({ state, page: String(next) }),
  };
}
