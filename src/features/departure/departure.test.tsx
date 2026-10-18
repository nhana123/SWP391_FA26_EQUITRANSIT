import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DeparturePage } from './DeparturePage';
import { departureApi } from './api';
import { readinessSchema, usableReceipt, type Readiness } from './contracts';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  departureApi: {
    get: vi.fn(),
    evaluate: vi.fn(),
    authorize: vi.fn(),
    receipt: vi.fn(),
    depart: vi.fn(),
  },
}));

const gate = (status: 'PENDING' | 'PASS' | 'BLOCKED', blockers: string[] = []) => ({
  status,
  blockers,
});
const receipt = (receiptId: number, identity: string, status: string) => ({
  receiptId,
  planId: 801,
  legId: 901,
  receivedBy: 41,
  observedMicrochip: '981020000123456',
  observedPassportNumber: 'FEI-VN-2026-009',
  identityCheckResult: identity,
  receiptStatus: status,
  conditionNotes: null,
  evidenceFileKey: null,
  locationDescription: 'Hanoi Stable Gate A',
  receivedAt: `2027-02-01T05:2${receiptId % 10}:00Z`,
});
const readiness = (patch: Record<string, unknown> = {}): Readiness =>
  readinessSchema.parse({
    orderId: 101,
    recordVersion: '000000000001A2B3',
    orderStatus: 'CONFIRMED',
    currentRevisionId: 501,
    planId: 801,
    planVersionNo: 1,
    planStatus: 'CONFIRMED',
    acceptedQuoteId: 301,
    firstLegId: 901,
    firstLegStatus: 'PLANNED',
    firstLegActualDeparture: null,
    asOf: '2027-02-01T05:00:00Z',
    gatesCheckedAt: null,
    financialGate: gate('PASS'),
    legalGate: gate('BLOCKED', ['PHASE_CLEARANCE_PENDING', 'SOMETHING_NEW']),
    operationalGate: gate('PASS'),
    readyForAuthorization: false,
    departureAuthorizedBy: null,
    departureAuthorizedAt: null,
    readyForDeparture: false,
    departureBlockers: ['DEPARTURE_AUTHORIZATION_REQUIRED', 'HORSE_RECEIPT_MISSING'],
    receipts: [],
    ...patch,
  });

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  vi.mocked(departureApi.get).mockResolvedValue(readiness());
});
function mount(role: Role) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  const path =
    role === 'DRIVER'
      ? '/driver/orders/:id/departure'
      : role === 'MANAGER'
        ? '/manager/requests/:id/departure'
        : '/staff/cases/:id/departure';
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path.replace(':id', '101')]}>
        <Routes>
          <Route path={path} element={<DeparturePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}
const fill = async (user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) => {
  await user.click(field);
  await user.paste(text);
};

