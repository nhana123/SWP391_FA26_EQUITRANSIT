import type { Horse, HorseInput } from '../../shared/api/contracts';
import { optional, validOffsetDate, type FieldErrors } from '../../shared/lib/validation';
import { apiPatterns } from '../../shared/api/patterns';
export const horseFields = [
  { key: 'name', label: 'Horse name', max: 150 },
  { key: 'dateOfBirth', label: 'Date of birth', type: 'date' },
  { key: 'breed', label: 'Breed', max: 100 },
  {
    key: 'microchipId',
    label: 'Microchip ID',
    max: 15,
    hint: '9–15 uppercase letters, digits or hyphens. Blank means unknown.',
  },
  {
    key: 'passportNumber',
    label: 'Passport number',
    max: 20,
    hint: '5–20 uppercase letters, digits or hyphens.',
  },
  { key: 'weightKg', label: 'Weight (kg)', number: 6 },
  { key: 'heightCm', label: 'Height (cm)', number: 4 },
  { key: 'bodyWidthCm', label: 'Body width (cm)', number: 4 },
  {
    key: 'measuredAt',
    label: 'Measured at',
    type: 'datetime',
    hint: 'Leave blank if unknown.',
  },
  { key: 'handlingNotes', label: 'Temperament / handling notes', max: 1000, multiline: true },
  {
    key: 'feedWaterRequirements',
    label: 'Feed and water requirements',
    max: 1000,
    multiline: true,
  },
  { key: 'stallPreferences', label: 'Stall preferences', max: 1000, multiline: true },
  { key: 'specialCareNotes', label: 'Special care notes', max: 1000, multiline: true },
  { key: 'veterinaryInstructions', label: 'Veterinary instructions', max: 2000, multiline: true },
  {
    key: 'veterinaryInstructionSource',
    label: 'Veterinary instruction source',
    max: 1000,
    multiline: true,
  },
] as const;
export type HorseForm = Record<keyof HorseInput, string>;
export function horseForm(horse?: Horse): HorseForm {
  return Object.fromEntries([
    ...horseFields.map((f) => [f.key, horse?.[f.key] == null ? '' : String(horse[f.key])]),
    ['sexCode', horse?.sexCode || ''],
  ]) as HorseForm;
}
export function validateHorse(form: HorseForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = 'Enter a horse name.';
  for (const f of horseFields) {
    const value = form[f.key];
    if ('max' in f && value.length > f.max) errors[f.key] = `Use at most ${f.max} characters.`;
    if (
      'number' in f &&
      value &&
      (!new RegExp(`^\\d{1,${f.number}}(?:\\.\\d{1,2})?$`).test(value) || Number(value) <= 0)
    )
      errors[f.key] = 'Enter a positive value with at most two decimal places.';
  }
  if (optional(form.microchipId) && !apiPatterns.microchip.test(form.microchipId.trim()))
    errors.microchipId = 'Use 9–15 uppercase letters, digits or hyphens.';
  if (optional(form.passportNumber) && !apiPatterns.passport.test(form.passportNumber.trim()))
    errors.passportNumber = 'Use 5–20 uppercase letters, digits or hyphens.';
  if (form.dateOfBirth && form.dateOfBirth > new Date().toISOString().slice(0, 10))
    errors.dateOfBirth = 'Date of birth cannot be in the future.';
  if (
    form.measuredAt &&
    (!validOffsetDate(form.measuredAt) || Date.parse(form.measuredAt) > Date.now())
  )
    errors.measuredAt = 'Choose a date and time that is not in the future.';
  return errors;
}
export function horseInput(form: HorseForm): HorseInput {
  return {
    name: form.name.trim(),
    microchipId: optional(form.microchipId),
    passportNumber: optional(form.passportNumber),
    breed: optional(form.breed),
    dateOfBirth: optional(form.dateOfBirth),
    sexCode: optional(form.sexCode) as HorseInput['sexCode'],
    weightKg: form.weightKg ? Number(form.weightKg) : null,
    heightCm: form.heightCm ? Number(form.heightCm) : null,
    bodyWidthCm: form.bodyWidthCm ? Number(form.bodyWidthCm) : null,
    measuredAt: optional(form.measuredAt),
    specialCareNotes: optional(form.specialCareNotes),
    handlingNotes: optional(form.handlingNotes),
    feedWaterRequirements: optional(form.feedWaterRequirements),
    stallPreferences: optional(form.stallPreferences),
    veterinaryInstructions: optional(form.veterinaryInstructions),
    veterinaryInstructionSource: optional(form.veterinaryInstructionSource),
  };
}
