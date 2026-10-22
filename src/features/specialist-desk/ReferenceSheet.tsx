import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../components/ui/Icons';
import { CodeChip } from '../../components/ui/Primitives';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ApiError } from '../../shared/api/client';
import { useSession } from '../../shared/api/session';
import { displayDate } from '../../shared/lib/validation';
import { useAssignedCase } from '../assigned-cases/hooks';
import { complianceApi } from '../compliance/api';
import { phaseLabels, phases, type Phase } from '../compliance/contracts';
import { complianceKeys, useOverview } from '../compliance/hooks';
import { orderStatusLabels } from '../transport-orders/status-contracts';
import './dossier.css';

const decisionText: Record<string, string> = {
  APPROVED: 'Approved for preparation',
  CHANGES_REQUESTED: 'Changes requested',
  REJECTED: 'Rejected',
};
const measure = (value: number | null | undefined, unit: string) =>
  value === null || value === undefined ? null : `${value} ${unit}`;

/** One legal stamp: the phase readiness the BE reports, never inferred. */
function PhaseStamp({
  orderId,
  phase,
  index,
  active,
  onOpen,
}: {
  orderId: number;
  phase: Phase;
  index: number;
  active: boolean;
  onOpen: (phase: Phase) => void;
}) {
  const overview = useOverview(orderId, phase, 0);
  const status = overview.data?.readiness.status;
  const label = !overview.data
    ? overview.error
      ? 'Unavailable'
      : 'Checking…'
    : status === 'READY'
      ? 'Cleared'
      : 'Pending';
  return (
    <li>
      <button
        type="button"
        className={`dossier-stamp ${status === 'READY' ? 'cleared' : ''}`}
        aria-pressed={active}
        aria-label={`${index}. ${phaseLabels[phase]} stamp: ${label}`}
        onClick={() => onOpen(phase)}
      >
        <span className="dossier-stamp-mark" aria-hidden="true">
          {status === 'READY' ? <Icon name="check" size={14} /> : index}
        </span>
        <span>{phaseLabels[phase]}</span>
        <StatusBadge status={status === 'READY' ? 'CLEARED' : 'PENDING'}>{label}</StatusBadge>
      </button>
    </li>
  );
}

/**
 * Left page of an open dossier: the case facts a Specialist checks documents
 * against, so the case page is never needed mid-review. Read-only.
 */
export function ReferenceSheet({
  orderId,
  phase,
  onPhase,
  onAssessment,
}: {
  orderId: number;
  phase: Phase;
  onPhase: (phase: Phase) => void;
  onAssessment: () => void;
}) {
  const { generation } = useSession()!;
  const caseQuery = useAssignedCase(orderId);
  const assessment = useQuery({
    queryKey: complianceKeys.assessment(generation, orderId),
    queryFn: ({ signal }) => complianceApi.assessment(orderId, signal),
    retry: false,
  });
  const current = caseQuery.data;
  const request = current?.revision?.snapshot.request;
  const horse = current?.revision?.snapshot.horse;
  const a = assessment.data;
  const quarantine =
    !a || a.applicability === null
      ? 'Not assessed yet'
      : a.applicability === 'REQUIRED'
        ? `Required${a.requiredDays !== null ? ` · ${a.requiredDays} days` : ''}`
        : 'Not required';
  const sizes = [
    measure(horse?.weightKg, 'kg'),
    measure(horse?.heightCm, 'cm high'),
    measure(horse?.bodyWidthCm, 'cm wide'),
  ].filter(Boolean);
  return (
    <aside className="dossier-reference" aria-label="Dossier reference sheet">
      <section>
        <small className="eyebrow">DOSSIER</small>
        {current ? (
          <>
            <CodeChip value={current.orderNumber} />
            <StatusBadge status={current.orderStatus}>
              {orderStatusLabels[current.orderStatus]}
            </StatusBadge>
          </>
        ) : (
          <p className="muted">
            {caseQuery.error instanceof ApiError && caseQuery.error.status === 404
              ? 'The case file is no longer shown to you (it may have moved past preparation). The legal file below stays available.'
              : caseQuery.error
                ? 'Case facts are unavailable right now.'
                : 'Loading case facts…'}
          </p>
        )}
        <dl className="dossier-ref-list">
          <div>
            <dt>Route</dt>
            <dd className="dossier-route">
              <strong>{request?.originCountryCode ?? '—'}</strong>
              <Icon name="arrow" size={14} />
              <strong>{request?.destinationCountryCode ?? '—'}</strong>
            </dd>
          </div>
          <div>
            <dt>Delivery deadline</dt>
            <dd>{request?.deliveryDeadline ? displayDate(request.deliveryDeadline) : 'Not set'}</dd>
          </div>
          {request?.transitAirports && request.transitAirports.length > 0 && (
            <div>
              <dt>Transit airports</dt>
              <dd>{request.transitAirports.join(', ')}</dd>
            </div>
          )}
        </dl>
      </section>
      <section>
        <small className="eyebrow">HORSE & ASSESSMENT</small>
        <dl className="dossier-ref-list">
          <div>
            <dt>Horse</dt>
            <dd>{horse?.name ?? 'Not captured'}</dd>
          </div>
          <div>
            <dt>Microchip</dt>
            <dd>{horse?.microchipId ?? 'Not recorded'}</dd>
          </div>
          {sizes.length > 0 && (
            <div>
              <dt>Measurements</dt>
              <dd>{sizes.join(' · ')}</dd>
            </div>
          )}
          <div>
            <dt>Manager decision</dt>
            <dd>
              {current?.decision
                ? (decisionText[current.decision.decision] ?? current.decision.decision)
                : 'None recorded'}
            </dd>
          </div>
          <div>
            <dt>Quarantine assessment</dt>
            <dd>{assessment.error ? 'Unavailable' : quarantine}</dd>
          </div>
        </dl>
        <button type="button" className="dossier-link-button" onClick={onAssessment}>
          <Icon name="chart" size={15} />
          Veterinary & quarantine assessment
        </button>
      </section>
      <section>
        <small className="eyebrow">LEGAL STAMPS</small>
        <ol className="dossier-stamps" aria-label="Legal phase stamps">
          {phases.map((p, i) => (
            <PhaseStamp
              key={p}
              orderId={orderId}
              phase={p}
              index={i + 1}
              active={p === phase}
              onOpen={onPhase}
            />
          ))}
        </ol>
        <p className="muted dossier-note">Each phase is cleared on its own.</p>
      </section>
    </aside>
  );
}
