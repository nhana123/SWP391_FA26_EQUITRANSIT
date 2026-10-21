const stages = ['Request', 'Quote', 'Prep', 'Transit', 'Delivered'];
/** Broad workflow stage only; approval is never treated as payment or clearance. */
export function lifecycleStage(status: string): number {
  if (['DELIVERED', 'COMPLETED', 'CLOSED'].includes(status)) return 4;
  if (status === 'IN_TRANSIT') return 3;
  if (['CONFIRMED', 'IN_PREPARATION'].includes(status)) return 2;
  if (['QUOTED', 'ACCEPTED'].includes(status)) return 1;
  return 0;
}
export function OrderLifecycle({ status, compact = false }: { status: string; compact?: boolean }) {
  const stage = lifecycleStage(status);
  const interrupted = ['REJECTED', 'CANCELLED', 'CANCELED'].includes(status);
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
            className={!interrupted && i < stage ? 'done' : i === stage ? 'current' : ''}
            aria-current={!interrupted && i === stage ? 'step' : undefined}
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
