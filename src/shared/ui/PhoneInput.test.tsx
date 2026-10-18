import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PhoneInput, composePhone, splitPhone } from './PhoneInput';

function Harness({ initial = '', onValue }: { initial?: string; onValue: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="p">Phone</label>
      <PhoneInput
        id="p"
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue(v);
        }}
      />
    </>
  );
}

describe('phone number with country code', () => {
  it('composes E.164 from the picker and a national number', () => {
    expect(composePhone('84', '090 123 4567')).toBe('+84901234567');
    expect(composePhone('65', '9123-4567')).toBe('+6591234567');
    // A pasted international number wins over the picker.
    expect(composePhone('84', '+44 20 7946 0958')).toBe('+442079460958');
    expect(composePhone('84', '   ')).toBe('');
    // Not a number: returned as typed so validation can flag it.
    expect(composePhone('84', '09x1')).toBe('09x1');
  });

  it('splits a stored number by the longest calling code', () => {
    expect(splitPhone('+84901234567')).toEqual({ iso: 'VN', national: '901234567' });
    expect(splitPhone('+85291234567')).toEqual({ iso: 'HK', national: '91234567' });
    expect(splitPhone('+6591234567')).toEqual({ iso: 'SG', national: '91234567' });
    expect(splitPhone(null)).toEqual({ iso: 'VN', national: '' });
  });

  it('defaults to +84, lets the user pick another country and reports E.164', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const user = userEvent.setup({ delay: null });
    expect(screen.getByLabelText('Country code')).toHaveValue('VN');
    await user.type(screen.getByLabelText('Phone'), '0901234567');
    expect(onValue).toHaveBeenLastCalledWith('+84901234567');
    await user.selectOptions(screen.getByLabelText('Country code'), 'SG');
    expect(onValue).toHaveBeenLastCalledWith('+65901234567');
  });

  it('shows a stored number in its country', () => {
    render(<Harness initial="+6591234567" onValue={vi.fn()} />);
    expect(screen.getByLabelText('Country code')).toHaveValue('SG');
    expect(screen.getByLabelText('Phone')).toHaveValue('91234567');
  });
});
