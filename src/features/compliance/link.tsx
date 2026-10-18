import { Link } from 'react-router-dom';
import { useSession } from '../../shared/api/session';

/** Statuses where BE F08 accepts legal work on the current revision. */
const legalStatuses = ['APPROVED', 'IN_PREPARATION', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED'];

/** Entry for the owning Customer and the assigned Specialist only. */
export function ComplianceLink({ orderId, orderStatus }: { orderId: number; orderStatus: string }) {
  const session = useSession();
  if (!legalStatuses.includes(orderStatus)) return null;
  if (session?.role === 'CUSTOMER')
    return (
      <Link className="button" to={`/customer/requests/${orderId}/compliance`}>
        Legal documents
      </Link>
    );
  if (session?.role === 'SPECIALIST')
    return (
      <Link className="button" to={`/staff/cases/${orderId}/compliance`}>
        Legal compliance
      </Link>
    );
  return null;
}
