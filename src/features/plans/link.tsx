import { Link } from 'react-router-dom';
import { useSession } from '../../shared/api/session';
import { quotationParent } from '../quotations/navigation';

/** Entry for the Manager and the assigned Coordinator once a request is approved. */
const planStatuses = ['APPROVED', 'IN_PREPARATION', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED'];
export function PlansLink({ orderId, orderStatus }: { orderId: number; orderStatus: string }) {
  const session = useSession();
  if (!session || (session.role !== 'MANAGER' && session.role !== 'COORDINATOR')) return null;
  if (!planStatuses.includes(orderStatus)) return null;
  return (
    <Link className="button" to={`${quotationParent(session.role, orderId)}/plans`}>
      Operational plans
    </Link>
  );
}
