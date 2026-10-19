import type { LegMode } from './contracts';
import { canonicalTime, operationalDate, operationalTimezoneBadge } from './operational-time';

export type TimelineLeg = {
  sequenceNo: number;
  transportMode: LegMode;
  plannedDeparture: string;
  plannedArrival: string;
};
export type TimelineQuarantine = { startsAt: string; endsAt: string };

const instant = (value: string) => {
  const canonical = canonicalTime(value);
  return canonical ? Date.parse(canonical) : null;
};

/** One real-time axis; the rail scrolls rather than distorting long layovers. */
export function TimelineStrip({
  legs,
  quarantine = [],
}: {
  legs: TimelineLeg[];
  quarantine?: TimelineQuarantine[];
}) {
  const legsWithTime = legs
    .map((leg) => ({
      ...leg,
      start: instant(leg.plannedDeparture),
      end: instant(leg.plannedArrival),
    }))
    .filter(
      (leg): leg is typeof leg & { start: number; end: number } =>
        leg.start !== null && leg.end !== null && leg.end > leg.start,
    );
  const quarantineWithTime = quarantine
    .map((item) => ({ ...item, start: instant(item.startsAt), end: instant(item.endsAt) }))
    .filter(
      (item): item is typeof item & { start: number; end: number } =>
        item.start !== null && item.end !== null && item.end > item.start,
    );
  const all = [...legsWithTime, ...quarantineWithTime];
  const start = Math.min(...all.map((item) => item.start));
  const end = Math.max(...all.map((item) => item.end));
  const hours = (end - start) / 3_600_000;
  const width = Math.max(720, Math.ceil(hours * 32));
  const position = (at: number) => `${((at - start) / (end - start)) * 100}%`;
  const length = (from: number, to: number) => `${((to - from) / (end - start)) * 100}%`;
  const tickHours = hours <= 24 ? 2 : hours <= 96 ? 6 : 24;
  const ticks: number[] = [];
  if (all.length) {
    const interval = tickHours * 3_600_000;
    for (let tick = Math.ceil(start / interval) * interval; tick < end; tick += interval)
      ticks.push(tick);
  }
  return (
    <section className="card plan-timeline" aria-label="Unified timezone timeline">
      <div className="plan-timeline-heading">
        <div>
          <h2>Trục thời gian vận hành</h2>
          <p className="muted">
            Các khối đặt đúng theo giờ thực tế; cuộn ngang để xem toàn bộ hành trình.
          </p>
        </div>
        <span className="plan-zone-badge">{operationalTimezoneBadge}</span>
      </div>
      {!all.length ? (
        <p>Thêm chặng và giờ để xem lịch trình.</p>
      ) : (
        <div className="plan-timeline-scroll">
          <div className="plan-timeline-rail" style={{ width }}>
            {ticks.map((tick) => (
              <div key={tick} className="plan-timeline-tick" style={{ left: position(tick) }}>
                <span>{operationalDate(new Date(tick).toISOString()).slice(5, 16)}</span>
              </div>
            ))}
            {legsWithTime.map((leg, index) => {
              const previous = legsWithTime[index - 1];
              return (
                <div key={`leg-${leg.sequenceNo}`}>
                  {previous && leg.start > previous.end && (
                    <div
                      className="plan-timeline-block waiting"
                      style={{
                        left: position(previous.end),
                        width: length(previous.end, leg.start),
                      }}
                      title={`Chờ chuyển tiếp: ${Math.round((leg.start - previous.end) / 60_000)} phút`}
                    >
                      ⏳ Chờ chuyển tiếp
                    </div>
                  )}
                  <div
                    className={`plan-timeline-block ${leg.transportMode.toLowerCase()}`}
                    style={{ left: position(leg.start), width: length(leg.start, leg.end) }}
                    title={`${leg.transportMode} ${operationalDate(leg.plannedDeparture)} → ${operationalDate(leg.plannedArrival)}`}
                  >
                    {leg.transportMode === 'ROAD' ? '🚛' : '✈️'} {leg.sequenceNo}.{' '}
                    {leg.transportMode}
                  </div>
                </div>
              );
            })}
            {quarantineWithTime.map((item, index) => (
              <div
                key={`quarantine-${index}`}
                className="plan-timeline-block quarantine"
                style={{ left: position(item.start), width: length(item.start, item.end) }}
                title={`Quarantine ${operationalDate(item.startsAt)} → ${operationalDate(item.endsAt)}`}
              >
                🏥 Quarantine
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
