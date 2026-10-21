import { StatCard } from './Primitives';
/** Aggregate only the server's portfolio counts, never the paginated rows. */
export function PortfolioMetrics({ counts }: { counts: { status: string; count: number }[] }) {
  const sum = (statuses?: string[]) =>
    counts.reduce(
      (total, item) => total + (!statuses || statuses.includes(item.status) ? item.count : 0),
      0,
    );
  return (
    <dl className="activity-metrics">
      <StatCard label="Total requests" value={sum()} icon="orders" tone="gold" />
      <StatCard
        label="Preparation & confirmed"
        value={sum(['APPROVED', 'IN_PREPARATION', 'CONFIRMED'])}
        icon="check"
      />
      <StatCard label="In transit" value={sum(['IN_TRANSIT'])} icon="truck" tone="indigo" />
      <StatCard
        label="Delivered & completed"
        value={sum(['DELIVERED', 'COMPLETED', 'CLOSED'])}
        icon="horse"
      />
    </dl>
  );
}
