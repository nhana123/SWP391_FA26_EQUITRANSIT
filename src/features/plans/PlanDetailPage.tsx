import { StatusBadge } from '../../components/ui/StatusBadge';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { idSchema, type BookingFlowStatus } from '../../shared/api/contracts';
import { useSession } from '../../shared/api/session';
import { displayDate as formatDate } from '../../shared/lib/validation';
import { ErrorNotice, Loading, Notice } from '../../shared/ui/common';
import { bookingFlowKeys } from '../transport-orders/BookingFlowDepositPanel';
import { orderStatusApi } from '../transport-orders/status-api';
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
import { JourneyStudio, type VehiclePicks } from './studio/JourneyStudio';
import './plans.css';

const displayDate = (value: string | null) => formatDate(value, 'Asia/Ho_Chi_Minh');

function DepositAssignmentGateBanner({
  flow,
  role,
  orderId,
}: {
  flow: BookingFlowStatus;
  role: 'MANAGER' | 'COORDINATOR';
  orderId: number;
}) {
  const isRoad = flow.transportMode === 'ROAD';
  const quotationsLink =
    role === 'MANAGER'
      ? `/manager/requests/${orderId}/quotes`
      : `/staff/cases/${orderId}/quotes`;

  if (flow.isDepositSatisfied) {
    return (
      <section
        className="card"
        aria-label="Deposit and resource assignment gate"
        style={{
          border: '1.5px solid #10b981',
          backgroundColor: '#ecfdf5',
          padding: '14px 18px',
          marginBottom: 16,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <strong style={{ color: '#065f46', fontSize: 14, display: 'block' }}>
            ✓ Khách hàng đã hoàn tất đặt cọc 30% ({flow.depositPaid} USD)
          </strong>
          <span style={{ color: '#047857', fontSize: 13 }}>
            {flow.canAssignDriver
              ? 'Cổng thanh toán đặt cọc đã mở khóa — Điều phối viên có thể phân công Tài xế, Xe đường bộ và Chuồng bay.'
              : 'Đã nhận đủ tiền cọc 30%. Đơn cần ở trạng thái APPROVED hoặc IN_PREPARATION để bắt đầu gán tài nguyên.'}
          </span>
        </div>
        <span
          style={{
            backgroundColor: '#059669',
            color: '#ffffff',
            padding: '5px 12px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {flow.canAssignDriver ? 'Sẵn sàng phân công Tài xế' : 'Đã đặt cọc 30%'}
        </span>
      </section>
    );
  }

  return (
    <section
      className="card"
      aria-label="Deposit and resource assignment gate"
      style={{
        border: '1.5px solid #f59e0b',
        backgroundColor: '#fffbeb',
        padding: '14px 18px',
        marginBottom: 16,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div>
        <strong style={{ color: '#92400e', fontSize: 14, display: 'block' }}>
          🔒 Chưa mở khóa phân công Tài xế & Phương tiện ({flow.blockReason || 'DEPOSIT_REQUIRED'})
        </strong>
        <span style={{ color: '#b45309', fontSize: 13 }}>
          {flow.blockReason === 'AWAITING_MANAGER_APPROVAL'
            ? 'Đơn đang ở trạng thái SUBMITTED chờ Quản lý (Manager) duyệt và phân công Chuyên viên + Điều phối viên. Sau khi duyệt xong, khách hàng sẽ đặt cọc 30% để mở khóa gán tài xế.'
            : flow.blockReason === 'AWAITING_COORDINATOR_QUOTE'
              ? isRoad
                ? 'Đơn đường bộ có dịch vụ/khoảng cách cần thẩm định thêm. Bạn có thể thiết kế bản nháp lịch trình nhưng cần phát hành Báo giá và đợi khách đặt cọc 30% trước khi gán tài xế.'
                : 'Đơn hàng không đang chờ Điều phối viên lên lịch chuyến bay và phát hành Báo giá vé máy bay. Sau khi khách chấp nhận và đặt cọc 30%, chức năng phân công Tài xế & Chuồng bay sẽ mở khóa.'
              : flow.blockReason === 'QUOTE_ACCEPTANCE_REQUIRED'
                ? 'Báo giá đã được gửi và đang chờ Khách hàng nhấn Chấp nhận (Accept) & thanh toán đặt cọc 30%.'
                : `Khách hàng cần hoàn tất thanh toán đặt cọc 30% (${flow.depositAmount ?? '—'} USD, đã trả ${flow.depositPaid} USD) trước khi hệ thống cho phép phân công Tài xế, Xe hoặc Chuồng bay.`}
        </span>
      </div>
      {flow.blockReason === 'AWAITING_COORDINATOR_QUOTE' && (
        <Link
          to={quotationsLink}
          className="button primary"
          style={{
            backgroundColor: '#d97706',
            color: '#ffffff',
            fontSize: 12.5,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Lập & Phát hành Báo giá →
        </Link>
      )}
    </section>
  );
}

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
            {a.roleInTrip} staff {a.staffId}:{' '}
            <StatusBadge status={a.status}>{a.status}</StatusBadge>
            {a.bufferMinutes !== null && ` (buffer ${a.bufferMinutes} min)`}
          </li>
        ))}
        {leg.stallAssignments.map((s) => (
          <li key={s.stallAssignmentId}>
            Stall {s.stallId}: {s.slotQuantity} slot(s), {s.sharingCode}, fit{' '}
            <StatusBadge status={s.fitStatus} />, carrier{' '}
            <StatusBadge status={s.carrierAcceptanceStatus} />,{' '}
            <StatusBadge status={s.status}>{s.status}</StatusBadge>
          </li>
        ))}
        {leg.flightReservations.map((r) => (
          <li key={r.reservationId}>
            {r.airlineName} {r.flightNumber}:{' '}
            <StatusBadge status={r.status}>{r.status}</StatusBadge>
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
  const { hash, state } = useLocation();
  const role = session.role as 'MANAGER' | 'COORDINATOR';
  // Vehicles chosen while drafting, handed over by the Studio after its save.
  const vehiclePicks = (state as { vehiclePicks?: VehiclePicks } | null)?.vehiclePicks;
  const query = useQuery({
    queryKey: planKeys.detail(session.generation, orderId, planId),
    queryFn: ({ signal }) => plansApi.get(orderId, planId, signal),
    staleTime: 0,
    retry: false,
  });
  const flowQuery = useQuery({
    queryKey: bookingFlowKeys.status(session.generation, orderId),
    queryFn: ({ signal }) => orderStatusApi.bookingFlowStatus(orderId, signal),
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
  // The Coordinator designs and resources the plan; the Manager reviews it.
  const designer = role === 'COORDINATOR';
  return (
    <>
      {!designer && (
        <Notice>
          Read-only review: the assigned Coordinator designs this journey, assigns its resources and
          confirms the plan. You authorize departure once all three gates pass.
        </Notice>
      )}
      {flowQuery.data && (
        <DepositAssignmentGateBanner flow={flowQuery.data} role={role} orderId={orderId} />
      )}
      <StaleBanner pinned={pinned} latest={plan.recordVersion} />
      <section className="card" aria-label="Plan summary">
        <h2>
          Plan v{plan.versionNo}{' '}
          <StatusBadge status={plan.planStatus}>{plan.planStatus}</StatusBadge>
          {plan.currentPlan && <span className="badge"> current</span>}
        </h2>
        <p>
          Revision {plan.revisionId}; {displayDate(plan.plannedStartTime)} →{' '}
          {displayDate(plan.plannedEndTime)}.
          {plan.acceptedQuoteId !== null &&
            ` Linked to accepted quotation ${plan.acceptedQuoteId}.`}
        </p>
        <p>
          Gates — financial: <StatusBadge status={plan.financialGateStatus} />, operational:{' '}
          <StatusBadge status={plan.operationalGateStatus} />, legal:{' '}
          <StatusBadge status={plan.docGateStatus} />
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
        {!editable && designer && (
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
        vehiclePicks={vehiclePicks}
        onSaved={(nextId, picks) => {
          if (nextId !== planId)
            navigate(`${plansPath(role, orderId)}/${nextId}`, { state: { vehiclePicks: picks } });
          else
            void query.refetch().then(({ data }) => {
              if (data) pinned.adopt(data.recordVersion);
            });
        }}
      />
      <details className="card" id="plan-resources" open={hash.startsWith('#plan-')}>
        <summary>
          {designer
            ? 'Resource assignments, reservation evidence and plan confirmation'
            : 'Resource assignments and reservations (read-only)'}
        </summary>
        {plan.legs.map((leg) => (
          <LegCard
            key={leg.legId}
            plan={plan}
            leg={leg}
            pinned={pinned}
            editable={editable && designer}
          />
        ))}
        <section className="card" id="plan-reservations" aria-label="Quarantine and insurance">
          <h2>Quarantine and insurance</h2>
          <ul>
            {plan.quarantineReservations.map((q) => (
              <li key={q.reservationId}>
                Quarantine at {q.facilityName}: {displayDate(q.startsAt)} → {displayDate(q.endsAt)},{' '}
                <StatusBadge status={q.status}>{q.status}</StatusBadge>
              </li>
            ))}
            {plan.insurancePolicies.map((p) => (
              <li key={p.policyId}>
                Insurance {p.insurerName} {p.policyNumber}: {displayDate(p.coverageFrom)} →{' '}
                {displayDate(p.coverageTo)}, <StatusBadge status={p.status}>{p.status}</StatusBadge>
                {p.verifiedBy === null && ' — not verified'}
              </li>
            ))}
            {!plan.quarantineReservations.length && !plan.insurancePolicies.length && (
              <li>Nothing recorded yet.</li>
            )}
          </ul>
          {editable && designer && (
            <>
              <QuarantineForm plan={plan} pinned={pinned} />
              <InsuranceForm plan={plan} pinned={pinned} />
            </>
          )}
        </section>
        <div id="plan-confirmation">
          {editable && designer && <ConfirmForm plan={plan} pinned={pinned} />}
        </div>
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
