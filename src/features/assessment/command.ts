import { useRef, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { useAction } from '../../shared/lib/useAction';

/**
 * One operationId per user action. An uncertain failure (network/5xx)
 * freezes the command so a retry resends the identical UUID, version and
 * input; any definite failure ends the action and the next submit is new.
 */
export function useCaseCommand<C extends { operationId: string }, R>(
  send: (command: C) => Promise<R>,
  // Extra codes the BE asks to retry with the same operation (e.g. a lock timeout).
  retryCodes: readonly string[] = [],
) {
  const pending = useRef<C | null>(null);
  const [frozen, setFrozen] = useState(false);
  const action = useAction();
  const conflict = action.error instanceof ApiError && action.error.status === 409;
  const fields = action.error instanceof ApiError ? action.error.fields : {};

  /** `build` runs only for a new action; it returns null when input is invalid. */
  function submit(
    build: () => Omit<C, 'operationId'> | null,
    onSuccess: (result: R) => Promise<void>,
  ) {
    if (!pending.current) {
      const input = build();
      if (!input) return;
      pending.current = { ...input, operationId: crypto.randomUUID() } as C;
    }
    const command = pending.current;
    setFrozen(true);
    void action.run(async () => {
      try {
        const result = await send(command);
        pending.current = null;
        setFrozen(false);
        await onSuccess(result);
      } catch (error) {
        const retrySame =
          error instanceof ApiError &&
          (error.uncertain || (error.code !== undefined && retryCodes.includes(error.code)));
        if (!retrySame) {
          pending.current = null;
          setFrozen(false);
        }
        throw error;
      }
    });
  }
  return {
    submit,
    // A definite rejection can be reviewed explicitly before starting a new action.
    // Uncertain commands must retain their original UUID/version/body.
    reset: () => {
      if (pending.current || action.pending) return;
      action.setError(null);
    },
    frozen,
    pending: action.pending,
    error: action.error,
    conflict,
    fields,
    locked: frozen || action.pending,
  };
}
