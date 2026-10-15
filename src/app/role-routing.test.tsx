import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { router } from './router';
import { authApi } from '../features/auth/api';
import { startSession } from '../shared/api/session';
import type { Role } from '../shared/api/contracts';

vi.mock('../features/auth/api', () => ({ authApi: { login: vi.fn(), me: vi.fn() } }));
vi.mock('../features/assigned-cases/pages', () => ({
  AssignedCasesLayout: () => <Outlet />,
  AssignedCasesPage: () => <h1>Assigned cases workspace</h1>,
  AssignedCasePage: () => null,
}));
vi.mock('../features/assessment/layout', () => ({ ManagerLayout: () => <Outlet /> }));
vi.mock('../features/assessment/case', () => ({ ManagerCasePage: () => null }));
vi.mock('../features/assessment/staff', () => ({ ManagerStaffPage: () => null }));
vi.mock('../features/assessment/pages', () => ({
  ManagerQueuePage: () => <h1>Manager workspace</h1>,
}));
vi.mock('../features/horses/pages', () => ({
  HorsesPage: () => <h1>Customer workspace</h1>,
  HorseDetailPage: () => null,
  HorseEditPage: () => null,
  HorseEditor: () => null,
}));

let memoryRouter: ReturnType<typeof createMemoryRouter>;
afterEach(() => memoryRouter?.dispose());
function mount(path = '/login') {
  memoryRouter = createMemoryRouter(router.routes, { initialEntries: [path] });
  render(<RouterProvider router={memoryRouter} />);
}

describe('login and role routing', () => {
  it.each<[Role, string, string]>([
    ['CUSTOMER', '/customer/horses', 'Customer workspace'],
    ['MANAGER', '/manager/requests', 'Manager workspace'],
    ['SPECIALIST', '/staff/cases', 'Assigned cases workspace'],
    ['COORDINATOR', '/staff/cases', 'Assigned cases workspace'],
    ['DRIVER', '/staff', 'DRIVER access'],
  ])('sends %s to its available workspace after login', async (role, path, heading) => {
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'test-only',
      tokenType: 'Bearer',
      expiresIn: 60,
      role,
    });
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'test@example.invalid');
    await user.type(screen.getByLabelText('Password'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: 'Log In' }));
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(memoryRouter.state.location.pathname).toBe(path);
    expect(authApi.me).not.toHaveBeenCalled();
    if (role === 'DRIVER')
      expect(
        screen.getByText('The driver operations portal is not available in this release.'),
      ).toBeInTheDocument();
  });

  it('requires login when assigned cases are opened without a session', async () => {
    mount('/staff/cases');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(memoryRouter.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('heading', { name: 'Assigned cases workspace' })).toBeNull();
  });

  it.each<Role>(['CUSTOMER', 'MANAGER', 'DRIVER'])(
    'keeps %s outside the Specialist/Coordinator workspace',
    async (role) => {
      startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
      mount('/staff/cases');
      expect(
        await screen.findByText(/You do not have access to this workspace/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Assigned cases workspace' })).toBeNull();
      expect(authApi.me).not.toHaveBeenCalled();
    },
  );
});
