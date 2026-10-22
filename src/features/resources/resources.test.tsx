import { setDateTime } from '../../test/date-time';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ManagerResourcesPage } from './ManagerResourcesPage';
import { CaseAvailabilityPage } from './availability';
import { resourcesApi } from './api';
import { catalogs, type CatalogView } from './contracts';
import { assessmentApi } from '../assessment/api';
import { assignedCasesApi } from '../assigned-cases/api';
import type { ManagerCase } from '../assessment/contracts';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

vi.mock('./api', () => ({
  RESOURCE_PAGE_SIZE: 20,
  resourcesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    replace: vi.fn(),
    probe: vi.fn(),
    candidates: vi.fn(),
  },
}));
/** One candidates page per kind, as the BE returns for a case window. */
function mockCandidates(status = 'PENDING') {
  vi.mocked(resourcesApi.candidates).mockImplementation((kind) =>
    Promise.resolve({
      items: [
        {
          id: 12,
          code: kind === 'STALL' ? 'STALL-12' : 'VEH-12',
          status,
          recordVersion: '00000000000000b1',
          blockers: [],
        },
      ],
      page: 0,
      size: 10,
      totalElements: 1,
    } as never),
  );
}
vi.mock('../assessment/api', () => ({ assessmentApi: { getCase: vi.fn() } }));
vi.mock('../assigned-cases/api', () => ({ assignedCasesApi: { get: vi.fn() } }));

const vehicle = (
  patch: Partial<CatalogView['vehicles']['data']> = {},
  version = '00000000000000a1',
) =>
  catalogs.vehicles.view.parse({
    id: 11,
    recordVersion: version,
    data: {
      vehicleCode: 'VEH-101',
      plateNumber: '51C-12345',
      horseCapacity: 2,
      climateSystemType: 'Ventilation',
      status: 'ACTIVE',
      ownerSupplierId: null,
      window: {
        maintenanceFrom: null,
        maintenanceTo: null,
        documentExpiresAt: null,
        bufferMinutes: 60,
        notes: null,
      },
      ...patch,
    },
  });
const policy = (status: 'DRAFT' | 'APPROVED' | 'INACTIVE') =>
  catalogs['fit-policies'].view.parse({
    id: 5,
    recordVersion: '00000000000000c1',
    version: 2,
    reviewedBy: status === 'APPROVED' ? 31 : null,
    reviewedAt: status === 'APPROVED' ? '2027-01-01T00:00:00Z' : null,
    data: {
      policyCode: 'CARRIER-WIDE',
      stallId: 12,
      carrierSupplierId: 21,
      slotQuantity: 1.5,
      maxWeightKg: 650,
      maxHeightCm: 190,
      maxWidthCm: 90,
      effectiveFrom: '2027-01-01T00:00:00Z',
      effectiveTo: null,
      sourceUrl: 'https://carrier.example.com/fit-policy',
      sourceFileKey: null,
      status,
    },
  });
