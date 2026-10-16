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
async function openInsurance() {
  vi.mocked(bookingApi.get).mockResolvedValue(testDisclosure());
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
    expect(radios).toHaveLength(4);
    radios.forEach((r) => expect(r).not.toBeChecked());
  });

  it('requires a reference for an existing policy and explains verification', async () => {
    const user = await openInsurance();
    await user.click(screen.getByLabelText(/already have a policy/));
    expect(screen.getByText(/must be verified/)).toBeInTheDocument();
    expect(screen.getByText('Enter your existing policy reference.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Existing policy reference'), 'POL-1');
    expect(screen.queryByText('Enter your existing policy reference.')).toBeNull();
  });

  it('keeps declared value as exact text and rejects exponents or negatives', async () => {
    const user = await openInsurance();
    await user.click(screen.getByLabelText(/new mortality cover/));
    expect(screen.getByText(/not active, accepted or paid/)).toBeInTheDocument();
    const value = screen.getByLabelText(/Declared value/);
    await user.type(value, '1e5');
    expect(screen.getByText(/positive amount/)).toBeInTheDocument();
    await user.clear(value);
    await user.type(value, '50000.10');
    expect(value).toHaveValue('50000.10');
    expect(screen.queryByText(/positive amount/)).toBeNull();
  });

  it('switching to no insurance clears reference and declared value', async () => {
    const user = await openInsurance();
    await user.click(screen.getByLabelText(/already have a policy/));
    await user.type(screen.getByLabelText('Existing policy reference'), 'POL-1');
    await user.type(screen.getByLabelText(/Declared value/), '100');
    await user.click(screen.getByLabelText(/No insurance/));
    expect(screen.queryByLabelText(/Declared value/)).toBeNull();
    await user.click(screen.getByLabelText(/already have a policy/));
    expect(screen.getByLabelText('Existing policy reference')).toHaveValue('');
    expect(screen.getByLabelText(/Declared value/)).toHaveValue('');
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
