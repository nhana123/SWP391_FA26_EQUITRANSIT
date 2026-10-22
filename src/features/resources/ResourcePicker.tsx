import { useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ApiError } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { ErrorNotice, Loading, Notice } from '../../shared/ui/common';
import { resourcesApi } from './api';
import {
  blockerLabels,
  type AvailabilityRequest,
  type ProbeKind,
  type ResourceCandidate,
} from './contracts';
import './resources.css';

const nouns: Record<ProbeKind, { one: string; many: string }> = {
  VEHICLE: { one: 'vehicle', many: 'vehicles' },
  STALL: { one: 'stall', many: 'stalls' },
};
const statusText: Record<ResourceCandidate['status'], string> = {
  AVAILABLE: 'Available',
  PENDING: 'Pending',
  UNAVAILABLE: 'Unavailable',
};
const rank: Record<ResourceCandidate['status'], number> = {
  AVAILABLE: 0,
  PENDING: 1,
  UNAVAILABLE: 2,
};
const SEARCH_DELAY_MS = 300;

/** The BE has no candidates endpoint (older deployment): fall back to a typed ID. */
export const candidatesUnsupported = (error: unknown) =>
  error instanceof ApiError && error.status === 404 && !error.code;

/**
 * Searchable list of vehicles/stalls evaluated for one case window. For an
 * assignment only an AVAILABLE item can be chosen; it hands back its own id
 * and recordVersion. The read-only check page may inspect any item.
 * Results are advice: they reserve nothing, and assignment rechecks them.
 * The parent clears the selection whenever the window, kind or leg changes.
 */
export function ResourcePicker({
  kind,
  request,
  selected,
  onSelect,
  error,
  fallback,
  waitingHint,
  anyStatus = false,
}: {
  kind: ProbeKind;
  /** null until the case window is complete. */
  request: AvailabilityRequest | null;
  selected: ResourceCandidate | null;
  onSelect: (candidate: ResourceCandidate | null) => void;
  error?: string;
  /** Rendered when this server does not offer the candidates search. */
  fallback: ReactNode;
  waitingHint?: string;
  /** Allow choosing PENDING/UNAVAILABLE items (inspection only, never assignment). */
  anyStatus?: boolean;
}) {
  const session = useSession();
  const noun = nouns[kind];
  const [draft, setDraft] = useState('');
  const [term, setTerm] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const query = useInfiniteQuery({
    queryKey: [
      ...queryKeys.session(session?.generation ?? ''),
      'resource-candidates',
      kind,
      request,
      term,
    ],
    queryFn: ({ pageParam, signal }) =>
      resourcesApi.candidates(kind, request!, { search: term, page: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      pages.reduce((n, p) => n + p.items.length, 0) < last.totalElements && last.items.length
        ? last.page + 1
        : undefined,
    enabled: !!session && !!request,
    retry: false,
  });
  if (!request)
    return (
      <div className="resource-picker">
        <Notice>{waitingHint ?? `Complete the window to find ${noun.many}.`}</Notice>
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  if (candidatesUnsupported(query.error))
    return (
      <>
        <Notice>
          Searching {noun.many} is not available on this server yet. Enter the {noun.one} ID
          instead.
        </Notice>
        {fallback}
      </>
    );
  const items = (query.data?.pages.flatMap((p) => p.items) ?? [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank[a.item.status] - rank[b.item.status] || a.index - b.index)
    .map(({ item }) => item);
  const total = query.data?.pages.at(-1)?.totalElements ?? 0;
  const searchId = `resource-search-${kind}`;
  return (
    <div className="resource-picker" role="group" aria-label={`Choose a ${noun.one}`}>
      <label htmlFor={searchId}>Find a {noun.one} by code</label>
      <div className="resource-picker-search">
        <input
          id={searchId}
          type="search"
          maxLength={50}
          value={draft}
          placeholder={`Code prefix, e.g. ${kind === 'STALL' ? 'STALL-1' : 'TRUCK-1'}`}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setTerm(next.trim()), SEARCH_DELAY_MS);
          }}
        />
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            void query.refetch();
          }}
          disabled={query.isFetching}
        >
          Refresh list
        </button>
      </div>
      {selected ? (
        <p role="status" className="resource-picker-selected">
          Selected: <strong>{selected.code}</strong> <StatusBadge status={selected.status} /> — the
          assignment rechecks it when saved.
        </p>
      ) : (
        error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error}>
          <button type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </ErrorNotice>
      ) : !items.length ? (
        <p>
          No {noun.many} match{term ? ` “${term}”` : ''}.
        </p>
      ) : (
        <>
          <ul className="resource-picker-list" aria-label={`Matching ${noun.many}`}>
            {items.map((c) => {
              const chosen = selected?.id === c.id;
              const usable = anyStatus || c.status === 'AVAILABLE';
              return (
                <li key={c.id} className={chosen ? 'chosen' : undefined}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    disabled={!usable}
                    onClick={() => onSelect(chosen ? null : c)}
                  >
                    <strong>{c.code}</strong>
                    <StatusBadge status={c.status}>{statusText[c.status]}</StatusBadge>
                  </button>
                  {c.blockers.length > 0 && (
                    <ul className="resource-picker-reasons">
                      {c.blockers.map((b) => (
                        <li key={b}>{blockerLabels[b]}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="muted">
            Showing {items.length} of {total} {noun.many} matching the search. This counts codes,
            not free {noun.many}, and choosing one reserves nothing.
          </p>
          {query.hasNextPage && (
            <button
              type="button"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? 'Loading…' : `Load more ${noun.many}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
