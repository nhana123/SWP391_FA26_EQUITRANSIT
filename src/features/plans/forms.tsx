import { useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { useAction } from '../../shared/lib/useAction';
import { type FieldErrors } from '../../shared/lib/validation';
import { ErrorNotice } from '../../shared/ui/common';
import { useQuotations } from '../quotations/hooks';
import { resourcesApi } from '../resources/api';
import {
  blockerLabels as resourceBlockers,
  probeMode,
  type Availability,
} from '../resources/contracts';
import { plansApi } from './api';
import {
  assignmentStates,
  carrierStates,
  reservationStates,
  type AssignmentState,
  type CarrierState,
  type Leg,
  type PlanDetail,
  type ReservationState,
} from './contracts';
import { CommandForm, type Pinned } from './hooks';
import { Choice, TextInput } from './ui';
import {
  validateFlight,
  validateInsurance,
  validateQuarantine,
  validateRoad,
  validateStall,
  type Checked,
} from './validation';

/**
 * Checks a vehicle/stall for this leg's window (F09 probe, read-only). Only an
 * AVAILABLE result provides the resource version the assignment must carry.
 */
function AvailabilityCheck({
  kind,
  resourceId,
  plan,
  leg,
  carrierSupplierId,
  onChecked,
}: {
  kind: 'VEHICLE' | 'STALL';
  resourceId: string;
  plan: PlanDetail;
  leg: Leg;
  carrierSupplierId: number | null;
  onChecked: (checked: Checked) => void;
}) {
  const action = useAction();
  const [result, setResult] = useState<Availability | null>(null);
  const valid = /^\d{1,15}$/.test(resourceId.trim()) && Number(resourceId) > 0;
  function check() {
    if (!valid) return;
    const id = Number(resourceId);
    setResult(null);
    onChecked(null);
    void action.run(async () => {
      const a = await resourcesApi.probe(kind, id, {
        orderId: plan.orderId,
        revisionId: plan.revisionId,
        mode: probeMode[kind],
        start: leg.plannedDeparture,
        end: leg.plannedArrival,
        carrierSupplierId: kind === 'STALL' ? carrierSupplierId : null,
        legId: leg.legId,
      });
      setResult(a);
      onChecked(a.status === 'AVAILABLE' ? { id, recordVersion: a.recordVersion } : null);
    });
  }
  return (
    <div className="plan-check">
      <button type="button" disabled={!valid || action.pending} onClick={check}>
        {action.pending
          ? 'Checking…'
          : `Check ${kind === 'STALL' ? 'stall' : 'vehicle'} availability`}
      </button>
      <ErrorNotice error={action.error} />
      {result && (
        <div role="status" aria-label="Availability check">
          <strong>{result.status}</strong> for this leg’s window (version {result.recordVersion}).
          {result.blockers.length > 0 && (
            <ul>
              {result.blockers.map((b) => (
                <li key={b}>{resourceBlockers[b]}</li>
              ))}
            </ul>
          )}
          {result.status !== 'AVAILABLE' && <p>This resource cannot be assigned now.</p>}
          <p className="muted">A check does not reserve anything; assigning rechecks it.</p>
        </div>
      )}
    </div>
  );
}

export function RoadForm({ plan, leg, pinned }: { plan: PlanDetail; leg: Leg; pinned: Pinned }) {
  const [f, setF] = useState({
    vehicleId: '',
    driverStaffId: '',
    driverBufferMinutes: '',
    conflictNotes: '',
  });
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));
  const [checked, setChecked] = useState<Checked>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label={`Assign road resources to leg ${leg.sequenceNo}`}
      title={`Leg ${leg.sequenceNo}: vehicle and driver`}
      pinned={pinned}
      submitLabel="Assign vehicle and driver"
      send={(body) => plansApi.road(plan.orderId, plan.planId, leg.legId, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateRoad(f, checked);
        setErrors(r.errors);
        return r.input;
      }}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <p className="muted">
            Only for road legs EquiTransit operates. Do not assign internal resources to a road leg
            the customer arranges themselves.
          </p>
          <TextInput
            label="Vehicle ID"
            inputMode="numeric"
            max={15}
            value={f.vehicleId}
            onChange={(vehicleId) => {
              setChecked(null);
              set({ vehicleId });
            }}
            error={fields.vehicleId}
          />
          <AvailabilityCheck
            kind="VEHICLE"
            resourceId={f.vehicleId}
            plan={plan}
            leg={leg}
            carrierSupplierId={null}
            onChecked={setChecked}
          />
          <TextInput
            label="Driver staff ID"
            hint="The driver's Staff ID, not their user account ID."
            inputMode="numeric"
            max={15}
            value={f.driverStaffId}
            onChange={(driverStaffId) => set({ driverStaffId })}
            error={fields.driverStaffId}
          />
          <TextInput
            label="Driver buffer (minutes)"
            inputMode="numeric"
            max={6}
            value={f.driverBufferMinutes}
            onChange={(driverBufferMinutes) => set({ driverBufferMinutes })}
            error={fields.driverBufferMinutes}
          />
          <TextInput
            label="Notes (optional)"
            area
            max={1000}
            value={f.conflictNotes}
            onChange={(conflictNotes) => set({ conflictNotes })}
            error={fields.conflictNotes}
          />
        </fieldset>
      )}
    </CommandForm>
  );
}

