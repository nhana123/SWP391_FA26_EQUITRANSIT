import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { idSchema } from '../../shared/api/contracts';
import { getSession, useSession } from '../../shared/api/session';
import { queryClient } from '../../shared/api/query';
import { Loading, Notice } from '../../shared/ui/common';
import { paymentsApi, paymentKeys } from './api';
import { accessDenied, PaymentError } from './errors';
import { ManagerPayments } from './ManagerPayments';
import { CustomerPayments } from './workspace';
import './payments.css';

export function PaymentLink({ orderId }: { orderId: number }) {
  const session = useSession();
  if (
    !session ||
    !['CUSTOMER', 'MANAGER'].includes(session.role) ||
    !idSchema.safeParse(orderId).success
  )
    return null;
  return (
    <Link
      className="button"
      to={`/${session.role === 'MANAGER' ? 'manager' : 'customer'}/requests/${orderId}/payments`}
    >
      Payments
    </Link>
  );
}
export function PaymentsPage() {
  const session = useSession();
  const orderId = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get('page') ?? '0');
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
  const valid = idSchema.safeParse(orderId).success;
  const permitted = !!session && ['CUSTOMER', 'MANAGER'].includes(session.role);
  const prefix = paymentKeys.all(session?.generation ?? '', session?.role ?? '', orderId);
  const key = paymentKeys.overview(session?.generation ?? '', session?.role ?? '', orderId, page);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => paymentsApi.overview(orderId, page, signal),
    enabled: valid && permitted,
    retry: false,
    placeholderData: (previous, previousQuery) =>
      prefix.every((part, index) => previousQuery?.queryKey[index] === part) ? previous : undefined,
  });
  if (!permitted)
    return <Notice>Only the owning Customer or an active Manager can access payments.</Notice>;
  if (!valid) return <Notice>This transport request is unavailable.</Notice>;
  const backTo = session.role === 'MANAGER' ? '/manager/requests' : '/customer/requests';
  if (query.isPending) return <Loading />;
  if (query.error && (!query.data || accessDenied(query.error)))
    return (
      <>
        <PaymentError error={query.error} backTo={backTo} />
        {!accessDenied(query.error) && (
          <button type="button" onClick={() => void query.refetch()}>
            Retry loading ledger
          </button>
        )}
      </>
    );
  async function refresh() {
    const current = await paymentsApi.overview(orderId, page);
    if (getSession()?.generation !== session!.generation) throw new Error('Session changed');
    queryClient.setQueryData(key, current);
    return current;
  }
  const Workspace = session.role === 'MANAGER' ? ManagerPayments : CustomerPayments;
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Payments</h1>
          <p>Bank transfer reports, verified receipts, allocations and refunds for this request.</p>
        </div>
        <Link to={`${backTo}/${orderId}`}>Back to request</Link>
      </header>
      <Notice>
        Reporting a transfer does not confirm received funds or authorize departure. Net paid values
        come from the current ledger. Refunds and reversals can change them.
      </Notice>
      <p>Collections are paged independently. This page is not the complete payment history.</p>
      {query.isPlaceholderData && <Loading />}
      <PaymentError error={query.error} backTo={backTo} />
      <Workspace
        key={`${session.generation}-${session.role}-${orderId}`}
        orderId={orderId}
        data={query.data!}
        readError={query.error}
        paging={query.isPlaceholderData}
        backTo={backTo}
        page={page}
        refresh={refresh}
        onPage={(value) => setParams({ page: String(value) })}
      />
    </>
  );
}
