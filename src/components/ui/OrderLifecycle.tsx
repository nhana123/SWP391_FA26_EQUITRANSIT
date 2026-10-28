/** The standard request lifecycle, DRAFT → CLOSED, one stage per status. */
export const lifecycleStages = [
  'Draft',
  'Submitted',
  'Approved',
  'In preparation',
  'Confirmed',
  'In transit',
  'Delivered',
  'Closed',
] as const;

/** Manager starts working strictly from Submitted (Draft is purely private to customer). */
export const managerLifecycleStages = [
  'Submitted',
  'Approved',
  'In preparation',
  'Confirmed',
  'In transit',
  'Delivered',
  'Closed',
] as const;

const stageOf: Record<string, number> = {
  DRAFT: 0,
  // Sent back to the customer: the request is being edited again.
  CHANGES_REQUESTED: 0,
  SUBMITTED: 1,
  APPROVED: 2,
  IN_PREPARATION: 3,
  CONFIRMED: 4,
  IN_TRANSIT: 5,
  DELIVERED: 6,
  // Legacy delivered-and-settled state.
  COMPLETED: 6,
  CLOSED: 7,
};

const managerStageOf: Record<string, number> = {
  DRAFT: 0,
  CHANGES_REQUESTED: 0,
  SUBMITTED: 0,
  APPROVED: 1,
  IN_PREPARATION: 2,
  CONFIRMED: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  COMPLETED: 5,
  CLOSED: 6,
};

/** Stage of a status; approval is never treated as payment or clearance. */
export function lifecycleStage(status: string, forRole?: 'MANAGER' | 'CUSTOMER'): number {
  if (forRole === 'MANAGER') return managerStageOf[status] ?? 0;
  return stageOf[status] ?? 0;
}

export function OrderLifecycle({
  status,
  compact = false,
  forRole,
  hideDraft = false,
}: {
  status: string;
  compact?: boolean;
  forRole?: 'MANAGER' | 'CUSTOMER';
  hideDraft?: boolean;
}) {
  const isManager = forRole === 'MANAGER' || hideDraft;
  const stages = isManager ? managerLifecycleStages : lifecycleStages;
  const stage = lifecycleStage(status, isManager ? 'MANAGER' : 'CUSTOMER');
  const interrupted = ['REJECTED', 'CANCELLED', 'CANCELED'].includes(status);
  // A closed request has finished every stage, including the last.
  const finished = status === 'CLOSED';
  return (
    <div className={`order-lifecycle ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="lifecycle-heading">
          <strong>Journey progress</strong>
          <small>Based on the current request status</small>
        </div>
      )}
      <ol aria-label="Order lifecycle">
        {stages.map((label, i) => (
          <li
            key={label}
            className={
              !interrupted && (i < stage || finished) ? 'done' : i === stage ? 'current' : ''
            }
            aria-current={!interrupted && !finished && i === stage ? 'step' : undefined}
          >
            <span className="lifecycle-point" aria-hidden="true">
              {compact ? '' : i + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      {!compact && interrupted && (
        <small>This request is {status.toLowerCase()}; no further progress is implied.</small>
      )}
    </div>
  );
}
