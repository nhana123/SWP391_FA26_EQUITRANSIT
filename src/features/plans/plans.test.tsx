import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlansPage } from './PlansPage';
import { PlanDetailPage } from './PlanDetailPage';
import { plansApi } from './api';
import { planDetailSchema } from './contracts';
import { planDetail } from './testing';
import { setDateTime } from '../../test/date-time';
import { resourcesApi } from '../resources/api';
import { quotationsApi } from '../quotations/api';
import { pageOf, summary } from '../quotations/testing';
import { assignedCasesApi } from '../assigned-cases/api';
import { assessmentApi } from '../assessment/api';
import type { ManagerCase } from '../assessment/contracts';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./studio/JourneyStudio', () => ({
  JourneyStudio: ({
    orderId,
    planId,
    mode,
  }: {
    orderId: number;
    planId?: number;
    mode: string;
  }) => (
    <div data-testid="journey-studio" data-order={orderId} data-plan={planId} data-mode={mode} />
  ),
}));

vi.mock('./api', () => ({
  PLAN_PAGE_SIZE: 20,
  plansApi: {
    list: vi.fn(),
    get: vi.fn(),
    candidates: vi.fn(),
    draft: vi.fn(),
    road: vi.fn(),
    stall: vi.fn(),
    flight: vi.fn(),
    quarantine: vi.fn(),
    insurance: vi.fn(),
    confirm: vi.fn(),
  },
}));
vi.mock('../resources/api', () => ({ resourcesApi: { probe: vi.fn(), candidates: vi.fn() } }));
const candidatePage = (
  items: {
    id: number;
    code: string;
    status: string;
    recordVersion?: string;
    blockers?: string[];
  }[],
) =>
  ({
    items: items.map((i) => ({ recordVersion: '00000000000000A1', blockers: [], ...i })),
    page: 0,
    size: 10,
    totalElements: items.length,
  }) as never;
vi.mock('../quotations/api', async (original) => ({
  ...(await original<typeof import('../quotations/api')>()),
  quotationsApi: { list: vi.fn(), get: vi.fn() },
}));
vi.mock('../assessment/api', () => ({ assessmentApi: { getCase: vi.fn() } }));
vi.mock('../assigned-cases/api', () => ({ assignedCasesApi: { get: vi.fn() } }));

