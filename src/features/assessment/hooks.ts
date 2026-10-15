import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { assessmentApi } from './api';
import { caseRoleSchema, reviewStateSchema, type CaseRole, type ReviewState } from './contracts';

// FE2 keys stay beneath the session namespace so logout clears every case.
export const assessmentKeys = {
  all: (generation: string) => [...queryKeys.session(generation), 'manager-cases'] as const,
  queue: (generation: string, state: ReviewState, page: number) =>
    [...assessmentKeys.all(generation), 'queue', { state, page }] as const,
  staffAll: (generation: string) => [...assessmentKeys.all(generation), 'staff'] as const,
  staff: (generation: string, role: CaseRole, page: number) =>
    [...assessmentKeys.all(generation), 'staff', { role, page }] as const,
  case: (generation: string, id: number) =>
    [...assessmentKeys.all(generation), 'case', id] as const,
  decisions: (generation: string, id: number, page: number) =>
    [...assessmentKeys.case(generation, id), 'decisions', { page }] as const,
};

export function useManagerCase(id: number) {
  const session = useSession()!;
  return useQuery({
    queryKey: assessmentKeys.case(session.generation, id),
    queryFn: ({ signal }) => assessmentApi.getCase(id, signal),
    enabled: Number.isSafeInteger(id) && id > 0,
  });
}

export function useDecisionHistory(id: number, page: number) {
  const session = useSession()!;
  return useQuery({
    queryKey: assessmentKeys.decisions(session.generation, id, page),
    queryFn: ({ signal }) => assessmentApi.decisions(id, page, signal),
    placeholderData: keepPreviousData,
  });
}

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

/**
 * Active staff for one preparation role. Workload is shown, availability is
 * not: BE has no calendar yet. Refetches on focus because counts change.
 */
export function useStaffDirectory(role: CaseRole, page: number) {
  const session = useSession()!;
  return useQuery({
    queryKey: assessmentKeys.staff(session.generation, role, page),
    queryFn: ({ signal }) => assessmentApi.staff(role, page, signal),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[4].role === role ? keepPreviousData(previous) : undefined,
  });
}

/** Directory role/page live in the URL like the queue filter. */
export function useStaffDirectoryParams() {
  const [params, setParams] = useSearchParams();
  const parsed = caseRoleSchema.safeParse(params.get('role'));
  const role: CaseRole = parsed.success ? parsed.data : 'SPECIALIST';
  const page = parsePage(params.get('page'));
  return {
    role,
    page,
    setRole: (next: CaseRole) => setParams({ role: next, page: '0' }),
    setPage: (next: number) => setParams({ role, page: String(next) }),
  };
}