describe('departure gates (#81 F11)', () => {
  it('shows the three server gates separately with readable and unknown blockers', async () => {
    mount('MANAGER');
    const legal = await screen.findByRole('region', { name: 'Legal gate' });
    expect(legal).toHaveTextContent('BLOCKED');
    expect(within(legal).getByText(/Pre-export legal clearance is pending/)).toBeInTheDocument();
    expect(within(legal).getByText('SOMETHING_NEW')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Financial gate' })).toHaveTextContent('PASS');
    expect(screen.getByText(/A manager has not authorized departure/)).toBeInTheDocument();
    // The manager never acts as the driver.
    expect(screen.queryByRole('form', { name: 'Record horse receipt' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Depart first leg' })).toBeNull();
  });

  it('evaluates gates with the reviewed order version and nothing else', async () => {
    vi.mocked(departureApi.evaluate).mockResolvedValue(
      readiness({ recordVersion: '000000000001A2B4' }),
    );
    const user = mount('COORDINATOR');
    const form = within(await screen.findByRole('form', { name: 'Evaluate gates' }));
    expect(screen.queryByRole('form', { name: 'Authorize departure' })).toBeNull();
    await user.click(form.getByRole('button', { name: 'Evaluate gates now' }));
    await waitFor(() => expect(departureApi.evaluate).toHaveBeenCalledTimes(1));
    expect(departureApi.evaluate).toHaveBeenCalledWith(101, {
      recordVersion: '000000000001A2B3',
      operationId: expect.any(String),
    });
  });

  it('does not authorize while a gate blocks; authorizes the plan once all pass', async () => {
    const user = mount('MANAGER');
    const form = within(await screen.findByRole('form', { name: 'Authorize departure' }));
    expect(form.getByText(/not possible until all three gates pass/)).toBeInTheDocument();
    await user.click(form.getByRole('button', { name: 'Authorize departure' }));
    expect(departureApi.authorize).not.toHaveBeenCalled();
  });

  it('sends the plan when the manager authorizes passing gates', async () => {
    vi.mocked(departureApi.get).mockResolvedValue(
      readiness({ legalGate: gate('PASS'), readyForAuthorization: true }),
    );
    vi.mocked(departureApi.authorize).mockResolvedValue(readiness());
    const user = mount('MANAGER');
    const form = within(await screen.findByRole('form', { name: 'Authorize departure' }));
    await user.click(form.getByRole('button', { name: 'Authorize departure' }));
    await waitFor(() => expect(departureApi.authorize).toHaveBeenCalledTimes(1));
    expect(vi.mocked(departureApi.authorize).mock.calls[0][1]).toEqual({
      recordVersion: '000000000001A2B3',
      operationId: expect.any(String),
      planId: 801,
    });
  });

  it('shows a deployment notice when migration 012 is pending', async () => {
    vi.mocked(departureApi.get).mockRejectedValue(
      new ApiError(503, 'Pending', 'DEPARTURE_SCHEMA_PENDING'),
    );
    mount('COORDINATOR');
    expect(await screen.findByText(/migration 012/)).toBeInTheDocument();
  });
});

describe('driver receipt and departure (#81 F11)', () => {
  it('records an explicit receipt for the first road leg of the current plan', async () => {
    vi.mocked(departureApi.receipt).mockResolvedValue(readiness());
    const user = mount('DRIVER');
    const form = within(await screen.findByRole('form', { name: 'Record horse receipt' }));
    expect(screen.queryByRole('form', { name: 'Evaluate gates' })).toBeNull();
    await fill(user, form.getByLabelText('Observed microchip'), '981020000123456');
    await fill(user, form.getByLabelText('Observed passport number'), 'FEI-VN-2026-009');
    await fill(user, form.getByLabelText('Pickup location'), 'Hanoi Stable Gate A');
    await user.click(form.getByRole('button', { name: 'Record receipt' }));
    expect(form.getByText(/State whether the horse is fit/)).toBeInTheDocument();
    expect(departureApi.receipt).not.toHaveBeenCalled();
    await user.selectOptions(form.getByLabelText('Fit to travel'), 'true');
    await user.click(form.getByRole('button', { name: 'Record receipt' }));
    await waitFor(() => expect(departureApi.receipt).toHaveBeenCalledTimes(1));
    expect(departureApi.receipt).toHaveBeenCalledWith(101, {
      recordVersion: '000000000001A2B3',
      operationId: expect.any(String),
      planId: 801,
      legId: 901,
      observedMicrochip: '981020000123456',
      observedPassportNumber: 'FEI-VN-2026-009',
      fitToTravel: true,
      conditionNotes: null,
      evidenceFileKey: null,
      locationDescription: 'Hanoi Stable Gate A',
    });
  });

  it('departs only with the latest matched, accepted receipt and an explicit confirmation', async () => {
    vi.mocked(departureApi.get).mockResolvedValue(
      readiness({ receipts: [receipt(1001, 'MATCHED', 'ACCEPTED')] }),
    );
    vi.mocked(departureApi.depart)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce(
        readiness({
          firstLegStatus: 'IN_TRANSIT',
          firstLegActualDeparture: '2027-02-01T05:30:00Z',
        }),
      );
    const user = mount('DRIVER');
    const form = within(await screen.findByRole('form', { name: 'Depart first leg' }));
    await user.click(form.getByRole('button', { name: 'Depart now' }));
    expect(form.getByText(/Confirm that you have the horse/)).toBeInTheDocument();
    expect(departureApi.depart).not.toHaveBeenCalled();
    await user.click(form.getByRole('checkbox'));
    await user.click(form.getByRole('button', { name: 'Depart now' }));
    const retry = await form.findByRole('button', { name: 'Retry the same action' });
    // Once the departure commits, the live read reports it.
    vi.mocked(departureApi.get).mockResolvedValue(
      readiness({ firstLegStatus: 'IN_TRANSIT', firstLegActualDeparture: '2027-02-01T05:30:00Z' }),
    );
    await user.click(retry);
    await waitFor(() => expect(departureApi.depart).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(departureApi.depart).mock.calls;
    expect(second).toEqual(first);
    expect(first[1]).toMatchObject({ planId: 801, legId: 901, receiptId: 1001 });
    expect(await screen.findByText(/The first leg has departed/)).toBeInTheDocument();
  });

  it('a newer mismatched receipt blocks departure even after an older accepted one', () => {
    const r = readiness({
      receipts: [receipt(1001, 'MATCHED', 'ACCEPTED'), receipt(1002, 'MISMATCHED', 'REJECTED')],
    });
    expect(usableReceipt(r)).toBeNull();
    expect(
      usableReceipt(readiness({ receipts: [receipt(1003, 'MATCHED', 'ACCEPTED')] }))?.receiptId,
    ).toBe(1003);
    expect(
      usableReceipt(readiness({ receipts: [receipt(1004, 'MATCHED', 'PENDING')] })),
    ).toBeNull();
  });

  it('is not available to customers or specialists', () => {
    mount('SPECIALIST');
    expect(screen.getByText(/do not have access to departure/)).toBeInTheDocument();
    expect(departureApi.get).not.toHaveBeenCalled();
  });
});
