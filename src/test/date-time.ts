import { fireEvent } from '@testing-library/react';
import { splitDateTime } from '../shared/ui/DateTimeInput';

/**
 * Sets a DateTimeInput (picker + time zone) to an ISO-with-offset value, as a
 * user would by picking the date/time and the zone. Seconds are not pickable.
 */
/** Sets a date-only picker (YYYY-MM-DD). */
export function setDate(input: HTMLElement, date: string) {
  fireEvent.change(input, { target: { value: date } });
}

export function setDateTime(input: HTMLElement, iso: string) {
  const { local, offset } = splitDateTime(iso);
  fireEvent.change(input, { target: { value: local } });
  const zone = input.parentElement?.querySelector('select');
  if (zone) fireEvent.change(zone, { target: { value: offset } });
}
