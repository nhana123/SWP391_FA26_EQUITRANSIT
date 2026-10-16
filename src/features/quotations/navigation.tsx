import { Link } from 'react-router-dom';
import { idSchema, type Role } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { canReadQuotations } from './hooks';

export function quotationParent(role: Role, orderId: number) {
  if (role === 'CUSTOMER') return `/customer/requests/${orderId}`;
  if (role === 'MANAGER') return `/manager/requests/${orderId}`;
  return `/staff/cases/${orderId}`;
}
export function QuotationLink({ orderId }: { orderId: number }) {
  const session = useSession();
  if (!session || !canReadQuotations(session.role) || !idSchema.safeParse(orderId).success)
    return null;
  return (
    <Link className="button" to={`${quotationParent(session.role, orderId)}/quotes`}>
      Quotations
    </Link>
  );
}
