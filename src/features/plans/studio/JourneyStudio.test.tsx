import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { JourneyStudio } from './JourneyStudio';
import { graphApi, graphSchema, type GraphView } from './graphApi';
import { newNode, type Journey } from './model';
import type { Selection } from './JourneyStudioCanvas';
import { plansApi } from '../api';
import { resourcesApi } from '../../resources/api';
import { catalogs } from '../../resources/contracts';
import { planDetailSchema } from '../contracts';
import { planDetail } from '../testing';
import { ApiError } from '../../../shared/api/client';
import { queryClient } from '../../../shared/api/query';
import { startSession } from '../../../shared/api/session';
import type { Role } from '../../../shared/api/contracts';

vi.mock('./graphApi', async (original) => ({
  ...(await original<typeof import('./graphApi')>()),
  graphApi: { get: vi.fn(), compile: vi.fn(), positions: vi.fn() },
}));
vi.mock('../api', () => ({ plansApi: { get: vi.fn(), stall: vi.fn() } }));
vi.mock('../../resources/api', () => ({ resourcesApi: { list: vi.fn(), probe: vi.fn() } }));
vi.mock('../forms', () => ({
  ConfirmForm: () => <div>Confirmation evidence form</div>,
  QuarantineForm: () => <div>Quarantine evidence form</div>,
  InsuranceForm: () => <div>Insurance evidence form</div>,
}));
vi.mock('./ResourceAttachment', () => ({
  ResourceAttachment: () => <div>Resource evidence form</div>,
}));
vi.mock('./JourneyStudioCanvas', () => ({
  JourneyStudioCanvas: ({
    journey,
    onChange,
    editable,
    canConnect,
    select,
  }: {
    journey: Journey;
    onChange: (next: Journey) => void;
    editable: boolean;
    canConnect: boolean;
    select: (value: Selection) => void;
  }) => (
    <div data-testid="canvas" data-editable={editable} data-can-connect={canConnect}>
      <button
        type="button"
        onClick={() => select({ kind: 'node', id: journey.nodes[0]?.nodeKey ?? '' })}
      >
        Select origin
      </button>
      <button
        type="button"
        onClick={() => select({ kind: 'wire', id: journey.wires[0]?.id ?? '' })}
      >
        Select road
      </button>
      <button
        type="button"
        disabled={!editable}
        onClick={() =>
          onChange({ ...journey, nodes: journey.nodes.map((n) => ({ ...n, posX: n.posX + 100 })) })
        }
      >
        Move checkpoint
      </button>
      <output data-testid="vehicle">{journey.wires[0]?.vehicleId ?? 'unassigned'}</output>
      <output data-testid="position">{journey.nodes[0]?.posX}</output>
      <output data-testid="node-count">{journey.nodes.length}</output>
      <output data-testid="last-arrival">{journey.nodes.at(-1)?.plannedArrivalAt}</output>
    </div>
  ),
}));
/** The graph query resolves asynchronously; wait until the canvas holds it. */
async function graphLoaded(count = 2) {
  await waitFor(() => expect(screen.getByTestId('node-count')).toHaveTextContent(String(count)));
}

