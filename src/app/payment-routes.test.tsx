import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { router } from './router';
import { startSession } from '../shared/api/session';
vi.mock('../features/payments/pages', () => ({
  PaymentsPage: () => <h1>Payments test screen</h1>,
  PaymentLink: () => null,
}));
let memory: ReturnType<typeof createMemoryRouter>;
afterEach(() => memory?.dispose());
function mount(path: string) {
  memory = createMemoryRouter(router.routes, { initialEntries: [path] });
  render(<RouterProvider router={memory} />);
}
it.each(['SPECIALIST', 'COORDINATOR', 'DRIVER'] as const)(
  'keeps %s outside the Manager payment route',
  async (role) => {
    startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role });
    mount('/manager/requests/11/payments');
    expect(await screen.findByText(/You do not have access to this workspace/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Payments test screen' })).toBeNull();
  },
);
it.each(['CUSTOMER', 'MANAGER'] as const)(
  'opens the correct protected route for %s',
  async (role) => {
    startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role });
    mount(`/${role === 'CUSTOMER' ? 'customer' : 'manager'}/requests/11/payments`);
    expect(
      await screen.findByRole('heading', { name: 'Payments test screen' }),
    ).toBeInTheDocument();
  },
);
it('requires login before opening payment routes', async () => {
  mount('/customer/requests/11/payments');
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
});
it('does not allow Customer access through the Manager payment route', async () => {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'CUSTOMER' });
  mount('/manager/requests/11/payments');
  expect(await screen.findByText(/You do not have access to this workspace/)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Payments test screen' })).toBeNull();
});
