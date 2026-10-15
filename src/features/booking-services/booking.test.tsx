import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BookingServices } from './BookingServices';
import { bookingApi } from './api';
import { disclosureSchema, toPreferences, type Disclosure } from './contracts';
import { testDisclosure, testOrder } from './testing';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({ bookingApi: { get: vi.fn(), confirm: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
export function mountBooking(disclosure: Disclosure = testDisclosure(), order = testOrder()) {
  vi.mocked(bookingApi.get).mockResolvedValue(disclosure);
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BookingServices order={order} preferences={order.draft.services} onSaved={onSaved} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onSaved, user: userEvent.setup() };
}

describe('booking shell (FE-20)', () => {
  it('shows the seven sections in order with no horse picker', async () => {
    mountBooking();
    const buttons = await screen.findAllByRole('button', { expanded: false });
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Transportation',
      'Available Air Stalls for Your Horse',
      'Horse Care',
      'Veterinary',
      'Quarantine Packages',
      'Insurance',
      'Additional Charges',
    ]);
    expect(screen.queryByText(/next horse|select horse/i)).toBeNull();
  });

  it('does not pre-select an arrangement when the server value is null', async () => {
    const { user } = mountBooking();
    await user.click(await screen.findByRole('button', { name: 'Transportation' }));
    expect(screen.getByLabelText('Arranged by EquiTransit')).not.toBeChecked();
    expect(screen.getByLabelText('I will arrange my own provider')).not.toBeChecked();
  });

  it('asks for provider details only when self-arranged and clears them otherwise', async () => {
    const { user } = mountBooking();
    await user.click(await screen.findByRole('button', { name: 'Transportation' }));
    await user.click(screen.getByLabelText('I will arrange my own provider'));
    await user.type(screen.getByLabelText('Provider name'), 'My trucks');
    await user.type(screen.getByLabelText('Provider phone'), '12');
    expect(screen.getByText(/8–15 digits/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Arranged by EquiTransit'));
    expect(screen.queryByLabelText('Provider name')).toBeNull();
    await user.click(screen.getByLabelText('I will arrange my own provider'));
    expect(screen.getByLabelText('Provider name')).toHaveValue('');
  });

  it('opening and closing sections never confirms and marks edits as unconfirmed', async () => {
    const { user } = mountBooking();
    const transport = await screen.findByRole('button', { name: 'Transportation' });
    await user.click(transport);
    await user.click(transport);
    expect(bookingApi.confirm).not.toHaveBeenCalled();
    expect(screen.queryByText(/unconfirmed changes/)).toBeNull();
    await user.click(transport);
    await user.click(screen.getByLabelText('Arranged by EquiTransit'));
    expect(screen.getByText(/unconfirmed changes/)).toBeInTheDocument();
    expect(bookingApi.confirm).not.toHaveBeenCalled();
  });
});

describe('booking contract', () => {
  it('keeps money as decimal strings and rejects numbers', () => {
    expect(disclosureSchema.safeParse(testDisclosure()).success).toBe(true);
    const numeric = { ...testDisclosure(), knownSubtotal: 550 };
    expect(disclosureSchema.safeParse(numeric).success).toBe(false);
  });

  it('fills every preference field so a full replacement never drops one', () => {
    const prefs = toPreferences({ airStall: 'WIDE' });
    expect(prefs.airStall).toBe('WIDE');
    expect(Object.values(prefs).filter((v) => v === null)).toHaveLength(14);
  });
});
