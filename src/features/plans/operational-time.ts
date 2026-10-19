/** Every operational schedule input is interpreted and displayed in GMT+07:00. */
export const OPERATIONAL_ZONE = 'Asia/Ho_Chi_Minh';
export const OPERATIONAL_OFFSET = '+07:00';

const localPattern = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/;
const offsetPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: OPERATIONAL_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function localAt(instant: number) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/** A datetime-local value means HCM wall time; offset input means an instant. */
export function canonicalTime(value: string): string | null {
  const trimmed = value.trim();
  const local = trimmed.match(localPattern);
  if (local) {
    const wall = `${local[1]}T${local[2]}:${local[3] ?? '00'}`;
    const instant = Date.parse(`${wall}${OPERATIONAL_OFFSET}`);
    return Number.isFinite(instant) && localAt(instant) === wall
      ? `${wall}${OPERATIONAL_OFFSET}`
      : null;
  }
  if (!offsetPattern.test(trimmed)) return null;
  const instant = Date.parse(trimmed);
  return Number.isFinite(instant) ? `${localAt(instant)}${OPERATIONAL_OFFSET}` : null;
}

export function localTimeInput(value: string | null): string {
  const canonical = value && canonicalTime(value);
  return canonical ? canonical.slice(0, 19) : '';
}

export function operationalDate(value: string | null): string {
  const canonical = value && canonicalTime(value);
  return canonical ? `${canonical.slice(0, 16).replace('T', ' ')} GMT+07:00` : 'Chưa có giờ';
}

export function gapMinutes(previousArrival: string, nextDeparture: string): number | null {
  const previous = canonicalTime(previousArrival);
  const next = canonicalTime(nextDeparture);
  return previous && next ? Math.round((Date.parse(next) - Date.parse(previous)) / 60_000) : null;
}

export function shiftOperationalTime(value: string, minutes: number): string {
  const canonical = canonicalTime(value);
  return canonical
    ? localTimeInput(new Date(Date.parse(canonical) + minutes * 60_000).toISOString())
    : value;
}

export const operationalTimezoneBadge =
  '🌐 Múi giờ điều hành chuẩn: GMT+07:00 (Mọi mốc giờ hiển thị theo chuẩn này)';
