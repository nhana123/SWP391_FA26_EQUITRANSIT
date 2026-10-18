import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { router } from '../../app/router';
import { queryClient } from '../../shared/api/query';
import { getSession, startSession } from '../../shared/api/session';
import type { Role } from '../../shared/api/contracts';

// Guards FE2 entry points: if the shared router is replaced by a snapshot that
// drops these routes, CI fails instead of the screens silently disappearing.
vi.mock('./api', () => ({
  QUEUE_PAGE_SIZE: 20,
  STAFF_PAGE_SIZE: 20,
  HISTORY_PAGE_SIZE: 20,
  assessmentApi: {
    queue: vi.fn(() => new Promise(() => {})),
    staff: vi.fn(() => new Promise(() => {})),
    getCase: vi.fn(() => new Promise(() => {})),
    decisions: vi.fn(() => new Promise(() => {})),
    assignments: vi.fn(() => new Promise(() => {})),
  },
}));
vi.mock('../assigned-cases/api', () => ({
  ASSIGNED_PAGE_SIZE: 20,
  assignedCasesApi: {
    list: vi.fn(() => new Promise(() => {})),
    get: vi.fn(() => new Promise(() => {})),
  },
}));
vi.mock('../service-pricing/api', () => ({
  TARIFF_PAGE_SIZE: 20,
  tariffApi: {
    products: vi.fn(() => new Promise(() => {})),
    list: vi.fn(() => new Promise(() => {})),
  },
}));
vi.mock('../resources/api', () => ({
  RESOURCE_PAGE_SIZE: 20,
  resourcesApi: { list: vi.fn(() => new Promise(() => {})), probe: vi.fn() },
}));
vi.mock('../transport-orders/status-api', () => ({
  ORDER_PAGE_SIZE: 20,
  orderStatusApi: {
    list: vi.fn(() => new Promise(() => {})),
    assessment: vi.fn(() => new Promise(() => {})),
  },
}));

beforeEach(() => {
  queryClient.clear();
});
function open(path: string, role: Role) {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 60, role });
  const memory = createMemoryRouter(router.routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={memory} />
    </QueryClientProvider>,
  );
  return memory;
}

describe('FE2 routes are wired into the app router', () => {
  it.each([
    ['/manager/requests', 'Transport Requests'],
    ['/manager/staff', 'Case Staff'],
    ['/manager/service-prices', 'Service Prices'],
    ['/manager/resources', 'Transport Resources'],
  ])('%s renders the Manager page', async (path, heading) => {
    open(path, 'MANAGER');
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Manager navigation' })).toBeInTheDocument();
  });

  it('/manager/requests/:id renders the case page', async () => {
    open('/manager/requests/7', 'MANAGER');
    expect(await screen.findByRole('status')).toHaveTextContent('Loading');
    expect(screen.getByRole('navigation', { name: 'Manager navigation' })).toBeInTheDocument();
  });

  it('signed-in Managers are sent from /staff to their workspace', async () => {
    const memory = open('/staff', 'MANAGER');
    expect(await screen.findByRole('heading', { name: 'Transport Requests' })).toBeInTheDocument();
    expect(memory.state.location.pathname).toBe('/manager/requests');
  });

  it('customer logo stays in the workspace and keeps the session', async () => {
    const memory = open('/customer/account', 'CUSTOMER');
    await userEvent
      .setup()
      .click(within(screen.getByRole('complementary')).getByRole('link', { name: 'EquiTransit' }));
    expect(memory.state.location.pathname).toBe('/customer/horses');
    expect(getSession()).not.toBeNull();
  });

  it('public home shows workspace and log out, not Login, when signed in', async () => {
    open('/', 'CUSTOMER');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'My Workspace' })).toHaveAttribute(
      'href',
      '/customer/horses',
    );
    expect(within(nav).getByRole('button', { name: 'Log Out' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
    await userEvent.setup().click(within(nav).getByRole('button', { name: 'Log Out' }));
    expect(getSession()).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Login' })).toBeInTheDocument();
  });
  it.each(['SPECIALIST', 'COORDINATOR'] as const)(
    '/staff/cases renders the FE-19 list for %s',
    async (role) => {
      open('/staff/cases', role);
      expect(await screen.findByRole('heading', { name: 'My Cases' })).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Staff navigation' })).toBeInTheDocument();
    },
  );

  it.each([
    ['/manager/requests/7/availability', 'MANAGER'],
    ['/staff/cases/7/availability', 'COORDINATOR'],
  ] as const)('%s renders the #79 availability probe for %s', async (path, role) => {
    open(path, role);
    expect(
      await screen.findByRole('heading', { name: 'Check resource availability' }),
    ).toBeInTheDocument();
  });

  it('a Specialist cannot open the availability probe', async () => {
    open('/staff/cases/7/availability', 'SPECIALIST');
    expect(await screen.findByText(/do not have access to this workspace/)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Check resource availability' }),
    ).not.toBeInTheDocument();
  });

  it('/customer/requests renders the FE-13 request list', async () => {
    open('/customer/requests', 'CUSTOMER');
    expect(await screen.findByText('Your drafts and submitted requests.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Saved request ID')).not.toBeInTheDocument();
  });
});
