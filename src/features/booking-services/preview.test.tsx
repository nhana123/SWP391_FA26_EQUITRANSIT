import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BookingServices } from './BookingServices';
import { bookingApi } from './api';
import type { Disclosure } from './contracts';
import { testCharge, testDisclosure, testOrder } from './testing';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  bookingApi: { get: vi.fn(), confirm: vi.fn(), preview: vi.fn() },
}));
vi.mock('./rates-api', () => ({ ratesApi: { get: vi.fn().mockResolvedValue([]) } }));

const previewWith = (label: string, amount: string | null, total: string | null): Disclosure =>
  testDisclosure({
    charges: [testCharge({ label, amount, pricingStatus: amount ? 'ESTIMATED' : 'RATE_PENDING' })],
    knownSubtotal: amount ?? '0.00',
    totalEstimate: total,
  });

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
  vi.mocked(bookingApi.get).mockResolvedValue(testDisclosure());
});
async function openTransport() {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BookingServices order={testOrder()} preferences={null} onSaved={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Transportation' }));
  return user;
}

describe('live preview (FE-27)', () => {
  it('does not preview when nothing changed', async () => {
    await openTransport();
    await new Promise((r) => setTimeout(r, 500));
    expect(bookingApi.preview).not.toHaveBeenCalled();
  });

  it('sends the full preferences and observed versions, with no operationId and no writes', async () => {
    vi.mocked(bookingApi.preview).mockResolvedValue(previewWith('Road transport', '220.00', null));
    const user = await openTransport();
    await user.click(screen.getByLabelText('Arranged by EquiTransit'));
    expect(await screen.findByText('220.00')).toBeInTheDocument();
    expect(bookingApi.preview).toHaveBeenCalledTimes(1);
    const [id, body] = vi.mocked(bookingApi.preview).mock.calls[0];
    expect(id).toBe(11);
    expect(body).toEqual({
      recordVersion: '00000000000000e1',
      horseRecordVersion: '00000000000000f1',
      services: expect.objectContaining({ roadArrangement: 'EQUITRANSIT', airStall: null }),
    });
    expect(body).not.toHaveProperty('operationId');
    expect(bookingApi.confirm).not.toHaveBeenCalled();
    expect(screen.getByText('Live estimate for your unsaved choices')).toBeInTheDocument();
    expect(screen.getByText(/Not available until pending items are priced/)).toBeInTheDocument();
  });

  it('debounces rapid edits into a single request for the latest choice', async () => {
    vi.mocked(bookingApi.preview).mockResolvedValue(previewWith('Road transport', '1.00', '1.00'));
    const user = await openTransport();
    await user.click(screen.getByLabelText('Arranged by EquiTransit'));
    await user.click(screen.getByLabelText('I will arrange my own provider'));
    await user.type(screen.getByLabelText('Provider name'), 'Trucks');
    await waitFor(() => expect(bookingApi.preview).toHaveBeenCalledTimes(1));
    expect(vi.mocked(bookingApi.preview).mock.calls[0][1].services).toMatchObject({
      roadArrangement: 'CUSTOMER',
      roadProviderName: 'Trucks',
    });
  });

  it('never lets a slow older response replace the latest estimate', async () => {
    let resolveOld: (value: Disclosure) => void = () => {};
    vi.mocked(bookingApi.preview)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce(previewWith('New choice line', '2.00', '2.00'));
    const user = await openTransport();
    await user.click(screen.getByLabelText('Arranged by EquiTransit'));
    await waitFor(() => expect(bookingApi.preview).toHaveBeenCalledTimes(1));
    await user.click(screen.getByLabelText('I will arrange my own provider'));
    expect(await screen.findByText('New choice line')).toBeInTheDocument();
    resolveOld(previewWith('Old choice line', '9.00', '9.00'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Old choice line')).toBeNull();
    expect(screen.getByText('New choice line')).toBeInTheDocument();
  });

  it('keeps choices on a stale-version 409 and offers an explicit reload, no retry loop', async () => {
    vi.mocked(bookingApi.preview).mockRejectedValue(
      new ApiError(409, 'Request changed.', 'ORDER_VERSION_CONFLICT'),
    );
    const user = await openTransport();
    await user.click(screen.getByLabelText('Arranged by EquiTransit'));
    expect(await screen.findByText(/Reload to estimate against current data/)).toBeInTheDocument();
    expect(screen.getByLabelText('Arranged by EquiTransit')).toBeChecked();
    expect(bookingApi.preview).toHaveBeenCalledTimes(1);
  });
});
