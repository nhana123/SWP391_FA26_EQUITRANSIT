import { useState } from 'react';
import './date-time-input.css';

/**
 * Date-time picker that still produces the ISO-with-offset strings the BE
 * contracts expect (e.g. 2027-02-01T08:00:00+07:00). The calendar/clock comes
 * from the browser; the offset defaults to this device's time zone.
 */
const ISO = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** This device's current UTC offset, e.g. "+07:00" (or "Z" for UTC). */
export function deviceOffset(date = new Date()) {
  const minutes = -date.getTimezoneOffset();
  if (minutes === 0) return 'Z';
  const sign = minutes > 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const common = [
  '-10:00',
  '-08:00',
  '-07:00',
  '-06:00',
  '-05:00',
  '-04:00',
  '-03:00',
  'Z',
  '+01:00',
  '+02:00',
  '+03:00',
  '+04:00',
  '+05:00',
  '+05:30',
  '+06:00',
  '+07:00',
  '+08:00',
  '+09:00',
  '+10:00',
  '+11:00',
  '+12:00',
];
const offsetLabel = (o: string) => (o === 'Z' ? 'UTC' : `UTC${o}`);
const toMinutes = (o: string) =>
  o === 'Z' ? 0 : (o[0] === '-' ? -1 : 1) * (Number(o.slice(1, 3)) * 60 + Number(o.slice(4, 6)));

export function splitDateTime(value: string | null | undefined, fallbackOffset = deviceOffset()) {
  const match = ISO.exec((value ?? '').trim());
  if (!match) return { local: '', offset: fallbackOffset };
  return { local: match[1], offset: match[2] === '+00:00' ? 'Z' : match[2] };
}
export function composeDateTime(local: string, offset: string) {
  return local ? `${local}:00${offset}` : '';
}

export function DateTimeInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}) {
  const [parts, setParts] = useState(() => splitDateTime(value));
  const [seen, setSeen] = useState(value);
  // Follow values set from outside (reset, reload) without an effect.
  if (value !== seen) {
    setSeen(value);
    const next = splitDateTime(value, parts.offset);
    if (composeDateTime(next.local, next.offset) !== composeDateTime(parts.local, parts.offset))
      setParts(next);
  }
  const offsets = common.includes(parts.offset)
    ? common
    : [...common, parts.offset].sort((a, b) => toMinutes(a) - toMinutes(b));
  const update = (next: { local: string; offset: string }) => {
    setParts(next);
    const composed = composeDateTime(next.local, next.offset);
    setSeen(composed);
    onChange(composed);
  };
  return (
    <span className="date-time-input">
      <input
        id={id}
        type="datetime-local"
        value={parts.local}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => update({ ...parts, local: e.target.value })}
      />
      <select
        aria-label="Time zone"
        value={parts.offset}
        disabled={disabled}
        onChange={(e) => update({ ...parts, offset: e.target.value })}
      >
        {offsets.map((o) => (
          <option key={o} value={o}>
            {offsetLabel(o)}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Date only (YYYY-MM-DD) with the browser's calendar. */
export function DateInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  disabled,
  max,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  max?: string;
}) {
  return (
    <input
      id={id}
      type="date"
      value={value}
      max={max}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
