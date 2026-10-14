export type FieldErrors = Record<string, string>;
export const optional = (value: string) => value.trim() || null;
export function passwordErrors(password: string, confirmation: string): FieldErrors {
  const errors: FieldErrors = {};
  if (
    password.length < 12 ||
    password.length > 72 ||
    new TextEncoder().encode(password).length > 72
  )
    errors.password = 'Use 12–72 characters and at most 72 UTF-8 bytes.';
  if (confirmation !== password) errors.confirmPassword = 'Passwords must match.';
  return errors;
}
export function validOffsetDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
export function validZone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
export function safeReturnTo(value: string | null) {
  return value?.startsWith('/customer/') && !value.includes('\\') && !value.includes('//')
    ? value
    : '/customer/horses';
}
export function displayDate(value: string | null, timezone = 'UTC') {
  if (!value) return 'Not recorded';
  try {
    return (
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value)) + ` (${timezone})`
    );
  } catch {
    return 'Not recorded';
  }
}
