import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StaffDashboardPage } from './StaffDashboard';
import { operationsApi } from './api';
import { ApiError } from '../../shared/api/client';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';

const dashboard = (role: Role) => ({
  role,
  counts: [
    { status: 'IN_TRANSIT', count: 2 },
    { status: 'CONFIRMED', count: 1 },
  ],
  items: [
    { orderId: 11, orderNumber: 'ORD-11', status: 'IN_TRANSIT' },
    { orderId: 12, orderNumber: 'ORD-12', status: 'CONFIRMED' },
  ],
  totalElements: 3,
  page: 0,
  size: 20,
});

beforeEach(() => {
  queryClient.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount(role: Role) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StaffDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('staff overview from /api/dashboard', () => {
  it('Manager sees status counts and opens each request in the manager workspace', async () => {
    const spy = vi
      .spyOn(operationsApi, 'dashboard')
      .mockResolvedValue(dashboard('MANAGER') as never);
    mount('MANAGER');
    const table = await screen.findByRole('table', { name: 'Dashboard orders' });
    expect(within(table).getByRole('link', { name: 'ORD-11' })).toHaveAttribute(
      'href',
      '/manager/requests/11',
    );
    expect(screen.getByText('Every transport request.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/not a staff schedule or availability/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My Tasks' })).toBeNull();
    expect(spy).toHaveBeenCalledWith('MANAGER', 0, expect.any(AbortSignal));
  });

  it('Coordinator opens assigned cases and has a link to the task queue', async () => {
    vi.spyOn(operationsApi, 'dashboard').mockResolvedValue(dashboard('COORDINATOR') as never);
    mount('COORDINATOR');
    expect(await screen.findByRole('link', { name: 'ORD-12' })).toHaveAttribute(
      'href',
      '/staff/cases/12',
    );
    expect(screen.getByRole('link', { name: 'My Tasks' })).toHaveAttribute('href', '/staff/tasks');
  });

  it('Driver opens trip progress once in transit, otherwise the departure page', async () => {
    vi.spyOn(operationsApi, 'dashboard').mockResolvedValue(dashboard('DRIVER') as never);
    mount('DRIVER');
    expect(await screen.findByRole('link', { name: 'ORD-11' })).toHaveAttribute(
      'href',
      '/driver/orders/11/execution',
    );
    expect(screen.getByRole('link', { name: 'ORD-12' })).toHaveAttribute(
      'href',
      '/driver/orders/12/departure',
    );
    expect(screen.getByRole('link', { name: 'My Tasks' })).toHaveAttribute('href', '/driver');
  });

  it('a Customer gets no staff overview and no request', () => {
    const spy = vi.spyOn(operationsApi, 'dashboard');
    mount('CUSTOMER');
    expect(screen.getByText('This overview is available to staff only.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows the real error instead of an empty overview', async () => {
    vi.spyOn(operationsApi, 'dashboard').mockRejectedValue(new ApiError(403, 'Forbidden'));
    mount('SPECIALIST');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have access to this activity.',
    );
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('staff dashboard adapter', () => {
  it('rejects a response scoped to another role', async () => {
    startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role: 'DRIVER' });
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(dashboard('MANAGER')), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(operationsApi.dashboard('DRIVER', 0)).rejects.toMatchObject({ status: 502 });
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:8080/api/dashboard?page=0&size=20');
  });
});
