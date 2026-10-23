import type { ReactNode } from 'react';
export function statusTone(status: string) {
  const s = status.trim().toUpperCase().replaceAll(' ', '_');
  if (['IN_TRANSIT'].includes(s)) return 'transit';
  if (
    [
      'REJECTED',
      'BLOCKED',
      'FAILED',
      'CANCELLED',
      'CANCELED',
      'EXPIRED',
      'OVERDUE',
      'UNSUITABLE',
      'INVALID',
    ].includes(s)
  )
    return 'danger';
  if (
    [
      'QUOTED',
      'ACTION_REQUIRED',
      'CHANGES_REQUESTED',
      'HELD',
      'REVIEW_REQUIRED',
      'PARTIAL',
      'PARTIALLY_PAID',
      'PENDING_REVIEW',
      'WARNING',
    ].includes(s)
  )
    return 'warning';
  if (
    [
      'SUBMITTED',
      'ASSESSING',
      'APPROVED',
      'APPROVED_FOR_PREPARATION',
      'IN_PREPARATION',
      'PROPOSED',
      'PLANNED',
      'ISSUED',
    ].includes(s)
  )
    return 'info';
  if (
    [
      'ACCEPTED',
      'CONFIRMED',
      'CLEARED',
      'PASS',
      'DELIVERED',
      'COMPLETED',
      'CLOSED',
      'ACTIVE',
      'PAID',
      'RECONCILED',
      'AVAILABLE',
      'SUITABLE',
      'VALID',
      'VERIFIED',
      'RESOLVED',
    ].includes(s)
  )
    return 'success';
  return 'neutral';
}
export function StatusBadge({
  status,
  children,
  className = '',
}: {
  status: string | null | undefined;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`status-badge status-${statusTone(status ?? '')} ${className}`}
      data-status={status ?? 'UNKNOWN'}
    >
      <span className="status-dot" aria-hidden="true" />
      {children ?? status ?? 'Not recorded'}
    </span>
  );
}
