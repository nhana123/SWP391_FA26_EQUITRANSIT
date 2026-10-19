import type { OrderDraft, ServicePreferences } from '../../shared/api/contracts';
import { apiPatterns } from '../../shared/api/patterns';
import {
  optional,
  validOffsetDate,
  validZone,
  type FieldErrors,
} from '../../shared/lib/validation';
export const journeyFields = [
  {
    key: 'originCountryCode',
    label: 'Pickup country (ISO code)',
    max: 2,
    hint: 'Example: VN or GB; use GB rather than UK.',
  },
  { key: 'destinationCountryCode', label: 'Destination country (ISO code)', max: 2 },
  { key: 'originAddress', label: 'Pickup address', max: 500 },
  { key: 'destinationAddress', label: 'Destination address', max: 500 },
  {
    key: 'originTimezone',
    label: 'Origin timezone',
    max: 100,
    hint: 'IANA zone, e.g. Asia/Ho_Chi_Minh.',
  },
  {
    key: 'destinationTimezone',
    label: 'Destination timezone',
    max: 100,
    hint: 'IANA zone, e.g. Europe/London.',
  },
  { key: 'preferredDepartureAt', label: 'Preferred departure', date: true },
  {
    key: 'deliveryDeadline',
    label: 'Latest lawful handover deadline',
    date: true,
  },
  { key: 'dateFlexibilityNotes', label: 'Date flexibility', max: 500 },
  { key: 'receiverName', label: 'Receiver name', max: 150 },
  { key: 'receiverPhone', label: 'Receiver phone', max: 30 },
  { key: 'receiverEmail', label: 'Receiver email', max: 255 },
  { key: 'receiverAuthority', label: 'Receiver authority', max: 500 },
  { key: 'eventName', label: 'Race event name (optional)', max: 200 },
  { key: 'eventVenue', label: 'Event venue', max: 300 },
  { key: 'eventStartAt', label: 'Event start', date: true },
  { key: 'eventTimezone', label: 'Event timezone', max: 100 },
  { key: 'specialNeeds', label: 'Special needs', max: 1000 },
] as const;
export type JourneyKey = (typeof journeyFields)[number]['key'];
export type DraftForm = Record<JourneyKey | 'horseId' | 'importType' | 'transitAirports', string>;
export function draftForm(draft?: OrderDraft): DraftForm {
  return Object.fromEntries([
    ...journeyFields.map((f) => [f.key, draft?.[f.key] || '']),
    ['horseId', draft?.horseId ? String(draft.horseId) : ''],
    ['importType', draft?.importType || ''],
    ['transitAirports', draft?.transitAirports?.join(', ') || ''],
  ]) as DraftForm;
}
// Services belong to the shared full replacement request. Never rebuild them from visible controls.
export function draftInput(form: DraftForm, services: ServicePreferences | null): OrderDraft {
  const values = Object.fromEntries(
    journeyFields.map((f) => [f.key, optional(form[f.key])]),
  ) as Record<JourneyKey, string | null>;
  return {
    ...values,
    originCountryCode: values.originCountryCode?.toUpperCase() || null,
    destinationCountryCode: values.destinationCountryCode?.toUpperCase() || null,
    horseId: form.horseId ? Number(form.horseId) : null,
    importType: optional(form.importType) as OrderDraft['importType'],
    transitAirports: form.transitAirports.trim()
      ? form.transitAirports.split(',').map((v) => v.trim().toUpperCase())
      : [],
    services,
  };
}
export function validateDraft(form: DraftForm, complete = false, now = Date.now()): FieldErrors {
  const errors: FieldErrors = {};
  if (form.horseId && (!Number.isSafeInteger(Number(form.horseId)) || Number(form.horseId) <= 0))
    errors.horseId = 'Select a valid owned horse.';
  for (const f of journeyFields) {
    const value = form[f.key].trim();
    if ('max' in f && value.length > f.max) errors[f.key] = `Use at most ${f.max} characters.`;
    if ('date' in f && value && !validOffsetDate(value)) errors[f.key] = 'Choose a date and time.';
    if (
      f.key.endsWith('Timezone') &&
      value &&
      (!apiPatterns.timezone.test(value) || !validZone(value))
    )
      errors[f.key] = 'Use a named Region/City timezone, e.g. Asia/Ho_Chi_Minh or Etc/UTC.';
  }
  for (const key of ['originCountryCode', 'destinationCountryCode'] as const)
    if (form[key] && !/^[A-Za-z]{2}$/.test(form[key]))
      errors[key] = 'Use a two-letter ISO country code.';
  if (form.receiverEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.receiverEmail))
    errors.receiverEmail = 'Use a valid email address.';
  if (optional(form.receiverPhone) && !apiPatterns.phone.test(form.receiverPhone.trim()))
    errors.receiverPhone =
      'Use 8–15 digits, optionally starting with +. The first digit must not be zero.';
  const airports = form.transitAirports
    ? form.transitAirports.split(',').map((v) => v.trim().toUpperCase())
    : [];
  if (
    airports.length > 10 ||
    new Set(airports).size !== airports.length ||
    airports.some((v) => !/^[A-Z]{3}$/.test(v))
  )
    errors.transitAirports = 'Use up to 10 unique three-letter airport codes, separated by commas.';
  const departure = Date.parse(form.preferredDepartureAt);
  const deadline = Date.parse(form.deliveryDeadline);
  const event = Date.parse(form.eventStartAt);
  if (Number.isFinite(departure) && Number.isFinite(deadline) && departure >= deadline)
    errors.preferredDepartureAt = 'Departure must precede the delivery deadline.';
  if (Number.isFinite(deadline) && Number.isFinite(event) && deadline > event)
    errors.deliveryDeadline = 'Delivery deadline must not follow the event start.';
  if (complete) {
    for (const key of [
      'horseId',
      'originCountryCode',
      'destinationCountryCode',
      'originAddress',
      'destinationAddress',
      'originTimezone',
      'destinationTimezone',
      'preferredDepartureAt',
      'deliveryDeadline',
      'importType',
    ] as const)
      if (!form[key].trim()) errors[key] = 'Complete this field before submitting.';
    if (
      form.originCountryCode &&
      form.originCountryCode.toUpperCase() === form.destinationCountryCode.toUpperCase()
    )
      errors.destinationCountryCode = 'Origin and destination countries must differ.';
    if (Number.isFinite(deadline) && deadline <= now)
      errors.deliveryDeadline = 'Delivery deadline must be in the future.';
    if (Number.isFinite(departure) && departure <= now)
      errors.preferredDepartureAt = 'Departure must be in the future.';
  }
  return errors;
}
