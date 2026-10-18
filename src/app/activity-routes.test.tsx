import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { router } from './router';
import { startSession } from '../shared/api/session';
import type { Role } from '../shared/api/contracts';
vi.mock('../features/activity-customer/dashboard', () => ({
  CustomerDashboardPage: () => <h1>Customer dashboard screen</h1>,
}));
vi.mock('../features/activity-customer/preferences', () => ({
  EmailPreferencesPage: () => <h1>Email preference screen</h1>,
}));
vi.mock('../features/activity-customer/notifications', () => ({
  NotificationBell: () => null,
  NotificationsPage: () => <h1>Recipient notification screen</h1>,
}));
vi.mock('../features/activity-reports/pages', () => ({
  ManagerFinancialPage: () => <h1>Financial report screen</h1>,
  ManagerAuditPage: () => <h1>Audit event screen</h1>,
}));
let memory: ReturnType<typeof createMemoryRouter>;
afterEach(() => memory?.dispose());
function mount(path: string, role?: Role) {
  if (role) startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role });
  memory = createMemoryRouter(router.routes, { initialEntries: [path] });
  render(<RouterProvider router={memory} />);
}
it.each(['CUSTOMER', 'MANAGER', 'SPECIALIST', 'COORDINATOR', 'DRIVER'] as const)(
  'opens recipient notifications for %s',
  async (role) => {
    mount('/notifications', role);
    expect(
      await screen.findByRole('heading', { name: 'Recipient notification screen' }),
    ).toBeInTheDocument();
  },
);
it.each([
  ['/customer/dashboard', 'CUSTOMER', 'Customer dashboard screen'],
  ['/customer/notification-preferences', 'CUSTOMER', 'Email preference screen'],
  ['/manager/reports/financial', 'MANAGER', 'Financial report screen'],
  ['/manager/audit-events', 'MANAGER', 'Audit event screen'],
] as const)('registers %s under its existing role gate', async (path, role, title) => {
  mount(path, role);
  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
});
it.each([
  ['/manager/reports/financial', 'CUSTOMER'],
  ['/manager/audit-events', 'CUSTOMER'],
  ['/manager/reports/financial', 'SPECIALIST'],
  ['/manager/reports/financial', 'COORDINATOR'],
  ['/manager/audit-events', 'DRIVER'],
  ['/customer/dashboard', 'MANAGER'],
  ['/customer/notification-preferences', 'SPECIALIST'],
] as const)('blocks %s from %s', async (path, role) => {
  mount(path, role);
  expect(await screen.findByText(/You do not have access to this workspace/)).toBeInTheDocument();
});
it('requires login for notifications', async () => {
  mount('/notifications');
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
});
