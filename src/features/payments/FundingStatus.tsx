import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { assessmentKeys, useManagerCase } from '../assessment/hooks';
import { departureApi } from '../departure/api';
import { orderStatusLabels } from '../transport-orders/status-contracts';
import { gatesKey } from '../workflow/GatesSummary';

/**
 * Allocating verified funds can move the request to IN_PREPARATION and the
 * financial gate to PASS; both are re-read from the server after a write.
 */
export function refreshFunding(generation: string, orderId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: assessmentKeys.case(generation, orderId) }),
    queryClient.invalidateQueries({ queryKey: gatesKey(generation, orderId) }),
  ]);
}

/** Manager view of what the ledger means for the request, as the server reports it. */
export function FundingStatus({ orderId }: { orderId: number }) {
  const session = useSession()!;
  const order = useManagerCase(orderId);
  const gates = useQuery({
    queryKey: gatesKey(session.generation, orderId),
    queryFn: ({ signal }) => departureApi.get(orderId, signal),
    retry: false,
    staleTime: 0,
  });
  const financial = gates.data?.financialGate;
  return (
    <section className="card" aria-label="Request funding status">
      <dl className="details">
        <div>
          <dt>Request status</dt>
          <dd>
            {order.data ? (
              <StatusBadge status={order.data.orderStatus}>
                {orderStatusLabels[order.data.orderStatus]}
              </StatusBadge>
            ) : order.error ? (
              'Unavailable'
            ) : (
              'Loading…'
            )}
          </dd>
        </div>
        <div>
          <dt>Financial gate</dt>
          <dd>
            {financial ? (
              <StatusBadge status={financial.status}>{financial.status}</StatusBadge>
            ) : gates.error instanceof ApiError && [404, 409].includes(gates.error.status) ? (
              'Shown once a journey plan exists.'
            ) : gates.error ? (
              'Unavailable'
            ) : (
              'Loading…'
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