export function StallForm({ plan, leg, pinned }: { plan: PlanDetail; leg: Leg; pinned: Pinned }) {
  const [f, setF] = useState({
    stallId: '',
    carrierAcceptanceStatus: '' as CarrierState | '',
    status: '' as AssignmentState | '',
    positionDescription: '',
    carrierApprovalFileKey: '',
    carrierContact: '',
  });
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));
  const [checked, setChecked] = useState<Checked>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label={`Assign stall to leg ${leg.sequenceNo}`}
      title={`Leg ${leg.sequenceNo}: air stall`}
      pinned={pinned}
      submitLabel="Assign stall"
      send={(body) => plansApi.stall(plan.orderId, plan.planId, leg.legId, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateStall(f, checked);
        setErrors(r.errors);
        return r.input;
      }}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <p className="muted">
            Slots and sharing come from the customer's service request; they are not set here.
          </p>
          <TextInput
            label="Stall ID"
            inputMode="numeric"
            max={15}
            value={f.stallId}
            onChange={(stallId) => {
              setChecked(null);
              set({ stallId });
            }}
            error={fields.stallId}
          />
          <AvailabilityCheck
            kind="STALL"
            resourceId={f.stallId}
            plan={plan}
            leg={leg}
            carrierSupplierId={leg.supplierId}
            onChecked={setChecked}
          />
          <Choice
            label="Carrier answer"
            value={f.carrierAcceptanceStatus}
            options={carrierStates}
            onChange={(carrierAcceptanceStatus) => set({ carrierAcceptanceStatus })}
            error={fields.carrierAcceptanceStatus}
          />
          <Choice
            label="Assignment state"
            value={f.status}
            options={assignmentStates}
            onChange={(status) => set({ status })}
            error={fields.status}
          />
          <TextInput
            label="Carrier approval file key"
            hint="Required to confirm."
            max={1024}
            value={f.carrierApprovalFileKey}
            onChange={(carrierApprovalFileKey) => set({ carrierApprovalFileKey })}
            error={fields.carrierApprovalFileKey}
          />
          <TextInput
            label="Position on aircraft (optional)"
            max={500}
            value={f.positionDescription}
            onChange={(positionDescription) => set({ positionDescription })}
            error={fields.positionDescription}
          />
          <TextInput
            label="Carrier contact (optional)"
            max={500}
            value={f.carrierContact}
            onChange={(carrierContact) => set({ carrierContact })}
            error={fields.carrierContact}
          />
        </fieldset>
      )}
    </CommandForm>
  );
}

