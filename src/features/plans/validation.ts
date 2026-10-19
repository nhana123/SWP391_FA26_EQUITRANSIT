import { validOffsetDate, type FieldErrors } from '../../shared/lib/validation';
import { canonicalTime, localTimeInput, OPERATIONAL_ZONE } from './operational-time';
import type {
  AssignmentState,
  CarrierState,
  FlightInput,
  InsuranceInput,
  Leg,
  LegInput,
  LegMode,
  QuarantineInput,
  ReservationState,
  RoadInput,
  StallInput,
} from './contracts';

type Result<T> = { input: T | null; errors: FieldErrors };
const done = <T>(input: T, errors: FieldErrors): Result<T> =>
  Object.keys(errors).length ? { input: null, errors } : { input, errors };
const version = /^[0-9a-f]{16}$/i;

function req(e: FieldErrors, name: string, v: string, max: number) {
  const t = v.trim();
  if (!t) e[name] = 'This field is required.';
  else if (t.length > max) e[name] = `Use at most ${max} characters.`;
  return t;
}
function optText(e: FieldErrors, name: string, v: string, max: number) {
  const t = v.trim();
  if (t.length > max) e[name] = `Use at most ${max} characters.`;
  return t || null;
}
function when(e: FieldErrors, name: string, v: string, required = true) {
  const t = v.trim();
  if (!t) {
    if (required) e[name] = 'Enter a date.';
    return null;
  }
  const canonical = canonicalTime(t);
  if (!canonical) e[name] = 'Enter a valid GMT+07:00 date and time.';
  return canonical;
}
function id(e: FieldErrors, name: string, v: string, required = true) {
  const t = v.trim();
  if (!t) {
    if (required) e[name] = 'Enter the ID.';
    return null;
  }
  if (!/^\d{1,15}$/.test(t) || Number(t) < 1) e[name] = 'Use a positive ID.';
  return Number(t);
}
function minutes(e: FieldErrors, name: string, v: string, required = false) {
  const t = v.trim();
  if (!t) {
    if (required) e[name] = 'Enter minutes (0 or more).';
    return null;
  }
  if (!/^\d+$/.test(t) || Number(t) > 525600) e[name] = 'Use whole minutes from 0 to 525600.';
  return Number(t);
}
/** Exact decimal text, sent as the JSON number the DTO declares. */
function decimal(
  e: FieldErrors,
  name: string,
  v: string,
  integer: number,
  fraction: number,
  min: number,
) {
  const t = v.trim();
  if (!new RegExp(`^\\d{1,${integer}}(\\.\\d{1,${fraction}})?$`).test(t) || Number(t) < min) {
    e[name] = `Use a number of at least ${min} with up to ${fraction} decimals.`;
    return 0;
  }
  return Number(t);
}
const after = (a: string | null, b: string | null) =>
  !!a && !!b && validOffsetDate(a) && validOffsetDate(b) && Date.parse(b) > Date.parse(a);

export type LegForm = {
  transportMode: LegMode;
  startPoint: string;
  endPoint: string;
  distanceKm: string;
  distanceSource: string;
  plannedDeparture: string;
  plannedArrival: string;
  startTimezone: string;
  endTimezone: string;
  supplierId: string;
  plannedFlightNumber: string;
  connectionBufferMinutes: string;
  restDurationMinutes: string;
  careInstructions: string;
  originCountryCode: string;
  destinationCountryCode: string;
};
export const emptyLeg = (transportMode: LegMode): LegForm => ({
  transportMode,
  startPoint: '',
  endPoint: '',
  distanceKm: '',
  distanceSource: '',
  plannedDeparture: '',
  plannedArrival: '',
  startTimezone: '',
  endTimezone: '',
  supplierId: '',
  plannedFlightNumber: '',
  connectionBufferMinutes: '',
  restDurationMinutes: '',
  careInstructions: '',
  originCountryCode: '',
  destinationCountryCode: '',
});
const s = (v: string | number | null) => (v === null ? '' : String(v));
/** Prefill a new draft version from an existing plan; nothing is edited in place. */
export const legToForm = (l: Leg): LegForm => ({
  transportMode: l.transportMode,
  startPoint: l.startPoint,
  endPoint: l.endPoint,
  distanceKm: l.distanceKm,
  distanceSource: s(l.distanceSource),
  plannedDeparture: localTimeInput(l.plannedDeparture),
  plannedArrival: localTimeInput(l.plannedArrival),
  startTimezone: OPERATIONAL_ZONE,
  endTimezone: OPERATIONAL_ZONE,
  supplierId: s(l.supplierId),
  plannedFlightNumber: s(l.plannedFlightNumber),
  connectionBufferMinutes: s(l.connectionBufferMinutes),
  restDurationMinutes: s(l.restDurationMinutes),
  careInstructions: s(l.careInstructions),
  originCountryCode: '',
  destinationCountryCode: '',
});

