import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { idSchema } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { displayDate as formatDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice } from '../../shared/ui/common';
import { plansApi } from './api';
import { blockerText, editablePlan, type Leg, type PlanDetail } from './contracts';
import {
  ConfirmForm,
  FlightForm,
  InsuranceForm,
  QuarantineForm,
  RoadForm,
  StallForm,
} from './forms';
import { StaleBanner, planKeys, usePinnedVersion, type Pinned } from './hooks';
import { DeploymentNotice, planAccess, plansPath, schemaPending } from './PlansPage';
import { JourneyStudio } from './studio/JourneyStudio';
import './plans.css';

const displayDate = (value: string | null) => formatDate(value, 'Asia/Ho_Chi_Minh');

function LegCard({
  plan,
  leg,
  pinned,
  editable,
}: {
  plan: PlanDetail;
  leg: Leg;
  pinned: Pinned;
  editable: boolean;
}) {
  const air = leg.transportMode === 'AIR';
  return (
    <section
      className="card plan-leg-card"
      id={`plan-resources-leg-${leg.legId}`}
      aria-label={`Leg ${leg.sequenceNo}`}
    >
      <h3>
        Leg {leg.sequenceNo} · {leg.transportMode}: {leg.startPoint} → {leg.endPoint}
      </h3>
      <p>
        {displayDate(leg.plannedDeparture)} → {displayDate(leg.plannedArrival)}. {leg.distanceKm} km
        — source: {leg.distanceSource ?? 'not recorded'}
        {leg.distanceConfirmedBy !== null && `, confirmed by staff ${leg.distanceConfirmedBy}`}.
      </p>
      {air && leg.plannedFlightNumber && <p>Planned flight {leg.plannedFlightNumber}.</p>}
      <ul className="plan-resources" aria-label={`Leg ${leg.sequenceNo} resources`}>
        {leg.vehicleId !== null && <li>Vehicle {leg.vehicleId}</li>}
        {leg.staffAssignments.map((a) => (
          <li key={a.assignmentId}>
            {a.roleInTrip} staff {a.staffId}: <span className="badge">{a.status}</span>
            {a.bufferMinutes !== null && ` (buffer ${a.bufferMinutes} min)`}
          </li>
        ))}
        {leg.stallAssignments.map((s) => (
          <li key={s.stallAssignmentId}>
            Stall {s.stallId}: {s.slotQuantity} slot(s), {s.sharingCode}, fit {s.fitStatus}, carrier{' '}
            {s.carrierAcceptanceStatus}, <span className="badge">{s.status}</span>
          </li>
        ))}
        {leg.flightReservations.map((r) => (
          <li key={r.reservationId}>
            {r.airlineName} {r.flightNumber}:{' '}
            <span className={`badge ${r.status === 'CONFIRMED' ? '' : 'warn'}`}>{r.status}</span>
            {r.reservationReference && `, ref ${r.reservationReference}`}, {r.usableCapacitySlots}{' '}
            usable slot(s)
            {r.expiresAt && `, expires ${displayDate(r.expiresAt)}`}
            {!r.evidenceFileKey && ' — no booking evidence'}
          </li>
        ))}
        {leg.vehicleId === null &&
          !leg.staffAssignments.length &&
          !leg.stallAssignments.length &&
          !leg.flightReservations.length && <li>No resources assigned yet.</li>}
      </ul>
      {editable &&
        (air ? (
          <>
            <StallForm plan={plan} leg={leg} pinned={pinned} />
            <FlightForm plan={plan} leg={leg} pinned={pinned} />
          </>
        ) : (
          <RoadForm plan={plan} leg={leg} pinned={pinned} />
        ))}
    </section>
  );
}

