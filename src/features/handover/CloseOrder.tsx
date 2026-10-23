import { useState } from 'react';
import { queryClient, queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { ErrorNotice, Notice } from '../../shared/ui/common';
import { useCaseCommand } from '../assessment/command';
import { handoverApi } from './api';
import type { Closure } from './contracts';

/**
 * The Manager's last step: DELIVERED → CLOSED against the reviewed order
 * version. An uncertain failure retries with the same operation ID, so the
 * server replays the closure instead of recording it twice.
 */
export function CloseOrderCard({
  orderId,
  orderStatus,
  recordVersion,
  onClosed,
}: {
  orderId: number;
  orderStatus: string;
  recordVersion: string;
  onClosed?: (closure: Closure) => void;
}) {
  const session = useSession();
  const [confirming, setConfirming] = useState(false);
  const [closed, setClosed] = useState<Closure | null>(null);
  const command = useCaseCommand((body: { recordVersion: string; operationId: string }) =>
    handoverApi.closeOrder(orderId, body),
  );
  if (session?.role !== 'MANAGER') return null;
  if (closed)
    return (
      <Notice>
        Request closed. Status {closed.orderStatus}; version {closed.recordVersion}.
      </Notice>
    );
  if (orderStatus !== 'DELIVERED') return null;
  return (
    <section className="card close-order" aria-labelledby="close-order-heading">
      <small className="eyebrow">FINAL STEP · MANAGER</small>
      <h2 id="close-order-heading">Settle and close the request</h2>
      <p>
        The horse has been delivered. Close the request once payments and actual costs are reviewed;
        a closed request takes no further operational changes.
      </p>
      <ErrorNotice error={command.error} />
      {!confirming ? (
        <button
          type="button"
          className="primary"
          disabled={command.locked}
          onClick={() => setConfirming(true)}
        >
          🔒 Settle & close the request (Close order)
        </button>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={command.pending}
            onClick={() =>
              command.submit(
                () => ({ recordVersion }),
                async (result) => {
                  setClosed(result);
                  setConfirming(false);
                  await queryClient.invalidateQueries({
                    queryKey: queryKeys.session(session.generation),
                  });
                  onClosed?.(result);
                },
              )
            }
          >
            {command.pending
              ? 'Closing…'
              : command.frozen
                ? 'Retry the same closure'
                : 'Confirm: close this request'}
          </button>
          <button
            type="button"
            disabled={command.locked}
            onClick={() => {
              setConfirming(false);
              command.reset();
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
