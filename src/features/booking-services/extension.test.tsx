import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BookingServices } from './BookingServices';
import { bookingApi } from './api';
import { ratesApi } from './rates-api';
import { ordersApi } from '../transport-orders/api';
import { testCharge, testDisclosure, testOrder } from './testing';
import type { Disclosure, StallFit } from './contracts';
import { recommendsWide } from './stall-options';
import { ApiError } from '../../shared/api/client';
import type { Order } from '../../shared/api/contracts';
import { queryClient, queryKeys } from '../../shared/api/query';
import { getSession, startSession } from '../../shared/api/session';

vi.mock('./api', () => ({ bookingApi: { get: vi.fn(), preview: vi.fn(), confirm: vi.fn() } }));
vi.mock('./rates-api', () => ({ ratesApi: { get: vi.fn() } }));
vi.mock('../transport-orders/api', () => ({ ordersApi: { get: vi.fn() } }));

const fit = (
  option: StallFit['option'],
  status: StallFit['status'],
  reasons: string[] = [],
): StallFit => ({
  option,
  status,
  reasons,
  slots: option === 'WIDE' ? 1.5 : option === 'PRIVATE' ? 3 : 1,
  policyId: 4,
  policyVersion: 2,
});
const wideDisclosure = (patch: Partial<Disclosure> = {}) =>
  testDisclosure({
    sections: testDisclosure().sections.map((s) =>
      s.code === 'AIR_STALL' ? { ...s, options: ['WIDE', 'PRIVATE'] } : s,
    ),
    airStalls: [
      fit('SHARED_ONE', 'UNSUITABLE', ['HORSE_EXCEEDS_APPROVED_LIMITS']),
      fit('WIDE', 'ELIGIBLE'),
      fit('PRIVATE', 'ELIGIBLE'),
    ],
    selected: { airStall: 'WIDE' },
    ...patch,
  });