export function FlightForm({ plan, leg, pinned }: { plan: PlanDetail; leg: Leg; pinned: Pinned }) {
  const [f, setF] = useState({
    offerId: '',
    airlineName: '',
    flightNumber: leg.plannedFlightNumber ?? '',
    reservationReference: '',
    status: '' as ReservationState | '',
    evidenceFileKey: '',
    expiresAt: '',
    supplierContact: '',
    usableCapacitySlots: '',
  });
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label={`Record flight for leg ${leg.sequenceNo}`}
      title={`Leg ${leg.sequenceNo}: flight reservation`}
      pinned={pinned}
      submitLabel="Record flight reservation"
      send={(body) => plansApi.flight(plan.orderId, plan.planId, leg.legId, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateFlight(f);
        setErrors(r.errors);
        return r.input;
      }}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <p className="muted">
            A held seat is not a confirmed booking and never satisfies confirmation.
          </p>
          <TextInput
            label="Airfare offer ID"
            hint="The supplier offer recorded for this revision."
            inputMode="numeric"
            max={15}
            value={f.offerId}
            onChange={(offerId) => set({ offerId })}
            error={fields.offerId}
          />
          <TextInput
            label="Airline"
            max={50}
            value={f.airlineName}
            onChange={(airlineName) => set({ airlineName })}
            error={fields.airlineName}
          />
          <TextInput
            label="Flight number"
            max={50}
            value={f.flightNumber}
            onChange={(flightNumber) => set({ flightNumber })}
            error={fields.flightNumber}
          />
          <Choice
            label="Reservation state"
            value={f.status}
            options={reservationStates}
            onChange={(status) => set({ status })}
            error={fields.status}
          />
          <TextInput
            label="Booking reference"
            hint="Required to confirm."
            max={150}
            value={f.reservationReference}
            onChange={(reservationReference) => set({ reservationReference })}
            error={fields.reservationReference}
          />
          <TextInput
            label="Booking evidence file key"
            hint="Required to confirm."
            max={1024}
            value={f.evidenceFileKey}
            onChange={(evidenceFileKey) => set({ evidenceFileKey })}
            error={fields.evidenceFileKey}
          />
          <TextInput
            label="Booking expires at"
            date
            max={35}
            value={f.expiresAt}
            onChange={(expiresAt) => set({ expiresAt })}
            error={fields.expiresAt}
          />
          <TextInput
            label="Usable stall capacity (slots)"
            inputMode="decimal"
            max={6}
            value={f.usableCapacitySlots}
            onChange={(usableCapacitySlots) => set({ usableCapacitySlots })}
            error={fields.usableCapacitySlots}
          />
          <TextInput
            label="Supplier contact (optional)"
            max={500}
            value={f.supplierContact}
            onChange={(supplierContact) => set({ supplierContact })}
            error={fields.supplierContact}
          />
        </fieldset>
      )}
    </CommandForm>
  );
}

export function QuarantineForm({ plan, pinned }: { plan: PlanDetail; pinned: Pinned }) {
  const [f, setF] = useState({
    facilityName: '',
    reservationReference: '',
    startsAt: '',
    endsAt: '',
    status: '' as ReservationState | '',
    supplierId: '',
    evidenceFileKey: '',
    expiresAt: '',
    facilityContact: '',
  });
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label="Record quarantine reservation"
      title="Quarantine reservation"
      pinned={pinned}
      submitLabel="Record quarantine"
      send={(body) => plansApi.quarantine(plan.orderId, plan.planId, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateQuarantine(f, plan.revisionId);
        setErrors(r.errors);
        return r.input;
      }}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <p className="muted">
            Must span at least the specialist's current required quarantine days.
          </p>
          <TextInput
            label="Facility"
            max={300}
            value={f.facilityName}
            onChange={(facilityName) => set({ facilityName })}
            error={fields.facilityName}
          />
          <TextInput
            label="Starts at"
            date
            max={35}
            value={f.startsAt}
            onChange={(startsAt) => set({ startsAt })}
            error={fields.startsAt}
          />
          <TextInput
            label="Ends at"
            date
            max={35}
            value={f.endsAt}
            onChange={(endsAt) => set({ endsAt })}
            error={fields.endsAt}
          />
          <Choice
            label="Reservation state"
            value={f.status}
            options={reservationStates}
            onChange={(status) => set({ status })}
            error={fields.status}
          />
          <TextInput
            label="Reference (optional)"
            max={150}
            value={f.reservationReference}
            onChange={(reservationReference) => set({ reservationReference })}
            error={fields.reservationReference}
          />
          <TextInput
            label="Evidence file key (optional)"
            max={1024}
            value={f.evidenceFileKey}
            onChange={(evidenceFileKey) => set({ evidenceFileKey })}
            error={fields.evidenceFileKey}
          />
          <TextInput
            label="Supplier ID (optional)"
            inputMode="numeric"
            max={15}
            value={f.supplierId}
            onChange={(supplierId) => set({ supplierId })}
            error={fields.supplierId}
          />
          <TextInput
            label="Reservation expires at (optional)"
            date
            max={35}
            value={f.expiresAt}
            onChange={(expiresAt) => set({ expiresAt })}
            error={fields.expiresAt}
          />
          <TextInput
            label="Facility contact (optional)"
            max={500}
            value={f.facilityContact}
            onChange={(facilityContact) => set({ facilityContact })}
            error={fields.facilityContact}
          />
        </fieldset>
      )}
    </CommandForm>
  );
}

