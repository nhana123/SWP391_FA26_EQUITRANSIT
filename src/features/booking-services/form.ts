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
  // Mirrors BE ServicePreferencePolicy.insurance and the declaredValue bounds.
  if (p.insurance === 'EXISTING') {
    const ref = p.existingPolicyReference?.trim() ?? '';
    if (!ref) errors.existingPolicyReference = 'Enter your existing policy reference.';
    else if (ref.length > 100) errors.existingPolicyReference = 'Use at most 100 characters.';
  }
  if (p.declaredValue !== null) {
    if (p.insurance === null || p.insurance === 'NONE')
      errors.declaredValue = 'Declare a value only when insurance is requested.';
    else if (!validDeclaredValue(p.declaredValue))
      errors.declaredValue =
        'Use a positive amount with up to 16 digits and 2 decimals, e.g. 50000.00.';
  }
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

/**
 * Declared value stays text end to end: digits with at most 2 decimals and
 * 16 integer digits, greater than zero. No exponent, sign or float parsing.
 */
export function validDeclaredValue(value: string) {
  return /^\d{1,16}(\.\d{1,2})?$/.test(value) && /[1-9]/.test(value);
}

/** Choosing a coverage clears inputs that BE rejects for it. */
export function insurancePatch(value: NonNullable<Preferences['insurance']>): Partial<Preferences> {
  if (value === 'NONE')
    return { insurance: value, existingPolicyReference: null, declaredValue: null };
  if (value !== 'EXISTING') return { insurance: value, existingPolicyReference: null };
  return { insurance: value };
}

/** Blank text inputs become null, never an empty string. */
export const textOrNull = (value: string) => (value.trim() === '' ? null : value);