/** Field names are prefixed per leg: leg1.distanceKm, leg2.plannedDeparture… */
export function validateLegs(forms: LegForm[]): Result<LegInput[]> {
  const e: FieldErrors = {};
  if (forms.length < 1 || forms.length > 20) e.legs = 'A plan has 1 to 20 legs.';
  const legs = forms.map((f, i): LegInput => {
    const p = `leg${i + 1}.`;
    const le: FieldErrors = {};
    const departure = when(le, 'plannedDeparture', f.plannedDeparture);
    const arrival = when(le, 'plannedArrival', f.plannedArrival);
    if (
      departure &&
      arrival &&
      !le.plannedDeparture &&
      !le.plannedArrival &&
      !after(departure, arrival)
    )
      le.plannedArrival = 'The leg must arrive after it departs.';
    const prev = forms[i - 1];
    if (
      prev &&
      departure &&
      !le.plannedDeparture &&
      canonicalTime(prev.plannedArrival) &&
      Date.parse(departure) < Date.parse(canonicalTime(prev.plannedArrival)!)
    )
      le.plannedDeparture = `Departs before leg ${i} arrives.`;
    const leg: LegInput = {
      sequenceNo: i + 1,
      transportMode: f.transportMode,
      startPoint: req(le, 'startPoint', f.startPoint, 300),
      endPoint: req(le, 'endPoint', f.endPoint, 300),
      distanceKm: decimal(le, 'distanceKm', f.distanceKm, 9, 3, 0.001),
      // Distances feed pricing: each needs a real source.
      distanceSource: req(le, 'distanceSource', f.distanceSource, 1000),
      plannedDeparture: departure ?? '',
      plannedArrival: arrival ?? '',
      startTimezone: OPERATIONAL_ZONE,
      endTimezone: OPERATIONAL_ZONE,
      supplierId: id(le, 'supplierId', f.supplierId, false),
      plannedFlightNumber:
        f.transportMode === 'AIR'
          ? optText(le, 'plannedFlightNumber', f.plannedFlightNumber, 50)
          : null,
      connectionBufferMinutes: minutes(le, 'connectionBufferMinutes', f.connectionBufferMinutes),
      restDurationMinutes: minutes(le, 'restDurationMinutes', f.restDurationMinutes),
      careInstructions: optText(le, 'careInstructions', f.careInstructions, 2000),
    };
    for (const [k, v] of Object.entries(le)) e[p + k] = v;
    return leg;
  });
  return done(legs, e);
}

/** A resource version comes only from an availability check of that resource. */
export type Checked = { id: number; recordVersion: string } | null;

export function validateRoad(
  f: {
    vehicleId: string;
    driverStaffId: string;
    driverBufferMinutes: string;
    conflictNotes: string;
  },
  checked: Checked,
): Result<RoadInput> {
  const e: FieldErrors = {};
  const vehicleId = id(e, 'vehicleId', f.vehicleId);
  if (
    !e.vehicleId &&
    (!checked || checked.id !== vehicleId || !version.test(checked.recordVersion))
  )
    e.vehicleId = 'Check this vehicle’s availability first; its checked version is sent.';
  return done(
    {
      vehicleId: vehicleId ?? 0,
      vehicleRecordVersion: checked?.recordVersion ?? '',
      // StaffProfile.StaffID of a DRIVER, never a user account ID.
      driverStaffId: id(e, 'driverStaffId', f.driverStaffId) ?? 0,
      driverBufferMinutes: minutes(e, 'driverBufferMinutes', f.driverBufferMinutes, true) ?? 0,
      conflictNotes: optText(e, 'conflictNotes', f.conflictNotes, 1000),
    },
    e,
  );
}

export function validateStall(
  f: {
    stallId: string;
    carrierAcceptanceStatus: CarrierState | '';
    status: AssignmentState | '';
    positionDescription: string;
    carrierApprovalFileKey: string;
    carrierContact: string;
  },
  checked: Checked,
): Result<StallInput> {
  const e: FieldErrors = {};
  const stallId = id(e, 'stallId', f.stallId);
  if (!e.stallId && (!checked || checked.id !== stallId || !version.test(checked.recordVersion)))
    e.stallId = 'Check this stall’s availability first; its checked version is sent.';
  if (!f.carrierAcceptanceStatus) e.carrierAcceptanceStatus = 'Choose the carrier’s answer.';
  if (!f.status) e.status = 'Choose the assignment state.';
  const key = optText(e, 'carrierApprovalFileKey', f.carrierApprovalFileKey, 1024);
  // A confirmed assignment needs the carrier's acceptance and its proof.
  if (f.status === 'CONFIRMED') {
    if (f.carrierAcceptanceStatus !== 'ACCEPTED')
      e.carrierAcceptanceStatus ??= 'Only a carrier-accepted stall can be confirmed.';
    if (!key) e.carrierApprovalFileKey = 'Add the carrier approval file key to confirm.';
  }
  return done(
    {
      stallId: stallId ?? 0,
      stallRecordVersion: checked?.recordVersion ?? '',
      carrierAcceptanceStatus: f.carrierAcceptanceStatus as CarrierState,
      status: f.status as AssignmentState,
      positionDescription: optText(e, 'positionDescription', f.positionDescription, 500),
      carrierApprovalFileKey: key,
      carrierContact: optText(e, 'carrierContact', f.carrierContact, 500),
    },
    e,
  );
}

