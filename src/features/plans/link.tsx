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

/** While the journey is being prepared the Studio is the Coordinator's one place to work. */
export const studioStatuses = ['APPROVED', 'IN_PREPARATION'];

export function StudioBanner({
  orderId,
  orderStatus,
  route,
  horse,
}: {
  orderId: number;
  orderStatus: string;
  route: string | null;
  horse: string | null;
}) {
  const session = useSession();
  if (session?.role !== 'COORDINATOR' || !studioStatuses.includes(orderStatus)) return null;
  return (
    <section className="card studio-banner" aria-labelledby="studio-banner-heading">
      <div>
        <small className="eyebrow">NEXT STEP · COORDINATOR</small>
        <h2 id="studio-banner-heading">Design the journey and enter its costs</h2>
        <p>
          {route ?? 'Route from the request'} · 1 horse{horse ? ` (${horse})` : ''}. Pickup and
          delivery are filled in from the request; vehicles, carriers, stalls and airfares are
          chosen in the Studio.
        </p>
      </div>
      <Link className="button primary" to={`${quotationParent('COORDINATOR', orderId)}/plans`}>
        🚀 Open Journey Studio
      </Link>
    </section>
  );
}
