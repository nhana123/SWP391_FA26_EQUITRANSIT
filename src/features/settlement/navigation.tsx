import { Link } from 'react-router-dom';
import { idSchema } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';

/** F14 entry per role. Specialists and drivers have no cost or handover review page. */
export function SettlementPreviewLink({ orderId }: { orderId: number }) {
  const session = useSession();
  if (!session || !idSchema.safeParse(orderId).success) return null;
  let to: string;
  let label: string;
  if (session.role === 'CUSTOMER') {
    to = `/customer/requests/${orderId}/handover`;
    label = 'Delivery handover';
  } else if (session.role === 'MANAGER') {
    to = `/manager/requests/${orderId}/settlement`;
    label = 'Costs and profitability';
  } else if (session.role === 'COORDINATOR') {
    to = `/staff/cases/${orderId}/actual-costs`;
    label = 'Actual costs';
  } else return null;
  return (
    <Link className="button" to={to}>
      {label}
    </Link>
  );
}