const pageOf = (items: unknown[]) => ({ items, page: 0, size: 20, totalElements: items.length });

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});
function mountCatalog(tab = 'vehicles') {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'MANAGER' });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/manager/resources?tab=${tab}`]}>
        <ManagerResourcesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}

describe('Manager resource catalogues (#79)', () => {
  it('lists real evidence and marks unknown expiry and buffer as pending, not available', async () => {
    const legacy = vehicle();
    legacy.data.window.bufferMinutes = null;
    vi.mocked(resourcesApi.list).mockResolvedValue(pageOf([legacy]) as never);
    mountCatalog();
    const table = await screen.findByRole('table', { name: 'Vehicles' });
    expect(within(table).getByText('VEH-101')).toBeInTheDocument();
    expect(within(table).getByText(/Expiry not recorded — pending/)).toBeInTheDocument();
    expect(within(table).getByText(/Buffer not recorded — pending/)).toBeInTheDocument();
    expect(resourcesApi.list).toHaveBeenCalledWith('vehicles', 0, expect.anything());
  });

  it('shows a deployment notice, not an empty catalogue, when migration 010 is pending', async () => {
    vi.mocked(resourcesApi.list).mockRejectedValue(
      new ApiError(503, 'Pending', 'RESOURCE_SCHEMA_PENDING'),
    );
    mountCatalog();
    expect(await screen.findByText(/migration 010 is/)).toBeInTheDocument();
    expect(screen.queryByText(/No vehicles recorded/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('creates a vehicle with a null version and a new operation', async () => {
    vi.mocked(resourcesApi.list).mockResolvedValue(pageOf([]) as never);
    vi.mocked(resourcesApi.create).mockResolvedValue(vehicle() as never);
    const user = mountCatalog();
    await user.click(await screen.findByRole('button', { name: 'Add vehicle' }));
    const form = within(screen.getByRole('form', { name: 'New vehicle' }));
    await user.type(form.getByLabelText('Vehicle code'), 'VEH-101');
    await user.type(form.getByLabelText('Plate number'), '51C-12345');
    await user.type(form.getByLabelText('Horse capacity'), '2');
    await user.type(form.getByLabelText('Climate system'), 'Ventilation');
    await user.type(form.getByLabelText('Buffer between uses (minutes)'), '60');
    await user.click(form.getByRole('button', { name: 'Create vehicle' }));
    await waitFor(() => expect(resourcesApi.create).toHaveBeenCalledTimes(1));
    const [key, command] = vi.mocked(resourcesApi.create).mock.calls[0];
    expect(key).toBe('vehicles');
    expect(command).toMatchObject({
      operationId: expect.any(String),
      recordVersion: null,
      data: { vehicleCode: 'VEH-101', horseCapacity: 2, window: { bufferMinutes: 60 } },
    });
    expect(await screen.findByText(/vehicle VEH-101 \(ID 11\) created/)).toBeInTheDocument();
  });

  it('edits with the reviewed version and blocks saving after a background change', async () => {
    vi.mocked(resourcesApi.list).mockResolvedValue(pageOf([vehicle()]) as never);
    vi.mocked(resourcesApi.get).mockResolvedValue(vehicle() as never);
    vi.mocked(resourcesApi.replace).mockResolvedValue(vehicle({}, '00000000000000a3') as never);
    const user = mountCatalog();
    await user.click(await screen.findByRole('button', { name: /Open vehicle VEH-101/ }));
    const form = within(await screen.findByRole('form', { name: 'Edit vehicle' }));
    await user.clear(form.getByLabelText('Plate number'));
    await user.type(form.getByLabelText('Plate number'), '51C-99999');
    // Someone else saves; a background refetch sees the new version.
    vi.mocked(resourcesApi.get).mockResolvedValue(
      vehicle({ plateNumber: 'X' }, '00000000000000a2') as never,
    );
    await act(() => queryClient.refetchQueries());
    expect(await form.findByText(/changed on the server since you opened it/)).toBeInTheDocument();
    expect(form.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(resourcesApi.replace).not.toHaveBeenCalled();
    // Reload starts a fresh review of the current values, then saves with that version.
    await user.click(form.getAllByRole('button', { name: 'Reload and review' })[0]);
    const fresh = within(await screen.findByRole('form', { name: 'Edit vehicle' }));
    await waitFor(() => expect(fresh.getByLabelText('Plate number')).toHaveValue('X'));
    await user.click(fresh.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(resourcesApi.replace).toHaveBeenCalledTimes(1));
    expect(vi.mocked(resourcesApi.replace).mock.calls[0][2].recordVersion).toBe('00000000000000a2');
  });

  it('retries an uncertain save with the same command; a version conflict offers reload', async () => {
    vi.mocked(resourcesApi.list).mockResolvedValue(pageOf([vehicle()]) as never);
    vi.mocked(resourcesApi.get).mockResolvedValue(vehicle() as never);
    vi.mocked(resourcesApi.replace)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockRejectedValueOnce(new ApiError(409, 'Stale', 'RESOURCE_VERSION_CONFLICT'));
    const user = mountCatalog();
    await user.click(await screen.findByRole('button', { name: /Open vehicle VEH-101/ }));
    const form = within(await screen.findByRole('form', { name: 'Edit vehicle' }));
    await user.click(form.getByRole('button', { name: 'Save changes' }));
    await user.click(await form.findByRole('button', { name: 'Retry the same change' }));
    await waitFor(() => expect(resourcesApi.replace).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(resourcesApi.replace).mock.calls;
    expect(second).toEqual(first);
    expect(await form.findByText(/Someone changed this record/)).toBeInTheDocument();
    expect(form.getByRole('button', { name: 'Reload and review' })).toBeInTheDocument();
  });

  it('archives a vehicle without deleting: reviewed data with state INACTIVE only', async () => {
    vi.mocked(resourcesApi.list).mockResolvedValue(pageOf([vehicle()]) as never);
    vi.mocked(resourcesApi.get).mockResolvedValue(vehicle() as never);
    vi.mocked(resourcesApi.replace).mockResolvedValue(vehicle({ status: 'INACTIVE' }) as never);
    const user = mountCatalog();
    await user.click(await screen.findByRole('button', { name: /Open vehicle VEH-101/ }));
    const form = within(await screen.findByRole('form', { name: 'Edit vehicle' }));
    // An unsaved edit is not smuggled into the archive.
    await user.type(form.getByLabelText('Plate number'), '-EDITED');
    await user.click(form.getByRole('button', { name: 'Archive vehicle' }));
    await waitFor(() => expect(resourcesApi.replace).toHaveBeenCalledTimes(1));
    const [key, id, command] = vi.mocked(resourcesApi.replace).mock.calls[0];
    expect([key, id, command.recordVersion]).toEqual(['vehicles', 11, '00000000000000a1']);
    expect(command.data).toEqual({ ...vehicle().data, status: 'INACTIVE' });
    expect(await screen.findByText(/VEH-101 \(ID 11\) archived/)).toBeInTheDocument();
  });

  it('archives a supplier by setting active=false on the reviewed data', async () => {
    const supplier = catalogs.suppliers.view.parse({
      id: 21,
      recordVersion: '00000000000000d1',
      data: {
        name: 'Partner',
        contactName: null,
        email: null,
        phone: null,
        services: ['Road'],
        active: true,
      },
    });
    vi.mocked(resourcesApi.list).mockResolvedValue(pageOf([supplier]) as never);
    vi.mocked(resourcesApi.get).mockResolvedValue(supplier as never);
    vi.mocked(resourcesApi.replace).mockResolvedValue({
      ...supplier,
      data: { ...supplier.data, active: false },
    } as never);
    const user = mountCatalog('suppliers');
    await user.click(await screen.findByRole('button', { name: /Open supplier Partner/ }));
    const form = within(await screen.findByRole('form', { name: 'Edit supplier' }));
    await user.click(form.getByRole('button', { name: 'Archive supplier' }));
    await waitFor(() => expect(resourcesApi.replace).toHaveBeenCalledTimes(1));
    expect(vi.mocked(resourcesApi.replace).mock.calls[0]).toEqual([
      'suppliers',
      21,
      {
        operationId: expect.any(String),
        recordVersion: '00000000000000d1',
        data: { ...supplier.data, active: false },
      },
    ]);
  });

  it('keeps approved policy content read-only; a new version is a prefilled DRAFT', async () => {
    vi.mocked(resourcesApi.list).mockResolvedValue(pageOf([policy('APPROVED')]) as never);
    vi.mocked(resourcesApi.get).mockResolvedValue(policy('APPROVED') as never);
    vi.mocked(resourcesApi.create).mockResolvedValue(policy('DRAFT') as never);
    const user = mountCatalog('fit-policies');
    const table = await screen.findByRole('table', { name: 'Stall fit policies' });
    expect(within(table).getByText(/Staff 31/)).toBeInTheDocument();
    expect(within(table).getByText('https://carrier.example.com/fit-policy')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: /Open fit policy CARRIER-WIDE/ }));
    const form = within(await screen.findByRole('form', { name: 'Edit fit policy' }));
    expect(form.getByText(/content cannot be edited/)).toBeInTheDocument();
    expect(form.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(form.getByLabelText('Max horse weight (kg)')).toBeDisabled();
    expect(form.getByRole('button', { name: 'Archive fit policy' })).toBeInTheDocument();
    await user.click(form.getByRole('button', { name: 'New version from this policy' }));
    const draft = within(await screen.findByRole('form', { name: 'New fit policy' }));
    expect(draft.getByLabelText('Policy code')).toHaveValue('CARRIER-WIDE');
    expect(draft.getByLabelText('Status')).toHaveValue('DRAFT');
    // Reviewer identity is never a form field.
    expect(draft.queryByLabelText(/Reviewed/)).toBeNull();
    await user.click(draft.getByRole('button', { name: 'Create fit policy' }));
    await waitFor(() => expect(resourcesApi.create).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(resourcesApi.create).mock.calls[0][1];
    expect(sent.recordVersion).toBeNull();
    expect(sent.data).toMatchObject({
      policyCode: 'CARRIER-WIDE',
      status: 'DRAFT',
      slotQuantity: 1.5,
    });
    expect(sent.data).not.toHaveProperty('reviewedBy');
  });
});

const approvedCase = (patch: Partial<ManagerCase> = {}): ManagerCase => ({
  orderId: 9,
  orderNumber: 'ET-TEST-9',
  orderStatus: 'APPROVED',
  recordVersion: '00000000000000e1',
  currentRevisionId: 7,
  revision: null,
  decision: null,
  assignments: [],
  ...patch,
});
function mountProbe(role: Role = 'MANAGER') {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  const base = role === 'MANAGER' ? '/manager/requests' : '/staff/cases';
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`${base}/9/availability`]}>
        <Routes>
          <Route path={`${base}/:id/availability`} element={<CaseAvailabilityPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}
async function fillProbe(user: ReturnType<typeof userEvent.setup>) {
  const form = within(await screen.findByRole('form', { name: 'Check resource availability' }));
  setDateTime(form.getByLabelText('Window start'), '2027-02-01T08:00:00Z');
  setDateTime(form.getByLabelText('Window end'), '2027-02-01T18:00:00Z');
  // The resource is chosen from the search for that window, not typed.
  await user.click(await form.findByRole('button', { name: /-12/ }));
  return form;
}

describe('case availability probe (#79)', () => {
  it('probes a stall for AIR in the case revision and shows blockers without claiming a reservation', async () => {
    vi.mocked(assessmentApi.getCase).mockResolvedValue(approvedCase());
    mockCandidates('PENDING');
    vi.mocked(resourcesApi.probe).mockResolvedValue({
      kind: 'STALL',
      resourceId: 12,
      recordVersion: '00000000000000b1',
      status: 'PENDING',
      asOf: '2027-02-01T07:00:00Z',
      policyId: null,
      carrierConfirmed: false,
      blockers: ['FIT_POLICY_PENDING', 'BUFFER_PENDING'],
    });
    const user = mountProbe();
    const form = within(await screen.findByRole('form', { name: 'Check resource availability' }));
    await user.type(form.getByLabelText('Carrier supplier ID (optional)'), '21');
    await fillProbe(user);
    expect(resourcesApi.candidates).toHaveBeenLastCalledWith(
      'STALL',
      expect.objectContaining({ orderId: 9, revisionId: 7, mode: 'AIR', carrierSupplierId: 21 }),
      { search: '', page: 0 },
      expect.any(AbortSignal),
    );
    await user.click(form.getByRole('button', { name: 'Check availability' }));
    await waitFor(() => expect(resourcesApi.probe).toHaveBeenCalledTimes(1));
    expect(resourcesApi.probe).toHaveBeenCalledWith('STALL', 12, {
      orderId: 9,
      revisionId: 7,
      mode: 'AIR',
      start: '2027-02-01T08:00:00Z',
      end: '2027-02-01T18:00:00Z',
      carrierSupplierId: 21,
      legId: null,
    });
    const result = await screen.findByRole('status', { name: 'Availability result' });
    expect(result).toHaveTextContent('Pending — evidence is missing or ambiguous');
    expect(within(result).getByText(/No approved, effective fit policy/)).toBeInTheDocument();
    expect(result).toHaveTextContent('Nothing has been reserved');
    expect(result).toHaveTextContent('Carrier acceptance is not confirmed');
    // Editing the input discards the result for the previous window.
    await user.type(form.getByLabelText('Window end'), 'x');
    expect(screen.queryByRole('status', { name: 'Availability result' })).toBeNull();
  });

  it('a vehicle uses ROAD, never sends a carrier, and the assigned Coordinator can probe', async () => {
    vi.mocked(assignedCasesApi.get).mockResolvedValue(approvedCase() as never);
    mockCandidates('UNAVAILABLE');
    vi.mocked(resourcesApi.probe).mockResolvedValue({
      kind: 'VEHICLE',
      resourceId: 12,
      recordVersion: '00000000000000b1',
      status: 'UNAVAILABLE',
      asOf: '2027-02-01T07:00:00Z',
      policyId: null,
      carrierConfirmed: false,
      blockers: ['OVERLAP'],
    });
    const user = mountProbe('COORDINATOR');
    const form = within(await screen.findByRole('form', { name: 'Check resource availability' }));
    await user.selectOptions(form.getByLabelText('Resource type'), 'VEHICLE');
    expect(form.queryByLabelText('Carrier supplier ID (optional)')).toBeNull();
    await fillProbe(user);
    await user.click(form.getByRole('button', { name: 'Check availability' }));
    await waitFor(() => expect(resourcesApi.probe).toHaveBeenCalledTimes(1));
    expect(vi.mocked(resourcesApi.probe).mock.calls[0][0]).toBe('VEHICLE');
    expect(vi.mocked(resourcesApi.probe).mock.calls[0][2]).toMatchObject({
      mode: 'ROAD',
      carrierSupplierId: null,
    });
    expect(await screen.findByText(/overlapping window \(including buffer\)/)).toBeInTheDocument();
    expect(assessmentApi.getCase).not.toHaveBeenCalled();
  });

  it('validates the window and offers a case reload on a revision conflict', async () => {
    vi.mocked(assessmentApi.getCase).mockResolvedValue(approvedCase());
    mockCandidates('AVAILABLE');
    vi.mocked(resourcesApi.probe).mockRejectedValue(
      new ApiError(409, 'Changed', 'RESOURCE_REVISION_CONFLICT'),
    );
    const user = mountProbe();
    const form = within(await screen.findByRole('form', { name: 'Check resource availability' }));
    setDateTime(form.getByLabelText('Window start'), '2027-02-01T18:00:00Z');
    setDateTime(form.getByLabelText('Window end'), '2027-02-01T08:00:00Z');
    await user.click(form.getByRole('button', { name: 'Check availability' }));
    expect(form.getByText('Choose a resource (or enter its ID).')).toBeInTheDocument();
    expect(form.getByText('The end must follow the start.')).toBeInTheDocument();
    // No search runs for an invalid window.
    expect(form.getByText(/Choose a valid window/)).toBeInTheDocument();
    expect(resourcesApi.candidates).not.toHaveBeenCalled();
    expect(resourcesApi.probe).not.toHaveBeenCalled();
    setDateTime(form.getByLabelText('Window end'), '2027-02-02T08:00:00Z');
    await user.click(await form.findByRole('button', { name: /STALL-12/ }));
    await user.click(form.getByRole('button', { name: 'Check availability' }));
    expect(await form.findByText(/revision changed or is not eligible/)).toBeInTheDocument();
    await user.click(form.getByRole('button', { name: 'Reload case' }));
    await waitFor(() => expect(assessmentApi.getCase).toHaveBeenCalledTimes(2));
  });
  it('changing the window drops the chosen resource', async () => {
    vi.mocked(assessmentApi.getCase).mockResolvedValue(approvedCase());
    mockCandidates('AVAILABLE');
    const user = mountProbe();
    const form = await fillProbe(user);
    expect(form.getByText(/Selected:/)).toHaveTextContent('STALL-12');
    setDateTime(form.getByLabelText('Window end'), '2027-02-03T18:00:00Z');
    expect(form.queryByText(/Selected:/)).toBeNull();
    await user.click(form.getByRole('button', { name: 'Check availability' }));
    expect(form.getByText('Choose a resource (or enter its ID).')).toBeInTheDocument();
    expect(resourcesApi.probe).not.toHaveBeenCalled();
  });

  it('is not offered before approval', async () => {
    vi.mocked(assessmentApi.getCase).mockResolvedValue(approvedCase({ orderStatus: 'SUBMITTED' }));
    mountProbe();
    expect(await screen.findByText(/once the request is approved/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Check resource availability' })).toBeNull();
  });
});
