import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ApiError } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/query';
import { useSession } from '../../shared/api/session';
import { Loading } from '../../shared/ui/common';
import { departureApi } from '../departure/api';
import { departurePath } from '../departure/DeparturePage';
import './workflow.css';

/** Shared by every read-only view of departure readiness. */
export const gatesKey = (generation: string, orderId: number) =>
  [...queryKeys.session(generation), 'gates-summary', orderId] as const;

const gates = [
  { key: 'financialGate', label: 'Financial gate', owner: 'Manager reconciles payments' },
  { key: 'legalGate', label: 'Legal gate', owner: 'Specialist clears the legal phases' },
  { key: 'operationalGate', label: 'Operational gate', owner: 'Coordinator confirms the plan' },
] as const;

/**
 * Read-only view of the three departure gates as the BE last evaluated them.
 * No legal or planning form is shown here: each gate belongs to its owner.
 */
export function GatesSummary({ orderId }: { orderId: number }) {
  const session = useSession()!;
  const query = useQuery({
    queryKey: gatesKey(session.generation, orderId),
    queryFn: ({ signal }) => departureApi.get(orderId, signal),
    retry: false,
    staleTime: 0,
  });
  const role = session.role as 'MANAGER' | 'COORDINATOR';
  return (
    <section className="card gates-summary" aria-labelledby="gates-heading">
      <h2 id="gates-heading">Departure gates (read-only)</h2>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <p className="muted">
          {query.error instanceof ApiError && [404, 409].includes(query.error.status)
            ? 'The gates appear once a journey plan exists for this request.'
            : 'The gates cannot be read right now.'}
        </p>
      ) : (
        <>
          <ul className="gates-grid">
            {gates.map((g) => {
              const gate = query.data[g.key];
              return (
                <li key={g.key} className={`gate-tile gate-${gate.status.toLowerCase()}`}>
                  <span>{g.label}</span>
                  <StatusBadge status={gate.status}>{gate.status}</StatusBadge>
                  <small>{g.owner}</small>
                  {gate.blockers.length > 0 && (
                    <small className="muted">
                      {gate.blockers.length} open item{gate.blockers.length === 1 ? '' : 's'}
                    </small>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="muted">
            {query.data.departureAuthorizedAt
              ? 'Departure is authorized.'
              : query.data.readyForAuthorization
                ? 'All gates pass: departure can be authorized.'
                : 'Departure is not authorized yet.'}{' '}
            {(role === 'MANAGER' || role === 'COORDINATOR') && (
              <Link to={departurePath(role, orderId)}>Open departure</Link>
            )}
          </p>
        </>
      )}
    </section>
  );
}