export function validateFlight(f: {
  offerId: string;
  airlineName: string;
  flightNumber: string;
  reservationReference: string;
  status: ReservationState | '';
  evidenceFileKey: string;
  expiresAt: string;
  supplierContact: string;
  usableCapacitySlots: string;
}): Result<FlightInput> {
  const e: FieldErrors = {};
  if (!f.status) e.status = 'Choose the reservation state.';
  const reference = optText(e, 'reservationReference', f.reservationReference, 150);
  const evidence = optText(e, 'evidenceFileKey', f.evidenceFileKey, 1024);
  const expiresAt = when(e, 'expiresAt', f.expiresAt, false);
  // HELD is not CONFIRMED: a confirmed booking needs its reference, evidence and expiry.
  if (f.status === 'CONFIRMED') {
    if (!reference) e.reservationReference = 'Add the airline booking reference to confirm.';
    if (!evidence) e.evidenceFileKey = 'Add the booking evidence file key to confirm.';
    if (!expiresAt) e.expiresAt ??= 'Add when the booking expires.';
  }
  if (expiresAt && !e.expiresAt && Date.parse(expiresAt) <= Date.now())
    e.expiresAt = 'Use a future expiry.';
  return done(
    {
      offerId: id(e, 'offerId', f.offerId) ?? 0,
      airlineName: req(e, 'airlineName', f.airlineName, 50),
      flightNumber: req(e, 'flightNumber', f.flightNumber, 50),
      reservationReference: reference,
      status: f.status as ReservationState,
      evidenceFileKey: evidence,
      expiresAt,
      supplierContact: optText(e, 'supplierContact', f.supplierContact, 500),
      usableCapacitySlots: decimal(e, 'usableCapacitySlots', f.usableCapacitySlots, 4, 1, 0.1),
    },
    e,
  );
}

export function validateQuarantine(
  f: {
    facilityName: string;
    reservationReference: string;
    startsAt: string;
    endsAt: string;
    status: ReservationState | '';
    supplierId: string;
    evidenceFileKey: string;
    expiresAt: string;
    facilityContact: string;
  },
  revisionId: number,
): Result<QuarantineInput> {
  const e: FieldErrors = {};
  const startsAt = when(e, 'startsAt', f.startsAt);
  const endsAt = when(e, 'endsAt', f.endsAt);
  if (startsAt && endsAt && !e.startsAt && !e.endsAt && !after(startsAt, endsAt))
    e.endsAt = 'The reservation must end after it starts.';
  if (!f.status) e.status = 'Choose the reservation state.';
  return done(
    {
      revisionId,
      facilityName: req(e, 'facilityName', f.facilityName, 300),
      reservationReference: optText(e, 'reservationReference', f.reservationReference, 150),
      startsAt: startsAt ?? '',
      endsAt: endsAt ?? '',
      status: f.status as ReservationState,
      supplierId: id(e, 'supplierId', f.supplierId, false),
      evidenceFileKey: optText(e, 'evidenceFileKey', f.evidenceFileKey, 1024),
      expiresAt: when(e, 'expiresAt', f.expiresAt, false),
      facilityContact: optText(e, 'facilityContact', f.facilityContact, 500),
    },
    e,
  );
}

export function validateInsurance(
  f: {
    insurerName: string;
    policyNumber: string;
    evidenceFileKey: string;
    coverageFrom: string;
    coverageTo: string;
    status: ReservationState | '';
    policyTerms: string;
  },
  revisionId: number,
): Result<InsuranceInput> {
  const e: FieldErrors = {};
  const from = when(e, 'coverageFrom', f.coverageFrom);
  const to = when(e, 'coverageTo', f.coverageTo);
  if (from && to && !e.coverageFrom && !e.coverageTo && !after(from, to))
    e.coverageTo = 'Coverage must end after it starts.';
  if (!f.status) e.status = 'Choose the policy state.';
  return done(
    {
      revisionId,
      insurerName: req(e, 'insurerName', f.insurerName, 300),
      policyNumber: req(e, 'policyNumber', f.policyNumber, 150),
      evidenceFileKey: optText(e, 'evidenceFileKey', f.evidenceFileKey, 1024),
      coverageFrom: from ?? '',
      coverageTo: to ?? '',
      status: f.status as ReservationState,
      policyTerms: optText(e, 'policyTerms', f.policyTerms, 2000),
    },
    e,
  );
}
