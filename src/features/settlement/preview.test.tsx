import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { router } from '../../app/router';
import type { Role } from '../../shared/api/contracts';
import { startSession } from '../../shared/api/session';
import { SettlementPreviewLink } from './navigation';

let memory: ReturnType<typeof createMemoryRouter> | undefined;
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
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
  render(<RouterProvider router={memory} />);
  return userEvent.setup({ delay: null });
}

it('offers only disabled Customer decisions and never fetches evidence or internal financial data', async () => {
  const user = mount('/customer/requests/11/handover', 'CUSTOMER');
  expect(await screen.findByRole('heading', { name: 'Delivery handover' })).toBeInTheDocument();
  expect(screen.getByText(/Preview only/)).toBeInTheDocument();
  for (const name of ['Accept handover', 'Report a handover exception', 'Report not delivered']) {
    const button = screen.getByRole('button', { name });
    expect(button).toBeDisabled();
    await user.click(button);
  }
  expect(screen.getByRole('link', { name: 'Back to request' })).toHaveAttribute(
    'href',
    '/customer/requests/11',
  );
  expect(document.body).not.toHaveTextContent(/Actual costs|supplier|margin|internal notes/i);
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it('leaves Manager settlement unevaluated and closure unavailable without any financial API', async () => {
  const user = mount('/manager/requests/11/settlement', 'MANAGER');
  expect(await screen.findByRole('heading', { name: 'Financial settlement' })).toBeInTheDocument();
  expect(screen.getByText(/Settlement has not been evaluated/)).toBeInTheDocument();
  for (const name of [
    'Record an actual cost',
    'Evaluate financial settlement',
    'Close transport request',
  ]) {
    const button = screen.getByRole('button', { name });
    expect(button).toBeDisabled();
    await user.click(button);
  }
  expect(screen.queryByRole('table')).toBeNull();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it.each(['COORDINATOR', 'SPECIALIST'] as const)(
  'shows a noninteractive cost placeholder in the existing %s case portal',
  async (role) => {
    mount('/staff/cases/11/actual-costs', role);
    expect(await screen.findByRole('heading', { name: 'Actual costs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record an actual cost' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Back to request' })).toHaveAttribute(
      'href',
      '/staff/cases/11',
    );
    expect(screen.queryByRole('button', { name: 'Close transport request' })).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  },
);

it.each([
  ['CUSTOMER', '/manager/requests/11/settlement'],
  ['CUSTOMER', '/staff/cases/11/actual-costs'],
  ['MANAGER', '/customer/requests/11/handover'],
  ['SPECIALIST', '/manager/requests/11/settlement'],
  ['COORDINATOR', '/manager/requests/11/settlement'],
  ['DRIVER', '/staff/cases/11/actual-costs'],
] as const)('keeps %s outside %s', async (role, path) => {
  mount(path, role);
  expect(await screen.findByText(/You do not have access to this workspace/)).toBeInTheDocument();
  expect(screen.queryByText(/Preview only/)).toBeNull();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it('requires login for a handover preview', async () => {
  mount('/customer/requests/11/handover');
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it('rejects an invalid request ID without creating actions or loading records', async () => {
  mount('/customer/requests/0/handover', 'CUSTOMER');
  expect(await screen.findByText('This transport request is unavailable.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Accept handover' })).toBeNull();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it.each([
  ['CUSTOMER', '/customer/requests/11/handover', 'Delivery handover (preview)'],
  ['MANAGER', '/manager/requests/11/settlement', 'Financial settlement (preview)'],
  ['COORDINATOR', '/staff/cases/11/actual-costs', 'Actual costs (preview)'],
  ['SPECIALIST', '/staff/cases/11/actual-costs', 'Actual costs (preview)'],
] as const)('offers the correct preview link to %s', (role, href, label) => {
  session(role);
  render(
    <MemoryRouter>
      <SettlementPreviewLink orderId={11} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
});

it('does not offer a preview link to Driver or for an invalid ID', () => {
  session('DRIVER');
  const result = render(
    <MemoryRouter>
      <SettlementPreviewLink orderId={11} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link')).toBeNull();
  session('CUSTOMER');
  result.rerender(
    <MemoryRouter>
      <SettlementPreviewLink orderId={0} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link')).toBeNull();
});