function PlanWorkspace({ orderId, planId }: { orderId: number; planId: number }) {
  const session = useSession()!;
  const navigate = useNavigate();
  const { hash } = useLocation();
  const role = session.role as 'MANAGER' | 'COORDINATOR';
  const query = useQuery({
    queryKey: planKeys.detail(session.generation, orderId, planId),
    queryFn: ({ signal }) => plansApi.get(orderId, planId, signal),
    staleTime: 0,
    retry: false,
  });
  const pinned = usePinnedVersion(orderId, query.data?.recordVersion);
  if (query.isPending) return <Loading />;
  if (schemaPending(query.error)) return <DeploymentNotice retry={() => void query.refetch()} />;
  if (query.error && !query.data)
    return (
      <ErrorNotice error={query.error}>
        {query.error instanceof ApiError && [403, 404].includes(query.error.status) && (
          <p>This plan is not available to you.</p>
        )}
      </ErrorNotice>
    );
  const plan = query.data!;
  const editable = editablePlan(plan.planStatus);
  return (
    <>
      <StaleBanner pinned={pinned} latest={plan.recordVersion} />
      <section className="card" aria-label="Plan summary">
        <h2>
          Plan v{plan.versionNo} <span className="badge">{plan.planStatus}</span>
          {plan.currentPlan && <span className="badge"> current</span>}
        </h2>
        <p>
          Revision {plan.revisionId}; {displayDate(plan.plannedStartTime)} →{' '}
          {displayDate(plan.plannedEndTime)}.
          {plan.acceptedQuoteId !== null &&
            ` Linked to accepted quotation ${plan.acceptedQuoteId}.`}
        </p>
        <p>
          Gates — financial: {plan.financialGateStatus}, operational: {plan.operationalGateStatus},
          legal: {plan.docGateStatus}
          {plan.gatesCheckedAt && ` (checked ${displayDate(plan.gatesCheckedAt)})`}. A confirmed
          plan does not authorize departure on its own.
        </p>
        {plan.confirmationBlockers.length > 0 ? (
          <ul aria-label="Confirmation blockers">
            {plan.confirmationBlockers.map((b) => (
              <li key={b}>
                {blockerText(b)} <small>({b})</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>No confirmation blockers.</p>
        )}
        {!editable && (
          <Notice>
            This version is {plan.planStatus.toLowerCase()} and cannot change.{' '}
            <Link to={`${plansPath(role, orderId)}?from=${plan.planId}`}>
              Create a new draft from it
            </Link>
            .
          </Notice>
        )}
      </section>
      <JourneyStudio
        orderId={orderId}
        planId={planId}
        mode="edit"
        revisionId={plan.revisionId}
        recordVersion={plan.recordVersion}
        canCompile={editable && !pinned.changed}
        onSaved={(nextId) => {
          if (nextId !== planId) navigate(`${plansPath(role, orderId)}/${nextId}`);
          else
            void query.refetch().then(({ data }) => {
              if (data) pinned.adopt(data.recordVersion);
            });
        }}
      />
      <details className="card" id="plan-resources" open={hash.startsWith('#plan-')}>
        <summary>Resource assignments, reservation evidence and plan confirmation</summary>
        {plan.legs.map((leg) => (
          <LegCard key={leg.legId} plan={plan} leg={leg} pinned={pinned} editable={editable} />
        ))}
        <section className="card" id="plan-reservations" aria-label="Quarantine and insurance">
          <h2>Quarantine and insurance</h2>
          <ul>
            {plan.quarantineReservations.map((q) => (
              <li key={q.reservationId}>
                Quarantine at {q.facilityName}: {displayDate(q.startsAt)} → {displayDate(q.endsAt)},{' '}
                <span className="badge">{q.status}</span>
              </li>
            ))}
            {plan.insurancePolicies.map((p) => (
              <li key={p.policyId}>
                Insurance {p.insurerName} {p.policyNumber}: {displayDate(p.coverageFrom)} →{' '}
                {displayDate(p.coverageTo)}, <span className="badge">{p.status}</span>
                {p.verifiedBy === null && ' — not verified'}
              </li>
            ))}
            {!plan.quarantineReservations.length && !plan.insurancePolicies.length && (
              <li>Nothing recorded yet.</li>
            )}
          </ul>
          {editable && (
            <>
              <QuarantineForm plan={plan} pinned={pinned} />
              <InsuranceForm plan={plan} pinned={pinned} />
            </>
          )}
        </section>
        <div id="plan-confirmation">{editable && <ConfirmForm plan={plan} pinned={pinned} />}</div>
      </details>
    </>
  );
}

export function PlanDetailPage() {
  const session = useSession();
  const params = useParams();
  const orderId = Number(params.id);
  const planId = Number(params.planId);
  if (!session) return null;
  if (!planAccess(session.role))
    return <Notice>You do not have access to operational plans.</Notice>;
  if (!idSchema.safeParse(orderId).success || !idSchema.safeParse(planId).success)
    return <Notice>This plan is unavailable.</Notice>;
  return (
    <>
      <header className="page-heading">
        <div>
          <small className="eyebrow">OPERATIONAL PLAN</small>
          <h1>Plan detail</h1>
          <p>Legs, resources, reservations and confirmation blockers.</p>
          <p className="muted">Operational timezone: GMT+07:00 (Asia/Ho_Chi_Minh).</p>
        </div>
        <Link to={plansPath(session.role as 'MANAGER' | 'COORDINATOR', orderId)}>
          Back to plan versions
        </Link>
      </header>
      <PlanWorkspace
        key={`${session.generation}/${orderId}/${planId}`}
        orderId={orderId}
        planId={planId}
      />
    </>
  );
}
