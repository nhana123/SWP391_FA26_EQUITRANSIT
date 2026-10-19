import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { DateTimeInput, composeDateTime, deviceOffset, splitDateTime } from './DateTimeInput';
import { validOffsetDate } from '../lib/validation';

function Harness({ initial = '', onValue }: { initial?: string; onValue: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="d">Departs</label>
      <DateTimeInput
        id="d"
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue(v);
        }}
      />
      <button type="button" onClick={() => setValue('')}>
        Reset
      </button>
    </>
  );
}

describe('date-time picker producing ISO with offset', () => {
  it('splits and composes the BE format', () => {
    expect(splitDateTime('2027-02-01T08:00:00+07:00')).toEqual({
      local: '2027-02-01T08:00',
      offset: '+07:00',
    });
    expect(splitDateTime('2027-02-01T08:00:00.123Z')).toEqual({
      local: '2027-02-01T08:00',
      offset: 'Z',
    });
    expect(splitDateTime('2027-02-01T08:00:00+00:00').offset).toBe('Z');
    expect(splitDateTime('not a date', '+07:00')).toEqual({ local: '', offset: '+07:00' });
    expect(composeDateTime('2027-02-01T08:00', '+07:00')).toBe('2027-02-01T08:00:00+07:00');
    expect(composeDateTime('', '+07:00')).toBe('');
    expect(validOffsetDate(composeDateTime('2027-02-01T08:00', 'Z'))).toBe(true);
  });

  it('formats the device offset', () => {
    const at = (minutes: number) => ({ getTimezoneOffset: () => minutes }) as Date;
    expect(deviceOffset(at(-420))).toBe('+07:00');
    expect(deviceOffset(at(-330))).toBe('+05:30');
    expect(deviceOffset(at(300))).toBe('-05:00');
    expect(deviceOffset(at(0))).toBe('Z');
  });

  it('defaults to the device zone and reports the ISO value when picked', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    expect(screen.getByLabelText('Time zone')).toHaveValue(deviceOffset());
    fireEvent.change(screen.getByLabelText('Departs'), { target: { value: '2027-02-01T08:00' } });
    expect(onValue).toHaveBeenLastCalledWith(`2027-02-01T08:00:00${deviceOffset()}`);
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: '+09:00' } });
    expect(onValue).toHaveBeenLastCalledWith('2027-02-01T08:00:00+09:00');
    fireEvent.change(screen.getByLabelText('Departs'), { target: { value: '' } });
    expect(onValue).toHaveBeenLastCalledWith('');
  });

  it('shows a saved value in its own zone and follows an outside reset', () => {
    render(<Harness initial="2027-02-01T20:00:00-03:30" onValue={vi.fn()} />);
    expect(screen.getByLabelText('Departs')).toHaveValue('2027-02-01T20:00');
    // An uncommon saved zone is still offered so it is not silently changed.
    expect(screen.getByLabelText('Time zone')).toHaveValue('-03:30');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Departs')).toHaveValue('');
  });
});
