import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BookingServices } from './BookingServices';
import { bookingApi } from './api';
import type { Disclosure, StallFit } from './contracts';
import { visibleStalls } from './sections';
import { testDisclosure, testOrder } from './testing';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({ bookingApi: { get: vi.fn(), confirm: vi.fn() } }));
vi.mock('./rates-api', () => ({ ratesApi: { get: vi.fn().mockResolvedValue([]) } }));

const stall = (option: StallFit['option'], status: StallFit['status'], reasons: string[] = []) => ({
  option,
  slots: option === 'SHARED_ONE' ? 1 : option === 'WIDE' ? 1.5 : 3,
  status,
  policyId: status === 'ELIGIBLE' ? 4 : null,
  policyVersion: status === 'ELIGIBLE' ? 1 : null,
  reasons,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
async function openAirStalls(disclosure: Disclosure) {
  vi.mocked(bookingApi.get).mockResolvedValue(disclosure);
  const order = testOrder();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BookingServices order={order} preferences={null} onSaved={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Available Air Stalls for Your Horse' }),
  );
  return user;
}

describe('air stalls (FE-21)', () => {
  it('never offers unsuitable options or a one-slot stall that is not eligible', () => {
    const shown = visibleStalls([
      stall('SHARED_ONE', 'PENDING', ['FIT_POLICY_PENDING']),
      stall('WIDE', 'UNSUITABLE', ['HORSE_EXCEEDS_APPROVED_LIMITS']),
      stall('PRIVATE', 'PENDING', ['FIT_POLICY_PENDING']),
    ]);
    expect(shown.map((s) => s.option)).toEqual(['PRIVATE']);
  });

  it('labels pending options as requested, not suitable, with reasons', async () => {
    await openAirStalls(
      testDisclosure({
        airStalls: [stall('WIDE', 'PENDING', ['FIT_POLICY_PENDING']), stall('PRIVATE', 'ELIGIBLE')],
      }),
    );
    expect(screen.getByText(/Requested — pending assessment/)).toBeInTheDocument();
    expect(screen.getByText(/No approved carrier policy/)).toBeInTheDocument();
    expect(screen.getByText(/Fits the approved limits/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('not confirmed');
  });

  it('does not auto-select or upgrade when the saved option is no longer offered', async () => {
    const user = await openAirStalls(
      testDisclosure({
        selected: { airStall: 'SHARED_ONE' },
        airStalls: [stall('WIDE', 'PENDING', ['FIT_POLICY_PENDING'])],
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Shared stall (1 slot)');
    expect(screen.getByLabelText(/Wide stall/)).not.toBeChecked();
    await user.click(screen.getByLabelText(/Wide stall/));
    expect(screen.getByLabelText(/Wide stall/)).toBeChecked();
    expect(bookingApi.confirm).not.toHaveBeenCalled();
  });

  it('sends the customer to record measurements instead of treating them as zero', async () => {
    await openAirStalls(
      testDisclosure({
        airStalls: [stall('PRIVATE', 'PENDING', ['HORSE_MEASUREMENTS_REQUIRED'])],
      }),
    );
    expect(screen.getByRole('link', { name: /Record your horse/ })).toHaveAttribute(
      'href',
      '/customer/horses/5/edit',
    );
  });
});