export function InsuranceForm({ plan, pinned }: { plan: PlanDetail; pinned: Pinned }) {
  const [f, setF] = useState({
    insurerName: '',
    policyNumber: '',
    evidenceFileKey: '',
    coverageFrom: '',
    coverageTo: '',
    status: '' as ReservationState | '',
    policyTerms: '',
  });
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <CommandForm
      label="Record insurance policy"
      title="Insurance policy"
      pinned={pinned}
      submitLabel="Record insurance"
      send={(body) => plansApi.insurance(plan.orderId, plan.planId, body)}
      fieldErrors={errors}
      build={() => {
        const r = validateInsurance(f, plan.revisionId);
        setErrors(r.errors);
        return r.input;
      }}
    >
      {(locked, fields) => (
        <fieldset className="form-grid" disabled={locked}>
          <p className="muted">
            Coverage must include the whole planned window and carry evidence.
          </p>
          <TextInput
            label="Insurer"
            max={300}
            value={f.insurerName}
            onChange={(insurerName) => set({ insurerName })}
            error={fields.insurerName}
          />
          <TextInput
            label="Policy number"
            max={150}
            value={f.policyNumber}
            onChange={(policyNumber) => set({ policyNumber })}
            error={fields.policyNumber}
          />
          <TextInput
            label="Coverage from"
            date
            max={35}
            value={f.coverageFrom}
            onChange={(coverageFrom) => set({ coverageFrom })}
            error={fields.coverageFrom}
          />
          <TextInput
            label="Coverage to"
            date
            max={35}
            value={f.coverageTo}
            onChange={(coverageTo) => set({ coverageTo })}
            error={fields.coverageTo}
          />
          <Choice
            label="Policy state"
            value={f.status}
            options={reservationStates}
            onChange={(status) => set({ status })}
            error={fields.status}
          />
          <TextInput
            label="Evidence file key (optional)"
            max={1024}
            value={f.evidenceFileKey}
            onChange={(evidenceFileKey) => set({ evidenceFileKey })}
            error={fields.evidenceFileKey}
          />
          <TextInput
            label="Policy terms (optional)"
            area
            max={2000}
            value={f.policyTerms}
            onChange={(policyTerms) => set({ policyTerms })}
            error={fields.policyTerms}
          />
        </fieldset>
      )}
    </CommandForm>
  );
}

/** Confirms against the accepted quotation of this revision; blockers are never bypassed. */
export function ConfirmForm({ plan, pinned }: { plan: PlanDetail; pinned: Pinned }) {
  const quotes = useQuotations(plan.orderId, 0, 20);
  const accepted = (quotes.data?.items ?? []).filter(
    (q) => q.status === 'ACCEPTED' && q.revisionId === plan.revisionId,
  );
  const [quoteId, setQuoteId] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const blocked = plan.confirmationBlockers.length > 0;
  return (
    <CommandForm
      label="Confirm plan"
      title={`Confirm plan version ${plan.versionNo}`}
      pinned={pinned}
      submitLabel="Confirm plan"
      send={(body) => plansApi.confirm(plan.orderId, plan.planId, body)}
      fieldErrors={errors}
      build={() => {
        const next: FieldErrors = {};
        if (blocked) next.form = 'Resolve every confirmation blocker first.';
        if (!quoteId) next.acceptedQuoteId = 'Choose the accepted quotation of this revision.';
        setErrors(next);
        return Object.keys(next).length ? null : { acceptedQuoteId: Number(quoteId) };
      }}
    >
      {(locked, fields) => (
        <>
          {(fields.form || blocked) && (
            <p className="field-error" role="alert">
              {fields.form ?? 'This plan still has confirmation blockers (listed above).'}
            </p>
          )}
          {quotes.error instanceof ApiError && <ErrorNotice error={quotes.error} />}
          <fieldset className="form-grid" disabled={locked}>
            <Choice
              label="Accepted quotation"
              value={quoteId}
              options={accepted.map((q) => String(q.quoteId))}
              labels={Object.fromEntries(
                accepted.map((q) => [String(q.quoteId), `${q.quoteNumber} (v${q.version})`]),
              )}
              onChange={setQuoteId}
              error={fields.acceptedQuoteId}
            />
          </fieldset>
          {!quotes.isPending && !accepted.length && (
            <p className="muted">
              No accepted quotation for this revision yet; the plan cannot be confirmed.
            </p>
          )}
        </>
      )}
    </CommandForm>
  );
}
