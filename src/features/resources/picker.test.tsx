import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ResourcePicker } from './ResourcePicker';
import { resourcesApi } from './api';
import type { AvailabilityRequest, ResourceCandidate } from './contracts';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

const window: AvailabilityRequest = {
  orderId: 9,
  revisionId: 7,
  mode: 'ROAD',
  start: '2027-02-01T08:00:00Z',
  end: '2027-02-01T18:00:00Z',
  carrierSupplierId: null,
  legId: 401,
};
const item = (
  id: number,
  status: ResourceCandidate['status'] = 'AVAILABLE',
): ResourceCandidate => ({
  id,
  code: `VEH-${id}`,
  status,
  recordVersion: `00000000000000${String(id).padStart(2, '0')}`,
  blockers: status === 'AVAILABLE' ? [] : ['MAINTENANCE'],
});
const page = (items: ResourceCandidate[], pageNo: number, total: number) => ({
  items,
  page: pageNo,
  size: 10,
  totalElements: total,
});

function Harness({
  request = window,
  onSelect = vi.fn(),
  anyStatus = false,
}: {
  request?: AvailabilityRequest | null;
  onSelect?: (c: ResourceCandidate | null) => void;
  anyStatus?: boolean;
}) {
  const [selected, setSelected] = useState<ResourceCandidate | null>(null);
  return (
    <ResourcePicker
      kind="VEHICLE"
      request={request}
      selected={selected}
      anyStatus={anyStatus}
      onSelect={(c) => {
        setSelected(c);
        onSelect(c);
      }}
      fallback={<p>Typed ID fallback</p>}
    />
  );
}
function mount(ui: React.ReactNode) {
  startSession({
    accessToken: 'test-only',
    tokenType: 'Bearer',
    expiresIn: 600,
    role: 'COORDINATOR',
  });
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return userEvent.setup({ delay: null });
}

beforeEach(() => {
  queryClient.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('resource picker (F09 candidates)', () => {
  it('pages by code with Load more and never claims the total is free', async () => {
    const spy = vi
      .spyOn(resourcesApi, 'candidates')
      .mockImplementation((_k, _w, { page: p }) =>
        Promise.resolve(
          p === 0
            ? page([item(1), item(2, 'PENDING')], 0, 3)
            : page([item(3, 'UNAVAILABLE')], 1, 3),
        ),
      );
    const user = mount(<Harness />);
    expect(await screen.findByRole('button', { name: /VEH-1/ })).toBeEnabled();
    expect(screen.getByText(/Showing 2 of 3 vehicles/)).toHaveTextContent('not free vehicles');
    await user.click(screen.getByRole('button', { name: 'Load more vehicles' }));
    expect(await screen.findByRole('button', { name: /VEH-3/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Load more vehicles' })).toBeNull();
    expect(spy.mock.calls.map((c) => c[2])).toEqual([
      { search: '', page: 0 },
      { search: '', page: 1 },
    ]);
    // Pending and unavailable explain why in words.
    expect(screen.getAllByText(/Maintenance overlaps/)).toHaveLength(2);
  });

  it('searches the typed code prefix after a pause and shows an empty result honestly', async () => {
    const spy = vi
      .spyOn(resourcesApi, 'candidates')
      .mockImplementation((_k, _w, { search }) =>
        Promise.resolve(search ? page([], 0, 0) : page([item(1)], 0, 1)),
      );
    mount(<Harness />);
    await screen.findByRole('button', { name: /VEH-1/ });
    fireEvent.change(screen.getByLabelText('Find a vehicle by code'), {
      target: { value: '  50%_ ' },
    });
    expect(
      await screen.findByText(/No vehicles match “50%_”/, {}, { timeout: 2000 }),
    ).toBeVisible();
    expect(spy).toHaveBeenLastCalledWith(
      'VEHICLE',
      window,
      { search: '50%_', page: 0 },
      expect.any(AbortSignal),
    );
  });

  it('hands back the chosen item with its own version and lets it be cleared', async () => {
    vi.spyOn(resourcesApi, 'candidates').mockResolvedValue(page([item(1), item(2)], 0, 2));
    const onSelect = vi.fn();
    const user = mount(<Harness onSelect={onSelect} />);
    await user.click(await screen.findByRole('button', { name: /VEH-2/ }));
    expect(onSelect).toHaveBeenLastCalledWith(item(2));
    expect(screen.getByRole('status')).toHaveTextContent('Selected: VEH-2');
    await user.click(screen.getByRole('button', { name: /VEH-2/ }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('the check page may inspect a pending resource', async () => {
    vi.spyOn(resourcesApi, 'candidates').mockResolvedValue(page([item(4, 'PENDING')], 0, 1));
    mount(<Harness anyStatus />);
    expect(await screen.findByRole('button', { name: /VEH-4/ })).toBeEnabled();
  });

  it('waits for a complete window instead of calling the server', () => {
    const spy = vi.spyOn(resourcesApi, 'candidates');
    mount(<Harness request={null} />);
    expect(screen.getByText(/Complete the window/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('falls back to a typed ID only when the server has no search endpoint', async () => {
    vi.spyOn(resourcesApi, 'candidates').mockRejectedValue(new ApiError(404, 'Not found'));
    mount(<Harness />);
    expect(await screen.findByText('Typed ID fallback')).toBeInTheDocument();
    expect(screen.getByText(/not available on this server yet/)).toBeInTheDocument();
  });

  it('shows a real access error with retry, not an empty list', async () => {
    const spy = vi
      .spyOn(resourcesApi, 'candidates')
      .mockRejectedValueOnce(new ApiError(404, 'Gone', 'CASE_NOT_FOUND'))
      .mockResolvedValueOnce(page([item(1)], 0, 1));
    const user = mount(<Harness />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('CASE_NOT_FOUND');
    expect(screen.queryByText('Typed ID fallback')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: /VEH-1/ });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('candidates adapter', () => {
  it('POSTs the window without a command, omits a blank search and caps the page size at 10', async () => {
    startSession({
      accessToken: 'test-only',
      tokenType: 'Bearer',
      expiresIn: 600,
      role: 'COORDINATOR',
    });
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(page([item(1)], 0, 1)), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetch);
    await resourcesApi.candidates('STALL', window, { search: '   ', page: 0 });
    await resourcesApi.candidates('VEHICLE', window, { search: ' STALL-1 ', page: 2 });
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      'http://localhost:8080/api/resources/STALL/candidates?page=0&size=10',
      'http://localhost:8080/api/resources/VEHICLE/candidates?search=STALL-1&page=2&size=10',
    ]);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(window);
    await expect(
      resourcesApi.candidates('STALL', window, { search: '', page: -1 }),
    ).rejects.toMatchObject({ status: 400 });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
