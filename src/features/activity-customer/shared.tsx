import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { roleSchema, type Role } from '../../shared/api/contracts';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { Loading, Notice } from '../../shared/ui/common';
import './activity.css';

export const activityKeys = {
  all: (generation: string, role: string) =>
    [...queryKeys.session(generation), 'activity', role] as const,
  notifications: (generation: string, role: string) =>
    [...activityKeys.all(generation, role), 'notifications'] as const,
};
export function useActivityQuery<T>(
  key: readonly (string | number)[],
  load: (signal: AbortSignal) => Promise<T>,
  roles: readonly Role[] = roleSchema.options,
  valid = true,
) {
  const session = useSession();
  const allowed = !!session && roles.includes(session.role);
  const query = useQuery({
    queryKey: [...activityKeys.all(session?.generation ?? '', session?.role ?? ''), ...key],
    queryFn: ({ signal }) => load(signal),
    enabled: allowed && valid,
    retry: false,
  });
  return { ...query, session, allowed };
}
export function useActivityPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('page') ?? '0';
  const page = Number(raw);
  const valid = /^\d+$/.test(raw) && Number.isSafeInteger(page) && page <= 2147483647;
  return { page, valid, setPage: (next: number) => setParams({ page: String(next) }) };
}
export const deniedActivity = (error: unknown) =>
  error instanceof ApiError && [401, 403, 404].includes(error.status);
export const uncertainActivity = (error: unknown) => error instanceof ApiError && error.uncertain;
export function workspacePath(role?: Role) {
  return role === 'CUSTOMER'
    ? '/customer/dashboard'
    : role === 'MANAGER'
      ? '/manager/requests'
      : '/staff';
}
export function orderPath(role: Role, id: number) {
  if (role === 'CUSTOMER') return `/customer/requests/${id}`;
  if (role === 'MANAGER') return `/manager/requests/${id}`;
  if (role === 'SPECIALIST' || role === 'COORDINATOR') return `/staff/cases/${id}`;
  return null; // No Driver detail route has been released by FE2.
}
export function ActivityHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
      </div>
      {children}
    </header>
  );
}
export function ActivityError({ error, retry }: { error: unknown; retry?: () => void }) {
  const session = useSession();
  if (!error) return null;
  const api = error instanceof ApiError ? error : null;
  const messages: Record<number, string> = {
    400: 'Check the supplied activity fields or pagination.',
    401: 'Your session has expired. Please sign in again.',
    403: 'You do not have access to this activity.',
    404: 'This activity is no longer available to your account.',
    409: 'Activity changed. Reload and review before trying again.',
    422: 'This action is blocked. Reload and review its current state.',
    503: 'Deployment blocked: the activity service is not ready. Please try again later.',
  };
  return (
    <div role="alert" className="notice error">
      <p>
        {api?.code === 'ACTIVITY_SCHEMA_PENDING'
          ? messages[503]
          : messages[api?.status ?? 0] ||
            'Activity could not be loaded or saved. Please try again.'}
      </p>
      {deniedActivity(error) ? (
        <Link to={workspacePath(session?.role)}>Back to workspace</Link>
      ) : (
        retry && (
          <button type="button" onClick={retry}>
            Retry loading activity
          </button>
        )
      )}
    </div>
  );
}
export function ActivityReadState({
  pending,
  error,
  retry,
}: {
  pending: boolean;
  error: unknown;
  retry: () => void;
}) {
  if (error) return <ActivityError error={error} retry={retry} />;
  return pending ? <Loading /> : null;
}
export function InvalidActivityPage({ reset }: { reset: () => void }) {
  return (
    <Notice>
      Invalid activity page.{' '}
      <button type="button" onClick={reset}>
        Reset pagination
      </button>
    </Notice>
  );
}
export function ActivityPager({
  page,
  size,
  totalElements,
  onPage,
  locked = false,
}: {
  page: number;
  size: number;
  totalElements: number;
  onPage: (page: number) => void;
  locked?: boolean;
}) {
  return (
    <nav className="pagination" aria-label="Activity pages">
      <button type="button" disabled={locked || page === 0} onClick={() => onPage(page - 1)}>
        Previous activity page
      </button>
      <span>
        Page {page + 1} · {totalElements} records
      </span>
      <button
        type="button"
        disabled={locked || page >= 2147483647 || (page + 1) * size >= totalElements}
        onClick={() => onPage(page + 1)}
      >
        Next activity page
      </button>
    </nav>
  );
}