beforeEach(() => {
  vi.resetAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'CUSTOMER' });
  vi.mocked(ratesApi.get).mockResolvedValue([]);
  vi.mocked(bookingApi.preview).mockResolvedValue(testDisclosure());
});
function mount(disclosure = testDisclosure(), order: Order = testOrder()) {
  vi.mocked(bookingApi.get).mockResolvedValue(disclosure);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BookingServices order={order} preferences={order.draft.services} onSaved={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}
async function openAir(disclosure = wideDisclosure(), order?: Order) {
  const user = mount(disclosure, order);
  await user.click(
    await screen.findByRole('button', { name: 'Available Air Stalls for Your Horse' }),
  );
  return user;
}
async function changeRoad() {
  const user = mount();
  await user.click(await screen.findByRole('button', { name: 'Transportation' }));
  await user.click(screen.getByLabelText('Arranged by EquiTransit'));
  return user;
}

describe('F05 extension #74', () => {
  it('keeps unconfirmed choices mounted when a background service GET fails with 503', async () => {
    const user = await changeRoad();
    vi.mocked(bookingApi.get).mockRejectedValue(new ApiError(503, 'Service schema pending.'));
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.services(getSession()!.generation, 11),
        exact: true,
      });
    });
    expect(await screen.findByText(/Deployment blocked/)).toBeInTheDocument();
    expect(screen.getByLabelText('Arranged by EquiTransit')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeDisabled();
    vi.mocked(bookingApi.get).mockResolvedValue(testDisclosure());
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeEnabled(),
    );
    expect(screen.getByLabelText('Arranged by EquiTransit')).toBeChecked();
    expect(bookingApi.confirm).not.toHaveBeenCalled();
  });
  it('blocks confirmation when the initial order and service disclosure versions differ', async () => {
    await openAir(wideDisclosure({ recordVersion: '00000000000000e9' }));
    expect(screen.getByText(/The order and service versions differ/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeDisabled();
    expect(bookingApi.confirm).not.toHaveBeenCalled();
  });
  describe.each(['order', 'services'] as const)('post-confirmation %s GET recovery', (target) => {
    it.each([0, 500, 502, 503])(
      'locks writes through repeated read failures (%s) and retries only GETs',
      async (status) => {
        const fresh = testOrder({ recordVersion: '00000000000000e2' });
        fresh.draft.services = { roadArrangement: 'EQUITRANSIT' };
        const next = testDisclosure({
          recordVersion: fresh.recordVersion,
          selected: fresh.draft.services,
        });
        vi.mocked(bookingApi.confirm).mockResolvedValue({ order: fresh, revision: null });
        vi.mocked(ordersApi.get).mockResolvedValue(fresh);
        const user = await changeRoad();
        vi.mocked(bookingApi.get).mockResolvedValue(next);
        const failure = new ApiError(status, 'Current data could not be loaded.');
        if (target === 'order')
          vi.mocked(ordersApi.get).mockRejectedValueOnce(failure).mockRejectedValueOnce(failure);
        else
          vi.mocked(bookingApi.get).mockRejectedValueOnce(failure).mockRejectedValueOnce(failure);

        await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
        expect(await screen.findByText('Current data could not be loaded.')).toBeInTheDocument();
        expect(screen.getByText(/Service choices were saved/)).toBeInTheDocument();
        expect(screen.getByLabelText('Arranged by EquiTransit')).toBeChecked();
        expect(screen.getByLabelText('I will arrange my own provider')).toBeDisabled();
        expect(screen.queryByText(/You have unconfirmed changes/)).toBeNull();
        expect(screen.queryByRole('heading', { name: /Live estimate/ })).toBeNull();
        const confirm = screen.getByRole('button', { name: 'Confirm service choices' });
        expect(confirm).toBeDisabled();
        await user.click(confirm);
        expect(bookingApi.confirm).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('button', { name: 'Retry loading saved choices' }));
        expect(await screen.findByText('Current data could not be loaded.')).toBeInTheDocument();
        expect(confirm).toBeDisabled();
        expect(bookingApi.confirm).toHaveBeenCalledTimes(1);
        await user.click(screen.getByRole('button', { name: 'Retry loading saved choices' }));
        await screen.findByText(/Service choices saved to your draft/);
        expect(screen.queryByText(/Service choices were saved/)).toBeNull();
        expect(confirm).toBeDisabled();
        expect(screen.getByLabelText('Arranged by EquiTransit')).toBeChecked();
        expect(screen.getByLabelText('I will arrange my own provider')).toBeEnabled();
        expect(bookingApi.confirm).toHaveBeenCalledTimes(1);
        expect(ordersApi.get).toHaveBeenCalledTimes(3);
        expect(queryClient.getQueryData(queryKeys.order(getSession()!.generation, 11))).toEqual(
          fresh,
        );

        // A genuinely new edit uses the freshly reviewed version and a new UUID.
        await user.click(screen.getByLabelText('I will arrange my own provider'));
        await user.click(confirm);
        await waitFor(() => expect(bookingApi.confirm).toHaveBeenCalledTimes(2));
        const [first, second] = vi.mocked(bookingApi.confirm).mock.calls;
        expect(second[1].recordVersion).toBe(fresh.recordVersion);
        expect(second[1].operationId).not.toBe(first[1].operationId);
        expect(second[1].services.roadArrangement).toBe('CUSTOMER');
      },
    );
  });

  it('keeps confirmation locked while the acknowledged write is still refreshing', async () => {
    const fresh = testOrder({ recordVersion: '00000000000000e2' });
    fresh.draft.services = { roadArrangement: 'EQUITRANSIT' };
    let finishRead!: (order: Order) => void;
    vi.mocked(ordersApi.get).mockImplementation(
      () => new Promise<Order>((resolve) => (finishRead = resolve)),
    );
    vi.mocked(bookingApi.confirm).mockResolvedValue({ order: fresh, revision: null });
    const user = await changeRoad();
    vi.mocked(bookingApi.get).mockResolvedValue(
      testDisclosure({ recordVersion: fresh.recordVersion, selected: fresh.draft.services }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    expect(await screen.findByText(/Service choices were saved/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loading saved choices...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Confirming/ })).toBeDisabled();
    expect(screen.getByLabelText('I will arrange my own provider')).toBeDisabled();
    await act(async () => finishRead(fresh));
    await screen.findByText(/Service choices saved to your draft/);
    expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeDisabled();
    expect(bookingApi.confirm).toHaveBeenCalledTimes(1);
  });

  it('requires matching order and disclosure versions before finishing confirmation recovery', async () => {
    const fresh = testOrder({ recordVersion: '00000000000000e2' });
    fresh.draft.services = { roadArrangement: 'EQUITRANSIT' };
    vi.mocked(bookingApi.confirm).mockResolvedValue({ order: fresh, revision: null });
    vi.mocked(ordersApi.get).mockResolvedValue(fresh);
    const user = await changeRoad();
    // The service read observes an earlier version than the order read.
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    expect(await screen.findByText(/The request changed while reloading/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeDisabled();
    vi.mocked(bookingApi.get).mockResolvedValue(
      testDisclosure({ recordVersion: fresh.recordVersion, selected: fresh.draft.services }),
    );
    await user.click(screen.getByRole('button', { name: 'Retry loading saved choices' }));
    await screen.findByText(/Service choices saved to your draft/);
    expect(screen.queryByText(/The request changed while reloading/)).toBeNull();
    expect(bookingApi.confirm).toHaveBeenCalledTimes(1);
  });
  it('keeps an explicitly confirmed null stall when GET suggests the WIDE view default again', async () => {
    const user = await openAir();
    await user.click(screen.getByLabelText('No air stall preference yet'));
    await user.click(screen.getByRole('button', { name: 'Transportation' }));
    await user.click(screen.getByLabelText('Arranged by EquiTransit'));
    const fresh = testOrder({ recordVersion: '00000000000000e2' });
    fresh.draft.services = { roadArrangement: 'EQUITRANSIT', airStall: null };
    vi.mocked(bookingApi.confirm).mockResolvedValue({ order: fresh, revision: null });
    vi.mocked(ordersApi.get).mockResolvedValue(fresh);
    vi.mocked(bookingApi.get).mockResolvedValue(
      wideDisclosure({
        recordVersion: fresh.recordVersion,
        selected: { roadArrangement: 'EQUITRANSIT', airStall: 'WIDE' },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    await screen.findByText(/Service choices saved to your draft/);
    await user.click(screen.getByRole('button', { name: 'Available Air Stalls for Your Horse' }));
    expect(screen.getByLabelText('No air stall preference yet')).toBeChecked();
    expect(vi.mocked(bookingApi.confirm).mock.calls[0][1].services.airStall).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeDisabled();
  });
  it('shows a server WIDE view default as unconfirmed and permits explicit confirmation', async () => {
    await openAir();
    expect(screen.getByLabelText(/Wide stall/)).toBeChecked();
    expect(screen.getByText(/WIDE recommended/)).toHaveTextContent('not saved until you confirm');
    expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeEnabled();
    expect(bookingApi.confirm).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Request Share/).length).toBeGreaterThan(0);
  });
  it('keeps an explicitly saved PRIVATE selection even when WIDE is recommended', async () => {
    const order = testOrder();
    order.draft.services = { airStall: 'PRIVATE' };
    await openAir(wideDisclosure({ selected: { airStall: 'PRIVATE' } }), order);
    expect(screen.getByLabelText(/Private stall/)).toBeChecked();
    expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeDisabled();
    expect(bookingApi.confirm).not.toHaveBeenCalled();
  });
  it('does not reapply a default after the customer explicitly chooses no preference', async () => {
    const user = await openAir();
    await user.click(screen.getByLabelText('No air stall preference yet'));
    await user.click(screen.getByRole('button', { name: 'Horse Care' }));
    await user.click(screen.getByRole('button', { name: 'Available Air Stalls for Your Horse' }));
    expect(screen.getByLabelText('No air stall preference yet')).toBeChecked();
    expect(bookingApi.confirm).not.toHaveBeenCalled();
  });
  it.each(['ELIGIBLE', 'PENDING'] as const)(
    'does not infer one-slot exclusion from %s',
    (status) => {
      expect(
        recommendsWide(
          wideDisclosure({ airStalls: [fit('SHARED_ONE', status), fit('WIDE', 'ELIGIBLE')] }),
        ),
      ).toBe(false);
    },
  );
  it('does not recommend WIDE when unsuitable or missing from section options', () => {
    expect(
      recommendsWide(
        wideDisclosure({ airStalls: [fit('SHARED_ONE', 'UNSUITABLE'), fit('WIDE', 'UNSUITABLE')] }),
      ),
    ).toBe(false);
    expect(recommendsWide(wideDisclosure({ sections: [] }))).toBe(false);
  });
  it('shows a compatibility warning for an eligible stallion without rejecting the stall', async () => {
    await openAir(
      wideDisclosure({
        airStalls: [fit('WIDE', 'ELIGIBLE', ['STALLION_COMPATIBILITY_REVIEW_REQUIRED'])],
      }),
    );
    expect(screen.getByText(/Stallion compatibility needs Coordinator review/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Wide stall/)).toBeEnabled();
  });
  it('shows the SHIPMENT rate after choosing a stall without inventing a slots-times-km formula', async () => {
    vi.mocked(ratesApi.get).mockResolvedValue([
      {
        product: 'AIR_STALL',
        uiSection: 'AIR_STALL',
        unit: 'SHIPMENT',
        unitRate: '325.10',
        currency: 'USD',
        pricingMode: 'RATE',
        tariffId: 3,
        tariffVersion: 2,
        allowedUnits: ['SHIPMENT', 'SLOT_KM'],
      },
    ]);
    const user = await openAir();
    const privateChoice = screen.getByLabelText(/Private stall/).closest('label')!;
    expect(within(privateChoice).queryByText('325.10 USD per shipment')).toBeNull();
    await user.click(screen.getByLabelText(/Private stall/));
    expect(await within(privateChoice).findByText('325.10 USD per shipment')).toBeInTheDocument();
    expect(screen.queryByText(/charged as slots/)).toBeNull();
  });
  it.each([403, 404])('hides inaccessible service data after preview %s', async (status) => {
    vi.mocked(bookingApi.preview).mockRejectedValue(new ApiError(status, 'Unavailable.'));
    await changeRoad();
    expect(await screen.findByRole('link', { name: 'Back to requests' })).toHaveAttribute(
      'href',
      '/customer/requests',
    );
    expect(screen.queryByRole('button', { name: 'Confirm service choices' })).toBeNull();
    expect(bookingApi.confirm).not.toHaveBeenCalled();
  });
  it('keeps choices on a deployment-blocked preview and retries only on demand', async () => {
    vi.mocked(bookingApi.preview)
      .mockRejectedValueOnce(new ApiError(503, 'Schema pending.'))
      .mockResolvedValueOnce(testDisclosure());
    const user = await changeRoad();
    expect(await screen.findByText(/Deployment blocked/)).toBeInTheDocument();
    expect(screen.getByLabelText('Arranged by EquiTransit')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeDisabled();
    expect(bookingApi.preview).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeEnabled(),
    );
    expect(bookingApi.preview).toHaveBeenCalledTimes(2);
  });
  it('places service validation fields beside the input and retains the chosen preference', async () => {
    vi.mocked(bookingApi.preview).mockRejectedValue(
      new ApiError(400, 'Check service.', undefined, {
        'services.airStall': 'Review this stall choice.',
      }),
    );
    await openAir();
    expect(await screen.findByText('Review this stall choice.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Wide stall/)).toBeChecked();
    expect(bookingApi.confirm).not.toHaveBeenCalled();
  });
  it('requires explicit reload after confirm 409 and retains input with a fresh UUID/version', async () => {
    vi.mocked(bookingApi.confirm).mockRejectedValue(new ApiError(409, 'Version changed.'));
    const user = await changeRoad();
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    const reload = await screen.findByRole('button', { name: 'Reload request' });
    expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeDisabled();
    vi.mocked(bookingApi.get).mockResolvedValue(
      testDisclosure({ recordVersion: '00000000000000e2', horseRecordVersion: '00000000000000f2' }),
    );
    vi.mocked(ordersApi.get).mockResolvedValue(testOrder({ recordVersion: '00000000000000e2' }));
    await user.click(reload);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm service choices' })).toBeEnabled(),
    );
    expect(screen.getByLabelText('Arranged by EquiTransit')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    await waitFor(() => expect(bookingApi.confirm).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(bookingApi.confirm).mock.calls;
    expect(second[1]).toMatchObject({
      recordVersion: '00000000000000e2',
      horseRecordVersion: '00000000000000f2',
    });
    expect(second[1].operationId).not.toBe(first[1].operationId);
  });
  it('does not silently adopt a background GET version for an edited confirmation', async () => {
    vi.mocked(bookingApi.confirm).mockRejectedValue(new ApiError(409, 'Version changed.'));
    const user = await changeRoad();
    const generation = queryClient.getQueryCache().getAll()[0].queryKey[1] as string;
    act(() =>
      queryClient.setQueryData(
        queryKeys.services(generation, 11),
        testDisclosure({ recordVersion: '00000000000000e9' }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm service choices' }));
    await waitFor(() => expect(bookingApi.confirm).toHaveBeenCalled());
    expect(vi.mocked(bookingApi.confirm).mock.calls[0][1].recordVersion).toBe('00000000000000e1');
  });
  it('keeps an unchanged commercial line and its null INCLUDED amount exactly as the preview returns', async () => {
    vi.mocked(bookingApi.preview).mockResolvedValue(
      testDisclosure({
        charges: [
          testCharge({
            code: 'AIRPORT_HANDLING',
            label: 'Captured handling',
            unit: 'HORSE_AIRPORT',
            quantity: '4.000',
            unitRate: '12.30',
            amount: '49.20',
            pricingStatus: 'ESTIMATED',
            formula: 'Server captured quantity × quoted retail rate',
            blockers: [],
          }),
          testCharge({
            code: 'AIR_STALL',
            label: 'Included stall',
            unit: 'SHIPMENT',
            quantity: null,
            unitRate: null,
            amount: null,
            pricingStatus: 'INCLUDED',
            formula: 'Covered by verified bundle',
            blockers: [],
          }),
        ],
        knownSubtotal: '49.20',
        totalEstimate: null,
      }),
    );
    await changeRoad();
    const line = (await screen.findByText('Captured handling')).closest('tr')!;
    expect(within(line).getByText('4.000')).toBeInTheDocument();
    expect(within(line).getByText('49.20')).toBeInTheDocument();
    const included = screen.getByText('Included stall').closest('tr')!;
    expect(within(included).getByText('Included')).toBeInTheDocument();
    expect(within(included).getAllByText('Pending')).toHaveLength(3);
    expect(within(included).queryByText('0.00')).toBeNull();
    expect(screen.getByText(/Not available until pending items are priced/)).toBeInTheDocument();
  });
});
