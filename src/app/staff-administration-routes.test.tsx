import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { router } from './router';
import { startSession } from '../shared/api/session';
vi.mock('../features/staff-administration/pages', () => ({
  StaffAdministrationPage: () => <h1>Staff admin test screen</h1>,
  CreateStaffPage: () => <h1>Create staff test screen</h1>,
  StaffAdministrationDetailPage: () => <h1>Staff detail test screen</h1>,
}));
vi.mock('../features/service-pricing/ManagerPricesPage', () => ({
  ManagerPricesPage: () => <h1>Prices test screen</h1>,
}));
let memory: ReturnType<typeof createMemoryRouter>;
afterEach(() => memory?.dispose());
function mount(path: string) {
  memory = createMemoryRouter(router.routes, { initialEntries: [path] });
  render(<RouterProvider router={memory} />);
}
it.each([
  '/manager/staff-administration',
  '/manager/staff-administration/new',
  '/manager/staff-administration/31',
  '/manager/service-prices',
])('protects direct Customer access to %s', async (path) => {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'CUSTOMER' });
  mount(path);
  expect(await screen.findByText(/You do not have access to this workspace/)).toBeInTheDocument();
  expect(screen.queryByRole('heading')).toBeNull();
});
it('requires login before opening staff administration', async () => {
  mount('/manager/staff-administration');
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
});
it('exposes Manager links for both new administration and the existing case directory', async () => {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'MANAGER' });
  mount('/manager/staff-administration');
  await screen.findByRole('heading', { name: 'Staff admin test screen' });
  expect(screen.getByRole('link', { name: 'Staff Management' })).toHaveAttribute(
    'href',
    '/manager/staff-administration',
  );
  expect(screen.getByRole('link', { name: 'Case Staff' })).toHaveAttribute(
    'href',
    '/manager/staff',
  );
  expect(screen.getByRole('link', { name: 'Tariffs & Pricing' })).toHaveAttribute(
    'href',
    '/manager/service-prices',
  );
});