function graph(patch: Partial<GraphView> = {}): GraphView {
  return graphSchema.parse({
    orderId: 101,
    planId: 311,
    revisionId: 201,
    planStatus: 'DRAFT',
    recordVersion: '000000000001A2B3',
    editable: true,
    checkpointNodes: [
      {
        ...newNode('ORIGIN', 0),
        nodeKey: 'origin',
        locationName: 'Hanoi Stable',
        countryCode: 'VN',
        plannedDepartureAt: '2027-02-01T06:00:00Z',
        details: { preDepartureVetNote: 'PRIVATE VET NOTE' },
      },
      {
        ...newNode('DESTINATION', 1),
        nodeKey: 'destination',
        locationName: 'Airport',
        countryCode: 'VN',
        plannedArrivalAt: '2027-02-01T08:00:00Z',
      },
    ],
    wires: [
      {
        legId: 401,
        sequenceNo: 1,
        fromNodeKey: 'origin',
        toNodeKey: 'destination',
        transportMode: 'ROAD',
        legStatus: 'PLANNED',
        startPoint: 'Hanoi Stable',
        endPoint: 'Airport',
        distanceKm: '45.5',
        distanceSource: 'MANUAL_VERIFIED',
        plannedDeparture: '2027-02-01T06:00:00Z',
        plannedArrival: '2027-02-01T08:00:00Z',
        actualDeparture: null,
        actualArrival: null,
        vehicleId: null,
        driverStaffId: null,
        flightNumber: null,
        stallEquipmentId: null,
        assignedToCurrentDriver: false,
      },
    ],
    layout: { zoom: 0.75, panX: 45, panY: 80 },
    ...patch,
  });
}
const WINDOW = {
  maintenanceFrom: null,
  maintenanceTo: null,
  documentExpiresAt: null,
  bufferMinutes: null,
  notes: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  vi.mocked(graphApi.get).mockResolvedValue(graph());
  vi.mocked(plansApi.get).mockResolvedValue(planDetailSchema.parse(planDetail()));
  // The catalogue the Coordinator chooses from: one truck, one stall, one carrier.
  vi.mocked(resourcesApi.list).mockImplementation(async (key) => {
    const items =
      key === 'vehicles'
        ? [
            catalogs.vehicles.view.parse({
              id: 51,
              recordVersion: '0000000000000001',
              data: {
                vehicleCode: 'TR-1',
                plateNumber: '51C-123',
                horseCapacity: 2,
                climateSystemType: 'AIR_CONDITIONED',
                status: 'ACTIVE',
                ownerSupplierId: null,
                window: WINDOW,
              },
            }),
          ]
        : key === 'stalls'
          ? [
              catalogs.stalls.view.parse({
                id: 61,
                recordVersion: '0000000000000001',
                data: {
                  stallCode: 'ST-1',
                  capacitySlots: 1.5,
                  internalHeightCm: 240,
                  internalWidthCm: 120,
                  weightLimitKg: null,
                  status: 'ACTIVE',
                  ownerSupplierId: null,
                  window: WINDOW,
                },
              }),
            ]
          : [
              catalogs.suppliers.view.parse({
                id: 21,
                recordVersion: '0000000000000001',
                data: { name: 'Green Air', active: true, services: ['Air transport'] },
              }),
            ];
    return { items, page: 0, size: 20, totalElements: items.length } as never;
  });
});
function mount(role: Role, mode: 'edit' | 'driver' | 'customer' = 'edit', canCompile = true) {
  startSession({ accessToken: 'unit-test', tokenType: 'Bearer', expiresIn: 60, role });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <JourneyStudio
          orderId={101}
          planId={311}
          revisionId={201}
          recordVersion="000000000001A2B3"
          mode={mode}
          canCompile={canCompile}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}

