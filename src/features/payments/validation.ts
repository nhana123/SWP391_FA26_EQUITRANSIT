import { idSchema } from '../../shared/api/contracts';
import type { FieldErrors } from '../../shared/lib/validation';
import { proofKeySchema, timestampSchema, type Values } from './contracts';
import { positiveMoney } from './money';
export const moneyField = { name: 'amount', label: 'Amount (USD)', money: true, maxLength: 19 };
export const reasonField = { name: 'reason', label: 'Reason', multiline: true, maxLength: 2000 };
export function requireText(errors: FieldErrors, values: Values, key: string, max: number) {
  if (!values[key]?.trim() || values[key].length > max)
    errors[key] = `Enter a value of 1–${max} characters.`;
}
export function requireId(errors: FieldErrors, values: Values, key: string) {
  if (!/^\d+$/.test(values[key] ?? '') || !idSchema.safeParse(Number(values[key])).success)
    errors[key] = 'Choose a valid record.';
}
export function requireMoney(errors: FieldErrors, values: Values, key: string) {
  if (!positiveMoney(values[key] ?? ''))
    errors[key] = 'Use a positive USD amount with up to 16 integer digits and 2 decimals.';
}
export function requireProof(errors: FieldErrors, values: Values) {
  if (!proofKeySchema.safeParse(values.proofFileKey).success)
    errors.proofFileKey = 'Upload or select evidence for this order.';
}
export function requirePast(errors: FieldErrors, values: Values, key: string, now = Date.now()) {
  if (
    !timestampSchema.safeParse(values[key]).success ||
    !Number.isFinite(Date.parse(values[key])) ||
    Date.parse(values[key]) > now
  )
    errors[key] = 'Use a transfer time with an offset, no later than now.';
}
