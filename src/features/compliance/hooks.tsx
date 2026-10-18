import { useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { quotationKeys } from '../quotations/hooks';
import { complianceApi } from './api';
import { errorHelp, type Command, type Phase, type Receipt } from './contracts';

export const complianceKeys = {
  all: (generation: string, orderId: number) =>
    [...queryKeys.session(generation), 'compliance', orderId] as const,
  overview: (generation: string, orderId: number, phase: Phase, page: number) =>
    [...complianceKeys.all(generation, orderId), 'overview', phase, { page }] as const,
  documents: (generation: string, orderId: number, page: number) =>
    [...complianceKeys.all(generation, orderId), 'documents', { page }] as const,
  rules: (generation: string, orderId: number, phase: Phase) =>
    [...complianceKeys.all(generation, orderId), 'rules', phase] as const,
  procedures: (generation: string, orderId: number, phase: Phase) =>
    [...complianceKeys.all(generation, orderId), 'procedures', phase] as const,
  assessment: (generation: string, orderId: number) =>
    [...complianceKeys.all(generation, orderId), 'assessment'] as const,
  file: (generation: string, orderId: number, key: string) =>
    [...complianceKeys.all(generation, orderId), 'file', key] as const,
};

// Deployment/authorization errors need an explicit review, not retry loops.
const retry = (n: number, error: Error) =>
  n < 1 &&
  error instanceof ApiError &&
  (error.status === 0 || error.status >= 500) &&
  error.status !== 503;

export function useOverview(orderId: number, phase: Phase, page: number) {
  const { generation } = useSession()!;
  return useQuery({
    queryKey: complianceKeys.overview(generation, orderId, phase, page),
    queryFn: ({ signal }) => complianceApi.overview(orderId, phase, page, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
    retry,
  });
}
export function useDocuments(orderId: number, page: number) {
  const { generation } = useSession()!;
  return useQuery({
    queryKey: complianceKeys.documents(generation, orderId, page),
    queryFn: ({ signal }) => complianceApi.documents(orderId, page, signal),
    placeholderData: keepPreviousData,
    retry,
  });
}

/**
 * The order rowversion every legal write must carry. It is pinned to what the
 * user reviewed: a background refetch never upgrades it. Only an explicit
 * reload, or the receipt of the user's own write, moves it forward.
 */
export function usePinnedVersion(orderId: number, current: string | undefined) {
  const { generation } = useSession()!;
  const [pinned, setPinned] = useState<string | null>(null);
  if (current && pinned === null) setPinned(current);
  const changed = !!current && !!pinned && current.toLowerCase() !== pinned.toLowerCase();
  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: complianceKeys.all(generation, orderId) }),
      // F05/F06 consume assessments: services and quotations must re-read them.
      queryClient.invalidateQueries({ queryKey: queryKeys.services(generation, orderId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.order(generation, orderId) }),
      queryClient.invalidateQueries({ queryKey: quotationKeys.all(generation) }),
    ]);
  }
  return {
    version: pinned,
    changed,
    /** After the user's own write: adopt its receipt version and re-read. */
    async written(receipt: Receipt) {
      setPinned(receipt.recordVersion);
      await refreshAll();
    },
    /** Explicit "reload and review": adopt the latest version. */
    adopt(next: string) {
      setPinned(next);
    },
    refreshAll,
  };
}
export type Pinned = ReturnType<typeof usePinnedVersion>;

/**
 * A legal write form: one operation per action, identical retry after an
 * uncertain failure, server field errors next to inputs, and a hard stop when
 * the reviewed case version is no longer current.
 */
export function CommandForm<T>({
  label,
  title,
  pinned,
  send,
  build,
  onDone,
  submitLabel,
  children,
  fieldErrors,
  busy = false,
}: {
  label: string;
  title: string;
  pinned: Pinned;
  send: (body: Command<T>) => Promise<Receipt>;
  /** Validates and returns the input, or null with errors set. */
  build: () => T | null;
  onDone?: (receipt: Receipt) => void;
  submitLabel: string;
  children: (locked: boolean, serverFields: FieldErrors) => ReactNode;
  fieldErrors?: FieldErrors;
  /** Local work still running (e.g. reading a selected file): submit waits. */
  busy?: boolean;
}) {
  const command = useCaseCommand(send);
  const code = command.error instanceof ApiError ? command.error.code : undefined;
  const stale = pinned.changed || !pinned.version;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (command.pending || busy || (stale && !command.frozen)) return;
    command.submit(
      () => {
        const input = build();
        return input
          ? ({ ...input, recordVersion: pinned.version! } as Omit<Command<T>, 'operationId'>)
          : null;
      },
      async (receipt) => {
        onDone?.(receipt);
        await pinned.written(receipt);
      },
    );
  }
  return (
    <form className="card" onSubmit={submit} noValidate aria-label={label}>
      <h3>{title}</h3>
      <ErrorNotice error={command.error}>
        {code && errorHelp[code] && <p>{errorHelp[code]}</p>}
        {command.frozen && !command.pending && (
          <p>
            The result is uncertain. Retry sends the same action, identifier and version, so it
            cannot be recorded twice.
          </p>
        )}
        {command.conflict && (
          <>
            <p>Reload the case and review it before a new action.</p>
            <button type="button" onClick={() => void pinned.refreshAll()}>
              Reload case
            </button>
          </>
        )}
      </ErrorNotice>
      {children(command.locked, { ...command.fields, ...fieldErrors })}
      <div className="actions">
        <button
          className="primary"
          type="submit"
          disabled={command.pending || busy || (stale && !command.frozen)}
        >
          {busy
            ? 'Reading file…'
            : command.pending
              ? 'Sending…'
              : command.frozen
                ? 'Retry the same action'
                : submitLabel}
        </button>
      </div>
    </form>
  );
}
