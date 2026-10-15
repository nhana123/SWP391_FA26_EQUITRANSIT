import { apiPatterns } from '../../shared/api/patterns';
import type { FieldErrors } from '../../shared/lib/validation';
import type { Disclosure, Preferences } from './contracts';

export type Arrangement = 'EQUITRANSIT' | 'CUSTOMER';

/** Provider fields only exist for a customer-arranged service. */
export function arrangementPatch(
  kind: 'road' | 'veterinary',
  value: Arrangement,
): Partial<Preferences> {
  const name = kind === 'road' ? 'roadProviderName' : 'veterinaryProviderName';
  const contact = kind === 'road' ? 'roadProviderContact' : 'veterinaryProviderContact';
  const field = kind === 'road' ? 'roadArrangement' : 'veterinaryArrangement';
  return value === 'CUSTOMER'
    ? { [field]: value }
    : { [field]: value, [name]: null, [contact]: null };
}

function providerErrors(
  errors: FieldErrors,
  name: string | null,
  contact: string | null,
  nameKey: string,
  contactKey: string,
) {
  if (name !== null && (name.trim() === '' || name.length > 200))
    errors[nameKey] = 'Use 1–200 characters, or leave it empty.';
  if (contact !== null && !apiPatterns.phone.test(contact.trim()))
    errors[contactKey] = 'Use a phone number with 8–15 digits, optionally starting with +.';
}

/** Client checks mirroring BE rules; the BE re-validates on confirm. */
export function validatePreferences(p: Preferences, disclosure?: Disclosure): FieldErrors {
  const errors: FieldErrors = {};
  if (disclosure?.quarantine.applicability === 'NOT_REQUIRED' && p.quarantinePackage !== null)
    errors.quarantinePackage = 'Quarantine is not required, so no package can be requested.';
  if (p.escortNotes !== null && p.escortNotes.length > 1000)
    errors.escortNotes = 'Use at most 1000 characters.';
  providerErrors(
    errors,
    p.roadProviderName,
    p.roadProviderContact,
    'roadProviderName',
    'roadProviderContact',
  );
  providerErrors(
    errors,
    p.veterinaryProviderName,
    p.veterinaryProviderContact,
    'veterinaryProviderName',
    'veterinaryProviderContact',
  );
  return errors;
}

/** Blank text inputs become null, never an empty string. */
export const textOrNull = (value: string) => (value.trim() === '' ? null : value);