const detail = (patch: Record<string, unknown> = {}) => planDetailSchema.parse(planDetail(patch));
const caseView = (patch: Partial<ManagerCase> = {}): ManagerCase => ({
  orderId: 101,
  orderNumber: 'ET-TEST-101',
  orderStatus: 'APPROVED',
  recordVersion: '000000000001A2B3',
  currentRevisionId: 201,
  revision: null,
  decision: null,
  assignments: [],
  ...patch,
});
const summaryOf = (d: ReturnType<typeof detail>) => {
  const {
    legs,
    quarantineReservations,
    insurancePolicies,
    confirmationBlockers,
    gatesCheckedAt,
    recordVersion,
    ...rest
  } = d;
  void legs;
  void quarantineReservations;
  void insurancePolicies;
  void confirmationBlockers;
  void gatesCheckedAt;
  void recordVersion;
  return rest;
};

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  vi.mocked(assignedCasesApi.get).mockResolvedValue(caseView() as never);
  vi.mocked(assessmentApi.getCase).mockResolvedValue(caseView());
  vi.mocked(plansApi.get).mockResolvedValue(detail());
  vi.mocked(resourcesApi.candidates).mockResolvedValue(candidatePage([]));
  vi.mocked(plansApi.list).mockResolvedValue({
    items: [summaryOf(detail())],
    page: 0,
    size: 20,
    totalElements: 1,
  });
  vi.mocked(plansApi.candidates).mockResolvedValue([]);
  vi.mocked(quotationsApi.list).mockResolvedValue(pageOf([]));
});
function mount(path: string, role: Role = 'COORDINATOR') {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  const base = role === 'MANAGER' ? '/manager/requests/:id' : '/staff/cases/:id';
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={`${base}/plans`} element={<PlansPage />} />
          <Route path={`${base}/plans/:planId`} element={<PlanDetailPage />} />
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

describe('plan versions and draft builder (#80)', () => {
  it('lists versions and creates a new ROAD → AIR draft with the case revision and version', async () => {
    vi.mocked(plansApi.draft).mockResolvedValue(detail({ planId: 312, versionNo: 2 }));
    const user = mount('/staff/cases/101/plans');
    const table = await screen.findByRole('table', { name: 'Plan versions' });
    expect(
      within(table).getByRole('cell', { name: /PENDING \/ PENDING \/ PENDING/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByText('Classic draft form and shared-stall shortlist'));
    const form = within(screen.getByRole('form', { name: 'New plan version' }));
    // Default template: road, air, road; remove the last road leg.
    await user.click(form.getByRole('button', { name: 'Remove leg 3' }));
    const values: [string, string][] = [
      ['Leg 1 from', 'Hanoi Stable'],
      ['Leg 1 to', 'Noi Bai Airport'],
      ['Leg 1 distance (km)', '45.5'],
      ['Leg 1 distance source', 'Verified route'],
      ['Leg 1 departs', '2027-02-01T06:00:00+07:00'],
      ['Leg 1 arrives', '2027-02-01T08:00:00+07:00'],
      ['Leg 2 from', 'HAN'],
      ['Leg 2 to', 'LHR'],
      ['Leg 2 distance (km)', '9200'],
      ['Leg 2 distance source', 'Airline distance'],
      ['Leg 2 departs', '2027-02-01T10:00:00+07:00'],
      ['Leg 2 arrives', '2027-02-01T20:00:00Z'],
    ];
    for (const [label, value] of values) {
      if (/departs|arrives/.test(label)) setDateTime(form.getByLabelText(label), value);
      else await fill(user, form.getByLabelText(label), value);
    }
    await user.click(form.getByRole('button', { name: 'Create draft version' }));
    await waitFor(() => expect(plansApi.draft).toHaveBeenCalledTimes(1));
    const [orderId, body] = vi.mocked(plansApi.draft).mock.calls[0];
    expect(orderId).toBe(101);
    expect(body).toMatchObject({
      recordVersion: '000000000001A2B3',
      operationId: expect.any(String),
      revisionId: 201,
      setAsCurrentDraft: true,
    });
    expect(body.legs.map((l) => [l.sequenceNo, l.transportMode, l.distanceKm])).toEqual([
      [1, 'ROAD', 45.5],
      [2, 'AIR', 9200],
    ]);
    // Opens the created version (a cheap check; role queries over this large form are slow under load).
    await waitFor(() => expect(plansApi.get).toHaveBeenCalledWith(101, 312, expect.anything()));
    expect(
      screen.getByText('Legs, resources, reservations and confirmation blockers.'),
    ).toBeInTheDocument();
  }, 20_000);

  it('prefills a new draft from an existing version instead of editing it', async () => {
    mount('/staff/cases/101/plans?from=311', 'COORDINATOR');
    const form = within(await screen.findByRole('form', { name: 'New plan version' }));
    expect(form.getByRole('heading')).toHaveTextContent('based on plan 311');
    expect(form.getByLabelText('Leg 2 planned flight number (optional)')).toHaveValue('VN0051');
    expect(form.getByLabelText('Leg 1 distance (km)')).toHaveValue('45.5');
  });

  it('shows shared stall candidates as advisory only, flagging over-capacity combinations', async () => {
    vi.mocked(plansApi.candidates).mockResolvedValue([
      {
        candidateOrderId: 102,
        candidateRevisionId: 202,
        originCountryCode: 'VN',
        destinationCountryCode: 'GB',
        sharingCode: 'SHARED',
        candidateSlotQuantity: '1.5',
        combinedSlotQuantity: '3.5',
        candidatePlanId: 312,
        candidateAirLegId: 405,
        plannedFlightNumber: 'VN0051',
        assignedStallId: 12,
        windowStart: '2027-02-01T09:00:00Z',
        windowEnd: '2027-02-01T17:00:00Z',
      },
    ]);
    const user = mount('/staff/cases/101/plans');
    await user.click(await screen.findByText('Classic draft form and shared-stall shortlist'));
    const table = await screen.findByRole('table', { name: 'Shared stall candidates' });
    expect(within(table).getByText(/over 3/)).toBeInTheDocument();
    expect(within(table).queryByRole('button')).toBeNull();
    expect(screen.getByText(/Nothing is matched or booked automatically/)).toBeInTheDocument();
  });

  it('shows a deployment notice when migration 011 is pending', async () => {
    vi.mocked(plansApi.list).mockRejectedValue(new ApiError(503, 'Pending', 'PLAN_SCHEMA_PENDING'));
    mount('/staff/cases/101/plans');
    expect(await screen.findByText(/migration 011 is/)).toBeInTheDocument();
  });
});

describe('plan detail (#80)', () => {
  it('mounts the studio for the selected plan and keeps detailed evidence forms available', async () => {
    const user = mount('/staff/cases/101/plans/311');
    const studio = await screen.findByTestId('journey-studio');
    expect(studio).toHaveAttribute('data-order', '101');
    expect(studio).toHaveAttribute('data-plan', '311');
    expect(studio).toHaveAttribute('data-mode', 'edit');
    const summary = screen.getByText(
      'Resource assignments, reservation evidence and plan confirmation',
    );
    expect(summary.closest('details')).not.toHaveAttribute('open');
    await user.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('form', { name: 'Confirm plan' })).toBeInTheDocument();
  });

  it('lists readable blockers and keeps a HELD flight visibly unconfirmed', async () => {
    const user = mount('/staff/cases/101/plans/311');
    const blockers = await screen.findByRole('list', { name: 'Confirmation blockers' });
    expect(within(blockers).getByText(/road leg has no vehicle/)).toBeInTheDocument();
    expect(within(blockers).getByText('SOMETHING_NEW')).toBeInTheDocument();
    await user.click(
      screen.getByText('Resource assignments, reservation evidence and plan confirmation'),
    );
    const air = screen.getByRole('region', { name: 'Leg 2' });
    const resources = within(within(air).getByRole('list', { name: 'Leg 2 resources' }));
    expect(resources.getByText('HELD')).toHaveClass('status-warning');
    expect(resources.getByText(/no booking evidence/)).toBeInTheDocument();
    // AIR legs get stall/flight forms only; ROAD legs vehicle/driver only.
    expect(within(air).queryByRole('form', { name: /Assign road resources/ })).toBeNull();
    expect(
      within(screen.getByRole('region', { name: 'Leg 1' })).queryByRole('form', { name: /stall/ }),
    ).toBeNull();
  });

  it('picks an AVAILABLE vehicle for the leg window and assigns it with that same version', async () => {
    vi.mocked(resourcesApi.candidates).mockResolvedValue(
      candidatePage([
        { id: 12, code: 'VEH-12', status: 'UNAVAILABLE', blockers: ['OVERLAP'] },
        { id: 11, code: 'VEH-11', status: 'AVAILABLE', recordVersion: '00000000000000B1' },
      ]),
    );
    vi.mocked(plansApi.road).mockResolvedValue(detail({ recordVersion: '000000000001A2B4' }));
    const user = mount('/staff/cases/101/plans/311');
    await user.click(
      await screen.findByText('Resource assignments, reservation evidence and plan confirmation'),
    );
    const form = within(
      await screen.findByRole('form', { name: 'Assign road resources to leg 1' }),
    );
    // The search uses the leg's own window; nobody types an ID.
    await waitFor(() =>
      expect(resourcesApi.candidates).toHaveBeenCalledWith(
        'VEHICLE',
        {
          orderId: 101,
          revisionId: 201,
          mode: 'ROAD',
          start: '2027-02-01T06:00:00Z',
          end: '2027-02-01T08:00:00Z',
          carrierSupplierId: null,
          legId: 401,
        },
        { search: '', page: 0 },
        expect.any(AbortSignal),
      ),
    );
    const list = within(await form.findByRole('list', { name: 'Matching vehicles' }));
    // AVAILABLE first; an unavailable one shows why and cannot be chosen.
    expect(list.getAllByRole('button')[0]).toHaveTextContent('VEH-11');
    expect(list.getByRole('button', { name: /VEH-12/ })).toBeDisabled();
    expect(list.getByText(/overlapping window/)).toBeInTheDocument();
    await fill(user, form.getByLabelText('Driver staff ID'), '41');
    await fill(user, form.getByLabelText('Driver buffer (minutes)'), '60');
    await user.click(form.getByRole('button', { name: 'Assign vehicle and driver' }));
    expect(form.getByText(/Choose an available vehicle/)).toBeInTheDocument();
    expect(plansApi.road).not.toHaveBeenCalled();
    await user.click(list.getByRole('button', { name: /VEH-11/ }));
    expect(form.getByText(/Selected:/)).toHaveTextContent('VEH-11');
    await user.click(form.getByRole('button', { name: 'Assign vehicle and driver' }));
    await waitFor(() => expect(plansApi.road).toHaveBeenCalledTimes(1));
    expect(plansApi.road).toHaveBeenCalledWith(101, 311, 401, {
      recordVersion: '000000000001A2B3',
      operationId: expect.any(String),
      vehicleId: 11,
      vehicleRecordVersion: '00000000000000B1',
      driverStaffId: 41,
      driverBufferMinutes: 60,
      conflictNotes: null,
    });
    expect(resourcesApi.probe).not.toHaveBeenCalled();
  });

  it('falls back to a typed ID and a single check when the server has no resource search', async () => {
    vi.mocked(resourcesApi.candidates).mockRejectedValue(new ApiError(404, 'Not found'));
    vi.mocked(resourcesApi.probe).mockResolvedValue({
      kind: 'VEHICLE',
      resourceId: 11,
      recordVersion: '00000000000000B1',
      status: 'AVAILABLE',
      asOf: '2027-01-30T00:00:00Z',
      policyId: null,
      carrierConfirmed: false,
      blockers: [],
    });
    vi.mocked(plansApi.road).mockResolvedValue(detail({ recordVersion: '000000000001A2B4' }));
    const user = mount('/staff/cases/101/plans/311');
    await user.click(
      await screen.findByText('Resource assignments, reservation evidence and plan confirmation'),
    );
    const form = within(
      await screen.findByRole('form', { name: 'Assign road resources to leg 1' }),
    );
    expect(await form.findByText(/not available on this server yet/)).toBeInTheDocument();
    await fill(user, form.getByLabelText('Vehicle ID'), '11');
    await fill(user, form.getByLabelText('Driver staff ID'), '41');
    await fill(user, form.getByLabelText('Driver buffer (minutes)'), '60');
    await user.click(form.getByRole('button', { name: 'Assign vehicle and driver' }));
    expect(form.getByText(/Choose an available vehicle/)).toBeInTheDocument();
    expect(plansApi.road).not.toHaveBeenCalled();
    await user.click(form.getByRole('button', { name: 'Check vehicle availability' }));
    expect(await form.findByRole('status', { name: 'Availability check' })).toHaveTextContent(
      'AVAILABLE',
    );
    expect(resourcesApi.probe).toHaveBeenCalledWith('VEHICLE', 11, {
      orderId: 101,
      revisionId: 201,
      mode: 'ROAD',
      start: '2027-02-01T06:00:00Z',
      end: '2027-02-01T08:00:00Z',
      carrierSupplierId: null,
      legId: 401,
    });
    await user.click(form.getByRole('button', { name: 'Assign vehicle and driver' }));
    await waitFor(() => expect(plansApi.road).toHaveBeenCalledTimes(1));
    expect(plansApi.road).toHaveBeenCalledWith(101, 311, 401, {
      recordVersion: '000000000001A2B3',
      operationId: expect.any(String),
      vehicleId: 11,
      vehicleRecordVersion: '00000000000000B1',
      driverStaffId: 41,
      driverBufferMinutes: 60,
      conflictNotes: null,
    });
  });

  it('cannot assign an unavailable stall and retries an uncertain flight record identically', async () => {
    vi.mocked(resourcesApi.candidates).mockResolvedValue(
      candidatePage([{ id: 12, code: 'STALL-12', status: 'UNAVAILABLE', blockers: ['OVERLAP'] }]),
    );
    vi.mocked(plansApi.flight)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce(detail());
    const user = mount('/staff/cases/101/plans/311');
    await user.click(
      await screen.findByText('Resource assignments, reservation evidence and plan confirmation'),
    );
    const stall = within(await screen.findByRole('form', { name: 'Assign stall to leg 2' }));
    expect(await stall.findByRole('button', { name: /STALL-12/ })).toBeDisabled();
    expect(stall.getByText(/overlapping window/)).toBeInTheDocument();
    expect(resourcesApi.candidates).toHaveBeenCalledWith(
      'STALL',
      expect.objectContaining({ mode: 'AIR', carrierSupplierId: 21, legId: 402 }),
      { search: '', page: 0 },
      expect.any(AbortSignal),
    );

    const flight = within(screen.getByRole('form', { name: 'Record flight for leg 2' }));
    expect(flight.getByLabelText('Flight number')).toHaveValue('VN0051');
    await fill(user, flight.getByLabelText('Airfare offer ID'), '501');
    await fill(user, flight.getByLabelText('Airline'), 'Vietnam Airlines Cargo');
    await user.selectOptions(flight.getByLabelText('Reservation state'), 'HELD');
    await fill(user, flight.getByLabelText('Usable stall capacity (slots)'), '3');
    await user.click(flight.getByRole('button', { name: 'Record flight reservation' }));
    await user.click(await flight.findByRole('button', { name: 'Retry the same action' }));
    await waitFor(() => expect(plansApi.flight).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(plansApi.flight).mock.calls;
    expect(second).toEqual(first);
    expect(first[3]).toMatchObject({ status: 'HELD', usableCapacitySlots: 3 });
  }, 20_000);

  it('confirms only against an accepted quote of this revision and never bypasses blockers', async () => {
    vi.mocked(quotationsApi.list).mockResolvedValue(
      pageOf([
        { ...summary, quoteId: 301, revisionId: 201, status: 'ACCEPTED', quoteNumber: 'Q-101-1' },
        { ...summary, quoteId: 302, revisionId: 200, status: 'ACCEPTED', quoteNumber: 'Q-101-0' },
        { ...summary, quoteId: 303, revisionId: 201, status: 'ISSUED', quoteNumber: 'Q-101-2' },
      ]),
    );
    const user = mount('/staff/cases/101/plans/311');
    await user.click(
      await screen.findByText('Resource assignments, reservation evidence and plan confirmation'),
    );
    const form = within(await screen.findByRole('form', { name: 'Confirm plan' }));
    await waitFor(() => expect(form.getAllByRole('option')).toHaveLength(2));
    expect(form.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose…',
      'Q-101-1 (v2)',
    ]);
    await user.selectOptions(form.getByLabelText('Accepted quotation'), '301');
    await user.click(form.getByRole('button', { name: 'Confirm plan' }));
    expect(form.getByText('Resolve every confirmation blocker first.')).toBeInTheDocument();
    expect(plansApi.confirm).not.toHaveBeenCalled();
  });

  it('keeps a confirmed version immutable and offers a new draft from it', async () => {
    vi.mocked(plansApi.get).mockResolvedValue(
      detail({ planStatus: 'CONFIRMED', confirmationBlockers: [] }),
    );
    mount('/staff/cases/101/plans/311', 'COORDINATOR');
    expect(await screen.findByText(/cannot change/)).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('link', { name: 'Create a new draft from it' })).toHaveAttribute(
      'href',
      '/staff/cases/101/plans?from=311',
    );
  });

  it('shows the Manager a read-only plan: no resource forms, no confirmation, no drafting', async () => {
    mount('/manager/requests/101/plans/311', 'MANAGER');
    expect(
      await screen.findByText(/Read-only review: the assigned Coordinator/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Create a new draft from it' })).toBeNull();
    expect(
      screen.getByText('Resource assignments and reservations (read-only)'),
    ).toBeInTheDocument();
  });

  it('gives the Manager no drafting tools on the plan list', async () => {
    mount('/manager/requests/101/plans', 'MANAGER');
    expect(
      await screen.findByText(/Plans are designed by the assigned Coordinator/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New plan version' })).toBeNull();
    expect(screen.queryByText('Classic draft form and shared-stall shortlist')).toBeNull();
  });

  it('is not available to customers or specialists', () => {
    mount('/staff/cases/101/plans/311', 'SPECIALIST');
    expect(screen.getByText(/do not have access to operational plans/)).toBeInTheDocument();
    expect(plansApi.get).not.toHaveBeenCalled();
  });
});