describe('Journey Studio role safety and write consistency', () => {
  it.each(['CUSTOMER', 'DRIVER'] as const)(
    'uses only projected graph reads for %s and no internal node fields',
    async (role) => {
      const user = mount(role, role === 'CUSTOMER' ? 'customer' : 'driver');
      await waitFor(() => expect(graphApi.get).toHaveBeenCalled());
      await graphLoaded();
      await user.click(screen.getByRole('button', { name: 'Select origin' }));
      expect(await screen.findByText('Hanoi Stable')).toBeInTheDocument();
      expect(plansApi.get).not.toHaveBeenCalled();
      expect(screen.queryByText('PRIVATE VET NOTE')).toBeNull();
      expect(screen.queryByLabelText('Ghi chú thú y trước khởi hành')).toBeNull();
      expect(
        screen.queryByRole('button', { name: /Compile|Soạn phiên bản|Lưu bố cục/ }),
      ).toBeNull();
      expect(screen.getByRole('button', { name: 'Move checkpoint' })).toBeDisabled();
    },
  );

  it('cannot turn a customer into an editor by passing edit mode', async () => {
    mount('CUSTOMER', 'edit');
    await waitFor(() => expect(graphApi.get).toHaveBeenCalled());
    expect(plansApi.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Compile|Soạn phiên bản|Lưu bố cục/ })).toBeNull();
  });

  it('preserves layout but refreshes resource facts from the same saved plan', async () => {
    const user = mount('COORDINATOR');
    await screen.findByRole('button', { name: 'Lưu bố cục' });
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-can-connect', 'false');
    await user.click(screen.getByRole('button', { name: 'Move checkpoint' }));
    expect(screen.getByTestId('position')).toHaveTextContent('180');
    const next = graph();
    next.wires[0].vehicleId = 99;
    vi.mocked(graphApi.get).mockResolvedValue(next);
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() => expect(screen.getByTestId('vehicle')).toHaveTextContent('99'));
    expect(screen.getByTestId('position')).toHaveTextContent('180');
  });

  it('retries an uncertain compile with the identical operation, version and body while locking edits', async () => {
    vi.mocked(graphApi.compile)
      .mockRejectedValueOnce(new ApiError(0, 'Interrupted'))
      .mockResolvedValueOnce(graph({ planId: 312 }));
    const user = mount('COORDINATOR');
    await user.click(await screen.findByRole('button', { name: 'Soạn phiên bản mới' }));
    await user.click(screen.getByRole('button', { name: /Lưu lộ trình & cập nhật báo giá/ }));
    const retry = await screen.findByRole('button', { name: 'Thử lại cùng yêu cầu' });
    expect(screen.getByRole('button', { name: 'Move checkpoint' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /\+ Nghỉ/ })).toBeDisabled();
    const body = structuredClone(vi.mocked(graphApi.compile).mock.calls[0][1]);
    expect(body.draft.command.recordVersion).toBe('000000000001A2B3');
    expect(body.draft.legs[0].plannedDeparture).toBe('2027-02-01T13:00:00+07:00');
    await user.click(retry);
    await waitFor(() => expect(graphApi.compile).toHaveBeenCalledTimes(2));
    expect(vi.mocked(graphApi.compile).mock.calls[1][1]).toEqual(body);
  });

  it('locks compile, fork, layout and resources when the parent record is stale', async () => {
    mount('COORDINATOR', 'edit', false);
    expect(await screen.findByRole('button', { name: 'Soạn phiên bản mới' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu bố cục' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move checkpoint' })).toBeDisabled();
    expect(screen.queryByText('Confirmation evidence form')).toBeNull();
  });

  it('derives a road arrival from distance at 60 km/h and moves the next checkpoint', async () => {
    const user = mount('COORDINATOR');
    await user.click(await screen.findByRole('button', { name: 'Soạn phiên bản mới' }));
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-can-connect', 'true');
    await user.click(screen.getByRole('button', { name: 'Select road' }));
    // No arrival field, carrier, flight or technical distance source on a road leg.
    expect(screen.queryByLabelText('Đến nơi (+07)')).toBeNull();
    expect(screen.queryByText('Nguồn khoảng cách')).toBeNull();
    expect(screen.queryByLabelText('Hãng hàng không')).toBeNull();
    fireEvent.change(screen.getByLabelText('Khoảng cách (km)'), { target: { value: '300' } });
    // Departs 13:00 (+07); 300 km at 60 km/h is five hours.
    expect(screen.getByTestId('last-arrival')).toHaveTextContent('2027-02-01T18:00:00+07:00');
    expect(screen.getByLabelText('Dự kiến đến')).toHaveTextContent('18:00');
    expect(graphApi.compile).not.toHaveBeenCalled();
  });

  it('prices a flight leg and sends its fare with the saved journey', async () => {
    vi.mocked(graphApi.compile).mockResolvedValue(graph({ planId: 312 }));
    const user = mount('COORDINATOR');
    await user.click(await screen.findByRole('button', { name: 'Soạn phiên bản mới' }));
    await user.click(screen.getByRole('button', { name: 'Select road' }));
    await user.selectOptions(screen.getByLabelText('Phương thức'), 'AIR');
    expect(screen.getByLabelText('Hãng hàng không')).toBeInTheDocument();
    expect(screen.getByLabelText('Hạ cánh (+07)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Giá vé máy bay chặng này (USD)'), {
      target: { value: '1500.5' },
    });
    await user.click(screen.getByRole('button', { name: /Lưu lộ trình & cập nhật báo giá/ }));
    await waitFor(() => expect(graphApi.compile).toHaveBeenCalled());
    const leg = vi.mocked(graphApi.compile).mock.calls[0][1].draft.legs[0];
    expect(leg).toMatchObject({
      transportMode: 'AIR',
      estimatedAirfare: 1500.5,
      distanceSource: 'SUPPLIER_DECLARATION',
    });
  });

  it('holds the stall chosen on a flight leg once the leg exists', async () => {
    const saved = graph({ planId: 312 });
    saved.wires[0].transportMode = 'AIR';
    vi.mocked(graphApi.compile).mockResolvedValue(saved);
    vi.mocked(resourcesApi.probe).mockResolvedValue({
      status: 'AVAILABLE',
      recordVersion: '00000000000000f1',
      blockers: [],
    } as never);
    vi.mocked(plansApi.stall).mockResolvedValue(
      planDetailSchema.parse({ ...planDetail(), recordVersion: '00000000000000c3' }),
    );
    const user = mount('COORDINATOR');
    await user.click(await screen.findByRole('button', { name: 'Soạn phiên bản mới' }));
    await user.click(screen.getByRole('button', { name: 'Select road' }));
    await user.selectOptions(screen.getByLabelText('Phương thức'), 'AIR');
    await screen.findByRole('option', { name: /ST-1 · 1.5 slot/ });
    await user.selectOptions(screen.getByLabelText('Chuồng bay'), '61');
    await user.click(screen.getByRole('button', { name: /Lưu lộ trình & cập nhật báo giá/ }));
    await waitFor(() => expect(plansApi.stall).toHaveBeenCalledTimes(1));
    expect(vi.mocked(plansApi.stall).mock.calls[0]).toEqual([
      101,
      312,
      saved.wires[0].legId,
      expect.objectContaining({
        stallId: 61,
        stallRecordVersion: '00000000000000f1',
        status: 'HELD',
        carrierAcceptanceStatus: 'PENDING',
        recordVersion: saved.recordVersion,
      }),
    ]);
    expect(await screen.findByText(/đã giữ chuồng #61/)).toBeInTheDocument();
  });

  it('preserves the carrier from authorized plan detail when compiling a fork', async () => {
    const detail = planDetailSchema.parse(planDetail());
    detail.legs[0].supplierId = 73;
    vi.mocked(plansApi.get).mockResolvedValue(detail);
    vi.mocked(graphApi.compile).mockResolvedValue(graph({ planId: 312 }));
    const user = mount('COORDINATOR');
    await user.click(await screen.findByRole('button', { name: 'Soạn phiên bản mới' }));
    await user.click(screen.getByRole('button', { name: 'Select road' }));
    // A road leg shows no carrier field, but the authorized carrier still travels with the fork.
    await user.click(screen.getByRole('button', { name: /Lưu lộ trình & cập nhật báo giá/ }));
    await waitFor(() => expect(graphApi.compile).toHaveBeenCalled());
    expect(vi.mocked(graphApi.compile).mock.calls[0][1].draft.legs[0].supplierId).toBe(73);
  });

  it('lets a legacy draft without graph nodes start a new graph draft', async () => {
    vi.mocked(graphApi.get).mockResolvedValue(
      graph({ checkpointNodes: [], wires: [], editable: false }),
    );
    const user = mount('COORDINATOR');
    await user.click(await screen.findByRole('button', { name: 'Soạn phiên bản mới' }));
    expect(screen.getByRole('navigation', { name: 'Checkpoint palette' })).toBeInTheDocument();
  });

  it('routes the driver first-leg start through receipt and departure', async () => {
    const data = graph();
    data.wires[0].assignedToCurrentDriver = true;
    vi.mocked(graphApi.get).mockResolvedValue(data);
    const user = mount('DRIVER', 'driver');
    await graphLoaded();
    await user.click(screen.getByRole('button', { name: 'Select road' }));
    expect(await screen.findByRole('link', { name: 'Bắt đầu chặng' })).toHaveAttribute(
      'href',
      '/driver/orders/101/departure',
    );
  });
});
