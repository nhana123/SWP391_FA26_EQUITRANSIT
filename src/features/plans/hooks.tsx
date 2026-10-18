import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../../shared/api/client';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { refreshPreparationCase } from '../quotations/source';
import { errorHelp, type Command, type PlanDetail } from './contracts';

export const planKeys = {
  all: (generation: string, orderId: number) =>
    [...queryKeys.session(generation), 'plans', orderId] as const,
  list: (generation: string, orderId: number, page: number) =>
    [...planKeys.all(generation, orderId), 'list', { page }] as const,
  detail: (generation: string, orderId: number, planId: number) =>
    [...planKeys.all(generation, orderId), 'detail', planId] as const,
  candidates: (generation: string, orderId: number) =>
    [...planKeys.all(generation, orderId), 'candidates'] as const,
};

/**
 * The parent TransportOrder rowversion plan writes carry, pinned to what the
 * user reviewed. A background refetch never upgrades it; only an explicit
 * reload or the user's own write receipt moves it forward.
 */
export function usePinnedVersion(orderId: number, current: string | undefined) {
  const { generation } = useSession()!;
  const [pinned, setPinned] = useState<string | null>(null);
  if (current && pinned === null) setPinned(current);
  const changed = !!current && !!pinned && current.toLowerCase() !== pinned.toLowerCase();
  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: planKeys.all(generation, orderId) }),
      refreshPreparationCase(generation, orderId),
      // Leg distances feed F05/F06 itineraries.
      queryClient.invalidateQueries({ queryKey: queryKeys.services(generation, orderId) }),
    ]);
  }
  return {
    version: pinned,
    changed,
    async written(detail: PlanDetail) {
      setPinned(detail.recordVersion);
      // The receipt may be a replay: keep it as the plan view, then re-read.
      queryClient.setQueryData(planKeys.detail(generation, orderId, detail.planId), detail);
      await refreshAll();
    },
    adopt: (next: string) => setPinned(next),
    refreshAll,
  };
}
export type Pinned = ReturnType<typeof usePinnedVersion>;

/** One operation per action; identical retry after an uncertain failure. */
export function CommandForm<T>({
  label,
  title,
  pinned,
  send,
  build,
  onDone,
  submitLabel,
  fieldErrors,
  children,
}: {
  label: string;
  title: string;
  pinned: Pinned;
  send: (body: Command<T>) => Promise<PlanDetail>;
  build: () => T | null;
  onDone?: (detail: PlanDetail) => void;
  submitLabel: string;
  fieldErrors?: FieldErrors;
  children: (locked: boolean, fields: FieldErrors) => ReactNode;
}) {
  const command = useCaseCommand(send, ['RESOURCE_BUSY']);
  const code = command.error instanceof ApiError ? command.error.code : undefined;
  const stale = pinned.changed || !pinned.version;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (command.pending || (stale && !command.frozen)) return;
    command.submit(
      () => {
        const input = build();
        return input
          ? ({ ...input, recordVersion: pinned.version! } as Omit<Command<T>, 'operationId'>)
          : null;
      },
      async (detail) => {
        onDone?.(detail);
        await pinned.written(detail);
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
        {command.conflict && !command.frozen && (
          <button type="button" onClick={() => void pinned.refreshAll()}>
            Reload the plan
          </button>
        )}
      </ErrorNotice>
      {children(command.locked, { ...command.fields, ...fieldErrors })}
      <div className="actions">
        <button
          className="primary"
          type="submit"
          disabled={command.pending || (stale && !command.frozen)}
        >
          {command.pending ? 'Sending…' : command.frozen ? 'Retry the same action' : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function StaleBanner({ pinned, latest }: { pinned: Pinned; latest: string | undefined }) {
  if (!pinned.changed || !latest) return null;
  return (
    <div className="notice error" role="alert">
      <p>This case changed since you opened it. Reload and review before changing the plan.</p>
      <button type="button" onClick={() => pinned.adopt(latest)}>
        Reload and review
      </button>
    </div>
  );
}
