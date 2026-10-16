import { Link } from 'react-router-dom';
import { useSession } from '../../shared/api/session';
import { quotationParent } from './navigation';

/** Manager or assigned Coordinator entry to prepare a new quotation version. */
export function PrepareQuotationLink({ orderId }: { orderId: number }) {
  const session = useSession();
  if (!session || (session.role !== 'MANAGER' && session.role !== 'COORDINATOR')) return null;
  return (
    <Link className="button" to={`${quotationParent(session.role, orderId)}/quotes/prepare`}>
      Prepare quotation
    </Link>
  );
}
