import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BookingServices } from './BookingServices';
import { bookingApi } from './api';
import { toPreferences, type Confirmation, type Disclosure } from './contracts';
import { testCharge, testDisclosure, testOrder } from './testing';
import { ordersApi } from '../transport-orders/api';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';
import type { Order } from '../../shared/api/contracts';

vi.mock('./api', () => ({
  bookingApi: { get: vi.fn(), confirm: vi.fn(), preview: vi.fn(() => new Promise(() => {})) },
}));
vi.mock('./rates-api', () => ({ ratesApi: { get: vi.fn().mockResolvedValue([]) } }));
vi.mock('../transport-orders/api', () => ({ ordersApi: { get: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'CUSTOMER' });
});
function mount(disclosure: Disclosure = testDisclosure(), order: Order = testOrder()) {
  vi.mocked(bookingApi.get).mockResolvedValue(disclosure);
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BookingServices order={order} preferences={null} onSaved={onSaved} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onSaved, user: userEvent.setup() };
}
async function chooseEquiTransitRoad(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Transportation' }));
  await user.click(screen.getByLabelText('Arranged by EquiTransit'));
}
const confirmation = (order: Order, revisionNo?: number): Confirmation => ({
  order,
  revision: revisionNo
    ? {
        revisionId: 500 + revisionNo,
        orderId: order.orderId,
        revisionNo,
        changeReason: 'Services',
        submittedAt: '2030-01-03T00:00:00Z',
        snapshot: { schemaVersion: 1, request: {}, horse: null, services: [] },
      }
    : null,
});

describe('show all charges (FE-24)', () => {
  it('shows server strings as-is, pending for null and no total or payment', async () => {
    const { user } = mount(
      testDisclosure({
        charges: [
          testCharge({
            code: 'DOCS',
            uiSection: 'ADDITIONAL_CHARGES',
            label: 'Document coordination',
            quantity: '1100.000',
            unitRate: '0.50',
            amount: '550.00',
            pricingStatus: 'ESTIMATED',
            blockers: [],
          }),
          testCharge({ label: 'Road transport' }),
          testCharge({
            code: 'CARE',
            uiSection: 'HORSE_CARE',
            label: 'Basic care',
            mandatory: true,
            pricingStatus: 'INCLUDED',
            unit: 'INCLUDED',
            blockers: [],
          }),
        ],
        knownSubtotal: '550.00',
        totalEstimate: null,
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Additional Charges' }));
    expect(screen.getByText('Document coordination')).toBeInTheDocument();
    expect(screen.getByText('1100.000')).toBeInTheDocument();
    expect(screen.queryByText('Road transport')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show all charges' }));
    const all = screen.getByLabelText('All charges');
    expect(within(all).getByText('Road transport')).toBeInTheDocument();
    expect(within(all).getByText('Included')).toBeInTheDocument();
    expect(within(all).getAllByText('Pending').length).toBeGreaterThan(0);
    expect(within(all).getByText(/550\.00 USD — not a total and not payable/)).toBeInTheDocument();
    expect(
      within(all).getByText(/Not available until pending items are priced/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pay/i })).toBeNull();
  });
});

describe('confirm service choices (FE-24)', () => {
  it('is disabled until something changes', async () => {
    mount();
    expect(await screen.findByRole('button', { name: 'Confirm service choices' })).toBeDisabled();
  });

  it('confirms a draft with full preferences and versions, then reloads current order', async () => {
    const fresh = testOrder({ recordVersion: '00000000000000e2' });
    vi.mocked(bookingApi.confirm).mockResolvedValue(confirmation(fresh));
    vi.mocked(ordersApi.get).mockResolvedValue(fresh);
    const { user, onSaved } = mount();
    await chooseEquiTransitRoad(user);
    vi.mocked(bookingApi.get).mockResolvedValue(
      testDisclosure({
        recordVersion: '00000000000000e2',
        selected: { roadArrangement: 'EQUITRANSIT' },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(fresh));
    expect(bookingApi.confirm).toHaveBeenCalledWith(11, {
      recordVersion: '00000000000000e1',
      horseRecordVersion: '00000000000000f1',
      operationId: expect.any(String),
      services: { ...toPreferences(null), roadArrangement: 'EQUITRANSIT' },
      changeReason: null,
    });
    expect(ordersApi.get).toHaveBeenCalledWith(11);
    expect(await screen.findByText(/saved to your draft/)).toBeInTheDocument();
  });

  it('requires a reason for a submitted request', async () => {
    const submitted = testOrder({ orderStatus: 'SUBMITTED', currentRevisionId: 70 });
    vi.mocked(bookingApi.confirm).mockResolvedValue(confirmation(submitted, 2));
    vi.mocked(ordersApi.get).mockResolvedValue(submitted);
    const { user } = mount(testDisclosure({ revisionId: 70 }), submitted);
    await chooseEquiTransitRoad(user);
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    expect(await screen.findByText(/Explain the change/)).toBeInTheDocument();
    expect(bookingApi.confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: 'Change transport or service providers' }));
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    await waitFor(() =>
      expect(bookingApi.confirm).toHaveBeenCalledWith(
        11,
        expect.objectContaining({ changeReason: 'Change transport or service providers' }),
      ),
    );
  });

  it('retries an uncertain confirmation with the identical command', async () => {
    const fresh = testOrder();
    vi.mocked(bookingApi.confirm)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce(confirmation(fresh));
    vi.mocked(ordersApi.get).mockResolvedValue(fresh);
    const { user } = mount();
    await chooseEquiTransitRoad(user);
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    await user.click(await screen.findByRole('button', { name: 'Retry the same confirmation' }));
    await waitFor(() => expect(bookingApi.confirm).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(bookingApi.confirm).mock.calls;
    expect(second).toEqual(first);
  });

  it('explains a stale horse snapshot and keeps the choices', async () => {
    vi.mocked(bookingApi.confirm).mockRejectedValue(
      new ApiError(409, 'Refresh the request revision.', 'HORSE_SNAPSHOT_STALE'),
    );
    const { user } = mount();
    await chooseEquiTransitRoad(user);
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    expect(await screen.findByText(/Use “Revise request” below/)).toBeInTheDocument();
    expect(screen.getByLabelText('Arranged by EquiTransit')).toBeChecked();
    expect(bookingApi.confirm).toHaveBeenCalledTimes(1);
  });

  it('keeps choices on a version conflict and offers a reload', async () => {
    vi.mocked(bookingApi.confirm).mockRejectedValue(
      new ApiError(409, 'Request changed.', 'ORDER_VERSION_CONFLICT'),
    );
    const { user } = mount();
    await chooseEquiTransitRoad(user);
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    expect(await screen.findByRole('button', { name: 'Reload request' })).toBeInTheDocument();
    expect(screen.getByLabelText('Arranged by EquiTransit')).toBeChecked();
  });
});
