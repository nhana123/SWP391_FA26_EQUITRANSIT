import { setDateTime } from '../../test/date-time';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExecutionPage } from './ExecutionPage';
import { executionApi } from './api';
import { incidentsApi } from '../incidents/api';
import { handoverApi } from '../handover/api';
import { overviewSchema, type ExecutionOverview } from './contracts';
import { validateMilestone, validateWelfare, type WelfareForm } from './validation';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('../incidents/api', () => ({
  incidentsApi: {
    adjustments: vi.fn(() => new Promise(() => {})),
    customerAdjustments: vi.fn(() => new Promise(() => {})),
    forLeg: vi.fn(() => new Promise(() => {})),
  },
}));
vi.mock('../handover/api', () => ({
  handoverApi: { forLeg: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('./api', () => ({
  EXECUTION_PAGE_SIZE: 20,
  executionApi: {
    get: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    milestone: vi.fn(),
    welfare: vi.fn(),
  },
}));

const leg = (sequenceNo: number, patch: Record<string, unknown> = {}) => ({
  legId: 900 + sequenceNo,
  sequenceNo,
  transportMode: 'ROAD',
  legStatus: 'CONFIRMED',
  plannedDeparture: '2027-02-01T06:00:00Z',
  plannedArrival: '2027-02-01T08:00:00Z',
  actualDeparture: null,
  actualArrival: null,
  ...patch,
});
const welfare = (patch: Record<string, unknown> = {}) => ({
  welfareLogId: 51,
  legId: 901,
  healthStatus: 'NORMAL',
  occurredAt: '2026-10-18T07:00:00Z',
  recordedAt: '2026-10-18T07:05:00Z',
  temperatureCelsius: '37.80',
  sourceCode: 'DRIVER_REPORT',
  sourceReference: 'Driver call',
  publicNote: 'Calm and drinking.',
  customerVisible: true,
  ...patch,
});
const overview = (patch: Record<string, unknown> = {}): ExecutionOverview =>
  overviewSchema.parse({
    orderId: 101,
    planId: 801,
    recordVersion: '000000000001A2B3',
    orderStatus: 'IN_TRANSIT',
    page: 0,
    size: 20,
    legCount: 3,
    milestoneCount: 0,
    welfareCount: 1,
    lastUpdateAt: '2026-10-18T07:05:00Z',
    legs: [
      leg(1, {
        legStatus: 'COMPLETED',
        actualDeparture: '2026-10-18T05:30:00Z',
        actualArrival: '2026-10-18T07:30:00Z',
      }),
      leg(2, { transportMode: 'AIR' }),
      leg(3),
    ],
    milestones: [],
    welfareLogs: [welfare()],
    ...patch,
  });
const receipt = (incidentId: number | null = null) => ({
  orderId: 101,
  recordVersion: '000000000001A2B4',
  operationId: 'd86b4f63-5acc-4f20-8da3-e24323268814',
  legId: 902,
  entityId: 61,
  incidentId,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  vi.mocked(executionApi.get).mockResolvedValue(overview());
});
function mount(role: Role) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/x/101/execution']}>
        <Routes>
          <Route path="/x/:id/execution" element={<ExecutionPage />} />
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

describe('trip progress (#81 F12)', () => {
  it('starts the next leg only after the previous one completed, without a driver source on AIR', async () => {
    vi.mocked(executionApi.start).mockResolvedValue(receipt());
    const user = mount('COORDINATOR');
    const table = await screen.findByRole('table', { name: 'Execution legs' });
    const rows = within(table).getAllByRole('row');
    // Leg 2 (AIR) can start; leg 3 cannot until leg 2 completes.
    expect(within(rows[2]).getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(within(rows[3]).queryByRole('button', { name: 'Start' })).toBeNull();
    await user.click(within(rows[2]).getByRole('button', { name: 'Start' }));
    const form = within(screen.getByRole('form', { name: 'Start leg 2' }));
    expect(form.queryByRole('option', { name: 'Driver report' })).toBeNull();
    setDateTime(form.getByLabelText('Occurred at'), '2026-10-18T09:00:00Z');
    await user.selectOptions(form.getByLabelText('Source'), 'CARRIER');
    await fill(user, form.getByLabelText('Source reference'), 'Carrier message SQ-101');
    await user.click(form.getByRole('button', { name: 'Record start' }));
    await waitFor(() => expect(executionApi.start).toHaveBeenCalledTimes(1));
    expect(executionApi.start).toHaveBeenCalledWith(101, 902, {
      recordVersion: '000000000001A2B3',
      operationId: expect.any(String),
      occurredAt: '2026-10-18T09:00:00Z',
      sourceCode: 'CARRIER',
      sourceReference: 'Carrier message SQ-101',
    });
  });

  it('a driver cannot write air legs', async () => {
    mount('DRIVER');
    const table = await screen.findByRole('table', { name: 'Execution legs' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[2]).queryByRole('button')).toBeNull();
  });

  it('URGENT welfare reports the opened incident without claiming a diagnosis', async () => {
    vi.mocked(executionApi.welfare).mockResolvedValue(receipt(401));
    const user = mount('MANAGER');
    const table = await screen.findByRole('table', { name: 'Execution legs' });
    await user.click(
      within(within(table).getAllByRole('row')[1]).getByRole('button', {
        name: 'Add welfare check',
      }),
    );
    const form = within(screen.getByRole('form', { name: 'Add welfare check to leg 1' }));
    await user.selectOptions(form.getByLabelText('Health status'), 'URGENT');
    setDateTime(form.getByLabelText('Occurred at'), '2026-10-18T07:10:00Z');
    await user.selectOptions(form.getByLabelText('Source'), 'DRIVER_REPORT');
    await fill(user, form.getByLabelText('Source reference'), 'Driver call');
    await fill(user, form.getByLabelText('Temperature °C (optional)'), '39.60');
    await user.selectOptions(form.getByLabelText('Customer visibility'), 'false');
    await user.click(form.getByRole('button', { name: 'Record welfare check' }));
    await waitFor(() => expect(executionApi.welfare).toHaveBeenCalledTimes(1));
    expect(vi.mocked(executionApi.welfare).mock.calls[0][2]).toMatchObject({
      healthStatus: 'URGENT',
      temperatureCelsius: '39.60',
      customerVisible: false,
      supersedesLogId: null,
    });
    expect(
      await screen.findByText(/incident 401 was opened for staff response/),
    ).toBeInTheDocument();
  });

  it('corrects a visible welfare entry with a visible successor that references it', async () => {
    vi.mocked(executionApi.welfare).mockResolvedValue(receipt());
    const user = mount('COORDINATOR');
    const list = await screen.findByRole('region', { name: 'Welfare checks' });
    await user.click(within(list).getByRole('button', { name: 'Correct' }));
    const form = within(screen.getByRole('form', { name: 'Correct welfare entry 51' }));
    expect(form.getByLabelText('Customer visibility')).toHaveValue('true');
    await user.selectOptions(form.getByLabelText('Source'), 'DRIVER_REPORT');
    await fill(user, form.getByLabelText('Source reference'), 'Corrected reading');
    await user.click(form.getByRole('button', { name: 'Record correction' }));
    await waitFor(() => expect(executionApi.welfare).toHaveBeenCalledTimes(1));
    expect(vi.mocked(executionApi.welfare).mock.calls[0][2]).toMatchObject({
      supersedesLogId: 51,
      customerVisible: true,
    });
  });

  it('customers read shared entries only and get no actions', async () => {
    mount('CUSTOMER');
    const list = await screen.findByRole('region', { name: 'Welfare checks' });
    expect(within(list).getByText('Calm and drinking.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start|Complete|Add|Correct/ })).toBeNull();
    expect(screen.queryByText('Staff only')).toBeNull();
  });

  it('retries an uncertain entry identically and explains a not-yet-departed trip', async () => {
    vi.mocked(executionApi.complete)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce(receipt());
    vi.mocked(executionApi.get).mockResolvedValue(
      overview({
        legs: [leg(1, { legStatus: 'IN_TRANSIT', actualDeparture: '2026-10-18T05:30:00Z' })],
      }),
    );
    const user = mount('DRIVER');
    await user.click(await screen.findByRole('button', { name: 'Complete' }));
    const form = within(screen.getByRole('form', { name: 'Complete leg 1' }));
    setDateTime(form.getByLabelText('Occurred at'), '2026-10-18T07:30:00Z');
    await user.selectOptions(form.getByLabelText('Source'), 'DRIVER_REPORT');
    await fill(user, form.getByLabelText('Source reference'), 'Arrived at stable');
    await user.click(form.getByRole('button', { name: 'Record arrival' }));
    await user.click(await form.findByRole('button', { name: 'Retry the same entry' }));
    await waitFor(() => expect(executionApi.complete).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(executionApi.complete).mock.calls;
    expect(second).toEqual(first);
  });

  it('shows the BE reason when the trip has not departed', async () => {
    vi.mocked(executionApi.get).mockRejectedValue(
      new ApiError(409, 'Not departed', 'EXECUTION_NOT_DEPARTED'),
    );
    mount('MANAGER');
    expect(await screen.findByText(/first leg has not departed yet/)).toBeInTheDocument();
  });
});

describe('F13 capability on the execution page', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is on by default: staff get the incident action and adjustments', async () => {
    mount('MANAGER');
    const table = await screen.findByRole('table', { name: 'Execution legs' });
    expect(
      within(within(table).getAllByRole('row')[1]).getByRole('button', { name: 'Incidents' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not available on this server/)).toBeNull();
    await waitFor(() => expect(incidentsApi.adjustments).toHaveBeenCalled());
  });

  it('a customer gets the adjustments decision panel by default', async () => {
    mount('CUSTOMER');
    await screen.findByRole('table', { name: 'Execution legs' });
    await waitFor(() => expect(incidentsApi.customerAdjustments).toHaveBeenCalled());
  });

  it('can be switched off for an older BE: no incident action and no F13 calls', async () => {
    vi.stubEnv('VITE_F13_INCIDENTS', 'false');
    const user = mount('MANAGER');
    const table = await screen.findByRole('table', { name: 'Execution legs' });
    const row = within(table).getAllByRole('row')[1];
    expect(within(row).queryByRole('button', { name: 'Incidents' })).toBeNull();
    expect(screen.getByText(/not available on this server/)).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Add welfare check' }));
    expect(incidentsApi.adjustments).not.toHaveBeenCalled();
    expect(incidentsApi.customerAdjustments).not.toHaveBeenCalled();
    expect(incidentsApi.forLeg).not.toHaveBeenCalled();
  });
});

describe('F14 handover on the execution page', () => {
  const inTransit = () =>
    overview({
      legs: [
        leg(1, { legStatus: 'COMPLETED', actualDeparture: '2026-10-18T05:30:00Z' }),
        leg(2, {
          transportMode: 'AIR',
          legStatus: 'IN_TRANSIT',
          actualDeparture: '2026-10-18T08:00:00Z',
        }),
        leg(3, { legStatus: 'IN_TRANSIT', actualDeparture: '2026-10-18T12:00:00Z' }),
      ],
    });

  it('a driver hands over only their road leg, and the last leg offers final delivery', async () => {
    vi.mocked(executionApi.get).mockResolvedValue(inTransit());
    const user = mount('DRIVER');
    const rows = within(await screen.findByRole('table', { name: 'Execution legs' })).getAllByRole(
      'row',
    );
    expect(within(rows[2]).queryByRole('button', { name: 'Handover' })).toBeNull();
    expect(within(rows[1]).queryByRole('button', { name: 'Handover' })).toBeNull();
    await user.click(within(rows[3]).getByRole('button', { name: 'Handover' }));
    const form = within(await screen.findByRole('form', { name: 'Record handover' }));
    expect(form.getByLabelText('Handover type')).toHaveValue('FINAL_RECEIVER');
    expect(handoverApi.forLeg).toHaveBeenCalledWith(true, 903, expect.any(AbortSignal));
  });

  it('a coordinator hands over a middle air leg with intermediate types only', async () => {
    vi.mocked(executionApi.get).mockResolvedValue(inTransit());
    const user = mount('COORDINATOR');
    const rows = within(await screen.findByRole('table', { name: 'Execution legs' })).getAllByRole(
      'row',
    );
    await user.click(within(rows[2]).getByRole('button', { name: 'Handover' }));
    const form = within(await screen.findByRole('form', { name: 'Record handover' }));
    expect(form.getByLabelText('Handover type')).toHaveValue('INTERMEDIATE_AIRPORT');
    expect(form.queryByRole('option', { name: 'Final delivery to receiver' })).toBeNull();
    expect(handoverApi.forLeg).toHaveBeenCalledWith(false, 902, expect.any(AbortSignal));
  });
});

describe('execution input rules (#81 F12)', () => {
  const base = {
    occurredAt: '2026-10-18T07:00:00Z',
    sourceCode: 'CARRIER' as const,
    sourceReference: 'Ref',
    milestoneType: 'POSITION' as const,
    latitude: '',
    longitude: '',
    locationDescription: '',
    estimatedArrivalAt: '',
    delayReason: '',
    publicNote: '',
    internalNotes: '',
    customerVisible: 'true' as const,
  };
  it('needs paired, bounded coordinates, a delay reason and an ETA after the event', () => {
    expect(
      validateMilestone('AIR', { ...base, latitude: '10.123456', longitude: '106.7' }).errors,
    ).toEqual({});
    expect(validateMilestone('AIR', { ...base, latitude: '10.1' }).errors).toHaveProperty(
      'longitude',
    );
    expect(
      validateMilestone('AIR', { ...base, latitude: '91', longitude: '1' }).errors,
    ).toHaveProperty('latitude');
    expect(
      validateMilestone('AIR', { ...base, latitude: '1.1234567', longitude: '1' }).errors,
    ).toHaveProperty('latitude');
    expect(validateMilestone('AIR', { ...base, milestoneType: 'DELAY' }).errors).toHaveProperty(
      'delayReason',
    );
    expect(
      validateMilestone('AIR', { ...base, estimatedArrivalAt: '2026-10-18T06:00:00Z' }).errors,
    ).toHaveProperty('estimatedArrivalAt');
    expect(
      validateMilestone('AIR', { ...base, sourceCode: 'DRIVER_REPORT' }).errors,
    ).toHaveProperty('sourceCode');
    expect(
      validateMilestone('ROAD', { ...base, occurredAt: '2099-01-01T00:00:00Z' }).errors,
    ).toHaveProperty('occurredAt');
  });
  it('keeps welfare readings as exact text and a visible correction visible', () => {
    const w: WelfareForm = {
      occurredAt: '2026-10-18T07:00:00Z',
      healthStatus: 'CONCERN',
      sourceCode: 'DRIVER_REPORT',
      sourceReference: 'Ref',
      temperatureCelsius: '38.50',
      waterIntakeLiters: '',
      feedIntakeKg: '2.333',
      behaviorNotes: '',
      careNotes: '',
      publicNote: '',
      customerVisible: 'false',
    };
    const r = validateWelfare('ROAD', w, null);
    expect(r.errors).toHaveProperty('feedIntakeKg');
    expect(validateWelfare('ROAD', { ...w, feedIntakeKg: '' }, null).input).toMatchObject({
      temperatureCelsius: '38.50',
      waterIntakeLiters: null,
      customerVisible: false,
    });
    expect(
      validateWelfare(
        'ROAD',
        { ...w, feedIntakeKg: '' },
        { welfareLogId: 51, customerVisible: true },
      ).errors,
    ).toHaveProperty('customerVisible');
  });
});
