// DECIMAL(18,2), exact cents. Never use floating-point financial arithmetic.
export function cents(value: string) {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
}
export const positiveMoney = (value: string) => {
  const amount = cents(value);
  return amount !== null && amount > 0n;
};
export function moneyText(value: bigint) {
  const digits = value.toString().padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
export function outstanding(due: string, paid: string) {
  const dueCents = cents(due),
    paidCents = cents(paid);
  if (dueCents === null || paidCents === null) return null;
  const left = dueCents - paidCents;
  return left > 0n ? left : 0n;
}
