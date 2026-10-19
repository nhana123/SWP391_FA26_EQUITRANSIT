import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { router } from '../../app/router';
import type { Role } from '../../shared/api/contracts';
import { queryClient } from '../../shared/api/query';
import { startSession } from '../../shared/api/session';
import { SettlementPreviewLink } from './navigation';

let memory: ReturnType<typeof createMemoryRouter> | undefined;
beforeEach(() => {
  queryClient.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
});
afterEach(() => {
  memory?.dispose();
  memory = undefined;
  vi.unstubAllGlobals();
});
function session(role: Role) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role });
}
function mount(path: string, role?: Role) {
  if (role) session(role);
  memory = createMemoryRouter(router.routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={memory} />
    </QueryClientProvider>,
  );
}
const calls = () => vi.mocked(globalThis.fetch).mock.calls.map((c) => String(c[0]));

it('Customer handover page loads only the redacted customer handovers', async () => {
  mount('/customer/requests/11/handover', 'CUSTOMER');
  expect(await screen.findByRole('heading', { name: 'Delivery handover' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to request' })).toHaveAttribute(
    'href',
    '/customer/requests/11',
  );
  expect(calls()).toEqual(['http://127.0.0.1:8080/api/customer/transport-orders/11/handovers']);
});

it('Manager page states that costs never close a request financially', async () => {
  mount('/manager/requests/11/settlement', 'MANAGER');
  expect(
    await screen.findByRole('heading', { name: 'Costs and profitability' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/do not close a request financially/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Close transport request' })).toBeNull();
  expect(calls()).toEqual(['http://127.0.0.1:8080/api/transport-orders/11/plans?page=0&size=20']);
});

it.each([
  ['CUSTOMER', '/manager/requests/11/settlement'],
  ['CUSTOMER', '/staff/cases/11/actual-costs'],
  ['MANAGER', '/customer/requests/11/handover'],
  ['SPECIALIST', '/manager/requests/11/settlement'],
  ['SPECIALIST', '/staff/cases/11/actual-costs'],
  ['COORDINATOR', '/manager/requests/11/settlement'],
  ['DRIVER', '/staff/cases/11/actual-costs'],
] as const)('keeps %s outside %s', async (role, path) => {
  mount(path, role);
  expect(await screen.findByText(/You do not have access to this workspace/)).toBeInTheDocument();
  expect(calls().filter((u) => /handovers|plans|actual-costs/.test(u))).toEqual([]);
});

it('requires login for the handover page', async () => {
  mount('/customer/requests/11/handover');
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it('rejects an invalid request ID without loading records', async () => {
  mount('/customer/requests/0/handover', 'CUSTOMER');
  expect(await screen.findByText('This transport request is unavailable.')).toBeInTheDocument();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it.each([
  ['CUSTOMER', '/customer/requests/11/handover', 'Delivery handover'],
  ['MANAGER', '/manager/requests/11/settlement', 'Costs and profitability'],
  ['COORDINATOR', '/staff/cases/11/actual-costs', 'Actual costs'],
] as const)('offers the correct F14 link to %s', (role, href, label) => {
  session(role);
  render(
    <MemoryRouter>
      <SettlementPreviewLink orderId={11} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
});

it.each(['DRIVER', 'SPECIALIST'] as const)('offers no F14 link to %s', (role) => {
  session(role);
  render(
    <MemoryRouter>
      <SettlementPreviewLink orderId={11} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link')).toBeNull();
});

it('offers no link for an invalid ID', () => {
  session('CUSTOMER');
  render(
    <MemoryRouter>
      <SettlementPreviewLink orderId={0} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link')).toBeNull();
});
