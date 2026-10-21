import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BookingServices } from './BookingServices';
import { bookingApi } from './api';
import { toPreferences } from './contracts';
import { insurancePatch, validatePreferences, validDeclaredValue } from './form';
import { testDisclosure, testOrder } from './testing';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  bookingApi: { get: vi.fn(), confirm: vi.fn(), preview: vi.fn(() => new Promise(() => {})) },
}));
vi.mock('./rates-api', () => ({ ratesApi: { get: vi.fn().mockResolvedValue([]) } }));

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
async function openInsurance(disclosure = testDisclosure()) {
  vi.mocked(bookingApi.get).mockResolvedValue(disclosure);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BookingServices order={testOrder()} preferences={null} onSaved={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Insurance' }));
  return user;
}

describe('insurance (FE-23)', () => {
  it('offers one exclusive choice and nothing is selected by default', async () => {
    await openInsurance();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    radios.forEach((r) => expect(r).not.toBeChecked());
  });

  it('removes existing-policy entry from new choices and keeps historical policies readable', async () => {
    await openInsurance(
      testDisclosure({ selected: { insurance: 'EXISTING', existingPolicyReference: 'POL-1' } }),
    );
    expect(screen.queryByLabelText(/already have a policy/)).toBeNull();
    expect(screen.getByText('POL-1')).toBeInTheDocument();
    expect(screen.getByText('Previously recorded policy')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps recorded declared value as exact text without requiring data entry', async () => {
    const user = await openInsurance(
      testDisclosure({ selected: { insurance: 'MORTALITY', declaredValue: '50000.10' } }),
    );
    await user.click(screen.getByLabelText(/new mortality cover/));
    expect(screen.getByText(/not active, accepted or paid/)).toBeInTheDocument();
    expect(screen.getByText('50000.10 USD')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('switching to no insurance clears reference and declared value', async () => {
    const user = await openInsurance(
      testDisclosure({
        selected: { insurance: 'EXISTING', existingPolicyReference: 'POL-1', declaredValue: '100' },
      }),
    );
    await user.click(screen.getByLabelText(/No insurance/));
    expect(screen.queryByText('POL-1')).toBeNull();
    expect(screen.queryByText('100 USD')).toBeNull();
    await user.click(screen.getByLabelText(/new mortality cover/));
    expect(screen.queryByText('Recorded horse value')).toBeNull();
  });
});

describe('insurance rules', () => {
  it('validates decimal bounds without floating point', () => {
    expect(validDeclaredValue('0.00')).toBe(false);
    expect(validDeclaredValue('1234567890123456.99')).toBe(true);
    expect(validDeclaredValue('12345678901234567')).toBe(false);
    expect(validDeclaredValue('1.234')).toBe(false);
  });

  it('mirrors BE: reference only with EXISTING, no value without cover', () => {
    const prefs = {
      ...toPreferences(null),
      ...insurancePatch('MORTALITY'),
      existingPolicyReference: 'X',
    };
    expect(validatePreferences(prefs)).toEqual({});
    expect(insurancePatch('MORTALITY').existingPolicyReference).toBeNull();
    const none = { ...toPreferences(null), insurance: 'NONE' as const, declaredValue: '10' };
    expect(validatePreferences(none).declaredValue).toMatch(/only when insurance/);
  });
});
