import { validOffsetDate, type FieldErrors } from '../../shared/lib/validation';
import type {
  HealthStatus,
  MilestoneInput,
  MilestoneType,
  SourceCode,
  TransitionInput,
  WelfareInput,
} from './contracts';

type Result<T> = { input: T | null; errors: FieldErrors };
const done = <T>(input: T, e: FieldErrors): Result<T> =>
  Object.keys(e).length ? { input: null, errors: e } : { input, errors: e };
const coordinate = /^-?\d{1,3}(\.\d{1,6})?$/;
const measure = /^\d{1,6}(\.\d{1,2})?$/;

function opt(e: FieldErrors, name: string, v: string, max: number) {
  const t = v.trim();
  if (t.length > max) e[name] = `Use at most ${max} characters.`;
  return t || null;
}
/** An observed time: offset date, not in the future. The BE also bounds it to the leg. */
function observed(e: FieldErrors, name: string, v: string) {
  const t = v.trim();
  if (!validOffsetDate(t)) e[name] = 'Use an ISO date with offset, e.g. 2027-02-01T08:00:00+07:00.';
  else if (Date.parse(t) > Date.now()) e[name] = 'An observed time cannot be in the future.';
  return t;
}
function source(e: FieldErrors, mode: 'ROAD' | 'AIR', code: SourceCode | '', reference: string) {
  if (!code) e.sourceCode = 'Choose where this information comes from.';
  else if (mode === 'AIR' && code === 'DRIVER_REPORT')
    e.sourceCode = 'Air leg facts need a carrier, airport or authority source.';
  const ref = reference.trim();
  if (!ref || ref.length > 500) e.sourceReference = 'Enter the source reference (1–500).';
  return ref;
}

export type TransitionForm = {
  occurredAt: string;
  sourceCode: SourceCode | '';
  sourceReference: string;
};
export function validateTransition(
  mode: 'ROAD' | 'AIR',
  f: TransitionForm,
): Result<TransitionInput> {
  const e: FieldErrors = {};
  const occurredAt = observed(e, 'occurredAt', f.occurredAt);
  const sourceReference = source(e, mode, f.sourceCode, f.sourceReference);
  return done({ occurredAt, sourceCode: f.sourceCode as SourceCode, sourceReference }, e);
}

export type MilestoneForm = TransitionForm & {
  milestoneType: MilestoneType | '';
  latitude: string;
  longitude: string;
  locationDescription: string;
  estimatedArrivalAt: string;
  delayReason: string;
  publicNote: string;
  internalNotes: string;
  customerVisible: '' | 'true' | 'false';
};
export function validateMilestone(mode: 'ROAD' | 'AIR', f: MilestoneForm): Result<MilestoneInput> {
  const e: FieldErrors = {};
  const occurredAt = observed(e, 'occurredAt', f.occurredAt);
  const sourceReference = source(e, mode, f.sourceCode, f.sourceReference);
  if (!f.milestoneType) e.milestoneType = 'Choose the kind of update.';
  const lat = f.latitude.trim();
  const lng = f.longitude.trim();
  if (!!lat !== !!lng)
    e[lat ? 'longitude' : 'latitude'] = 'Enter both latitude and longitude, or neither.';
  if (lat && (!coordinate.test(lat) || Math.abs(Number(lat)) > 90))
    e.latitude = 'Use −90 to 90 with up to 6 decimals.';
  if (lng && (!coordinate.test(lng) || Math.abs(Number(lng)) > 180))
    e.longitude = 'Use −180 to 180 with up to 6 decimals.';
  const eta = f.estimatedArrivalAt.trim();
  if (eta) {
    if (!validOffsetDate(eta)) e.estimatedArrivalAt = 'Use an ISO date with offset.';
    else if (!e.occurredAt && Date.parse(eta) < Date.parse(occurredAt))
      e.estimatedArrivalAt = 'The estimated arrival cannot be before the event.';
  }
  const delayReason = opt(e, 'delayReason', f.delayReason, 1000);
  if (f.milestoneType === 'DELAY' && !delayReason) e.delayReason = 'Explain the delay.';
  if (!f.customerVisible) e.customerVisible = 'Choose whether the customer can see this update.';
  return done(
    {
      occurredAt,
      sourceCode: f.sourceCode as SourceCode,
      sourceReference,
      milestoneType: f.milestoneType as MilestoneType,
      latitude: lat || null,
      longitude: lng || null,
      locationDescription: opt(e, 'locationDescription', f.locationDescription, 500),
      estimatedArrivalAt: eta || null,
      delayReason,
      publicNote: opt(e, 'publicNote', f.publicNote, 2000),
      internalNotes: opt(e, 'internalNotes', f.internalNotes, 2000),
      customerVisible: f.customerVisible === 'true',
    },
    e,
  );
}

export type WelfareForm = {
  occurredAt: string;
  healthStatus: HealthStatus | '';
  sourceCode: SourceCode | '';
  sourceReference: string;
  temperatureCelsius: string;
  waterIntakeLiters: string;
  feedIntakeKg: string;
  behaviorNotes: string;
  careNotes: string;
  publicNote: string;
  customerVisible: '' | 'true' | 'false';
};
export function validateWelfare(
  mode: 'ROAD' | 'AIR',
  f: WelfareForm,
  correcting: { welfareLogId: number; customerVisible: boolean } | null,
): Result<WelfareInput> {
  const e: FieldErrors = {};
  const occurredAt = observed(e, 'occurredAt', f.occurredAt);
  const sourceReference = source(e, mode, f.sourceCode, f.sourceReference);
  if (!f.healthStatus) e.healthStatus = 'Choose the observed health status.';
  const reading = (name: 'temperatureCelsius' | 'waterIntakeLiters' | 'feedIntakeKg') => {
    const t = f[name].trim();
    if (t && !measure.test(t)) e[name] = 'Use a number with up to 6 digits and 2 decimals.';
    return t || null;
  };
  if (!f.customerVisible) e.customerVisible = 'Choose whether the customer can see this entry.';
  // A visible entry cannot be corrected by a hidden one.
  else if (correcting?.customerVisible && f.customerVisible === 'false')
    e.customerVisible = 'A correction of a customer-visible entry must stay visible.';
  return done(
    {
      occurredAt,
      healthStatus: f.healthStatus as HealthStatus,
      sourceCode: f.sourceCode as SourceCode,
      sourceReference,
      temperatureCelsius: reading('temperatureCelsius'),
      waterIntakeLiters: reading('waterIntakeLiters'),
      feedIntakeKg: reading('feedIntakeKg'),
      behaviorNotes: opt(e, 'behaviorNotes', f.behaviorNotes, 2000),
      careNotes: opt(e, 'careNotes', f.careNotes, 2000),
      publicNote: opt(e, 'publicNote', f.publicNote, 2000),
      customerVisible: f.customerVisible === 'true',
      supersedesLogId: correcting?.welfareLogId ?? null,
    },
    e,
  );
}
