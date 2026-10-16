import { useEffect, useState } from 'react';
import type { QuoteSummary, QuotationStatus } from './contracts';

export const quotationStatusLabels: Record<QuotationStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  ISSUED: 'Issued',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  SUPERSEDED: 'Superseded',
};
export function quotationStatus(quote: QuoteSummary, now: number) {
  return quote.status === 'ISSUED' && Date.parse(quote.validUntil) <= now
    ? 'Issued — expired'
    : quotationStatusLabels[quote.status];
}
export function useQuotationClock(quotes: readonly QuoteSummary[]) {
  const [now, setNow] = useState(Date.now);
  const next = Math.min(
    ...quotes
      .filter((q) => q.status === 'ISSUED')
      .map((q) => Date.parse(q.validUntil))
      .filter((deadline) => deadline > now),
  );
  useEffect(() => {
    const update = () => setNow(Date.now());
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    const timer = Number.isFinite(next)
      ? setTimeout(update, Math.min(Math.max(0, next - Date.now() + 1), 2_147_483_647))
      : undefined;
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [next]);
  return now;
}
