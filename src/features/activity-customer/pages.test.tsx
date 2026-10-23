import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ApiError } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query';
import { getSession, startSession } from '../../shared/api/session';
import type { Role } from '../../shared/api/contracts';
import { activityApi } from './api';
import { CustomerDashboardPage } from './dashboard';
import { NotificationBell, NotificationsPage } from './notifications';
import { activityKeys } from './shared';
import {
  dashboardFixture,
  notificationFixture,
  notificationsFixture,
  fixtureTime,
} from './testing';
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  activityApi: { dashboard: vi.fn(), notifications: vi.fn(), read: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
  queryClient.clear();
  vi.mocked(activityApi.dashboard).mockResolvedValue(dashboardFixture);
  vi.mocked(activityApi.notifications).mockResolvedValue(notificationsFixture);
  vi.mocked(activityApi.read).mockResolvedValue({ ...notificationFixture, readAt: fixtureTime });
});
function mount(node: ReactNode, role: Role = 'CUSTOMER', path = '/') {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, user: userEvent.setup({ delay: null }) };
}
it('shows server-wide status counts rather than deriving counts from the current page', async () => {
  mount(<CustomerDashboardPage />);
  expect(await screen.findByRole('table', { name: 'Dashboard requests' })).toHaveTextContent(
    'TEST-11',
  );
  expect(screen.getByText('24', { selector: 'dd' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'TEST-11' })).toHaveAttribute(
    'href',
    '/customer/requests/11',
  );
  expect(document.body).not.toHaveTextContent(/actual cost|supplier|internal notes|margin/i);
});
it.each(['MANAGER', 'SPECIALIST', 'COORDINATOR', 'DRIVER'] as const)(
  'does not request Customer dashboard data for %s',
  (role) => {
    mount(<CustomerDashboardPage />, role);
    expect(activityApi.dashboard).not.toHaveBeenCalled();
  },
);
it('links each request with an open legal file straight to its documents', async () => {
  vi.mocked(activityApi.dashboard).mockResolvedValue({
    ...dashboardFixture,
    items: [
      ...dashboardFixture.items,
      { orderId: 12, orderNumber: 'TEST-12', status: 'IN_PREPARATION' },
    ],
  });
  mount(<CustomerDashboardPage />);
  const banner = await screen.findByRole('region', { name: 'Legal documents' });
  expect(
    within(banner).getByRole('link', { name: 'TEST-12: Legal documents (submit / track review)' }),
  ).toHaveAttribute('href', '/customer/requests/12/compliance');
  // A request still under review has no legal file yet.
  expect(within(banner).queryByText(/TEST-11/)).toBeNull();
});

it('uses the server total for pagination and permits returning from an empty later page', async () => {
  vi.mocked(activityApi.dashboard).mockImplementation(async (page) =>
    page === 0 ? dashboardFixture : { ...dashboardFixture, items: [], page, totalElements: 0 },
  );
  const { user } = mount(<CustomerDashboardPage />);
  await screen.findByRole('table');
  await user.click(screen.getByRole('button', { name: 'Next activity page' }));
  await screen.findByText('No transport requests on this page.');
  expect(screen.getByRole('button', { name: 'Previous activity page' })).toBeEnabled();
});
it.each([403, 404, 503])(
  'shows dashboard %s as an error rather than an empty request list',
  async (status) => {
    vi.mocked(activityApi.dashboard).mockRejectedValue(
      new ApiError(status, 'Private backend detail.'),
    );
    mount(<CustomerDashboardPage />);
    await screen.findByRole('alert');
    expect(screen.queryByText('No transport requests on this page.')).toBeNull();
    expect(screen.queryByText('Private backend detail.')).toBeNull();
  },
);
it.each(['-1', '1e2', '2147483648'])(
  'rejects invalid page %s before making a dashboard request',
  (page) => {
    mount(<CustomerDashboardPage />, 'CUSTOMER', `/?page=${page}`);
    expect(screen.getByRole('button', { name: 'Reset pagination' })).toBeInTheDocument();
    expect(activityApi.dashboard).not.toHaveBeenCalled();
  },
);
it('mounts a closed bell without fetching or requiring a query provider', () => {
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'CUSTOMER' });
  render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(activityApi.notifications).not.toHaveBeenCalled();
});
it('loads the bell on demand and labels its unread count as page-local', async () => {
  vi.mocked(activityApi.notifications).mockResolvedValue({
    ...notificationsFixture,
    items: [notificationFixture],
    totalElements: 120,
    size: 5,
  });
  const { user } = mount(<NotificationBell />);
  await user.click(screen.getByRole('button', { name: 'Notifications' }));
  expect(await screen.findByText('Unread on this page: 1')).toBeInTheDocument();
  expect(activityApi.notifications).toHaveBeenCalledWith(0, 5, expect.any(AbortSignal));
  expect(screen.getByRole('link', { name: 'View all notifications' })).toHaveAttribute(
    'href',
    '/notifications',
  );
});
it('marks a notification read explicitly and updates every cached page with the server read timestamp', async () => {
  const { user } = mount(<NotificationsPage />);
  await screen.findByText('Test order update');
  const s = getSession()!;
  const peekKey = [...activityKeys.notifications(s.generation, s.role), 0, 5];
  queryClient.setQueryData(peekKey, { ...notificationsFixture, size: 5 });
  expect(activityApi.read).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Mark notification 101 as read' }));
  await screen.findByText('Notification 101 marked as read.');
  expect(activityApi.read).toHaveBeenCalledWith(101);
  expect(screen.getByRole('button', { name: 'Already read' })).toBeDisabled();
  expect(queryClient.getQueryData<typeof notificationsFixture>(peekKey)?.items[0].readAt).toBe(
    fixtureTime,
  );
});
it.each([0, 503])(
  'retries only the same mark-read target after an uncertain %s',
  async (status) => {
    vi.mocked(activityApi.read)
      .mockRejectedValueOnce(new ApiError(status, 'Uncertain.'))
      .mockResolvedValueOnce({ ...notificationFixture, readAt: fixtureTime });
    const { user } = mount(<NotificationsPage />);
    await user.click(await screen.findByRole('button', { name: 'Mark notification 101 as read' }));
    expect(screen.getByRole('button', { name: 'Mark notification 102 as read' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next activity page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry marking notification as read' }));
    await screen.findByText('Notification 101 marked as read.');
    expect(vi.mocked(activityApi.read).mock.calls).toEqual([[101], [101]]);
  },
);
it.each([403, 404])('hides cached notifications after mark-read returns %s', async (status) => {
  vi.mocked(activityApi.read).mockRejectedValue(new ApiError(status, 'Denied.'));
  const { user } = mount(<NotificationsPage />);
  await user.click(await screen.findByRole('button', { name: 'Mark notification 101 as read' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Test order update')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Mark notification 102 as read' })).toBeNull();
});
it.each([403, 404])(
  'hides an uncertain mark-read retry when a later GET revokes access with %s',
  async (status) => {
    vi.mocked(activityApi.read).mockRejectedValueOnce(new ApiError(0, 'Uncertain.'));
    const { user } = mount(<NotificationsPage />);
    await user.click(await screen.findByRole('button', { name: 'Mark notification 101 as read' }));
    await screen.findByRole('button', { name: 'Retry marking notification as read' });
    const current = getSession()!;
    const prefix = activityKeys.notifications(current.generation, current.role);
    vi.mocked(activityApi.notifications).mockRejectedValueOnce(new ApiError(status, 'Revoked.'));
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: prefix });
    });
    await screen.findByText(
      status === 403
        ? 'You do not have access to this activity.'
        : 'This activity is no longer available to your account.',
    );
    expect(screen.queryByRole('button', { name: 'Retry marking notification as read' })).toBeNull();
    expect(screen.queryByText('Test order update')).toBeNull();
    expect(activityApi.read).toHaveBeenCalledTimes(1);

    // A successful authorized GET restores only the original idempotent retry.
    vi.mocked(activityApi.notifications).mockResolvedValue(notificationsFixture);
    vi.mocked(activityApi.read).mockResolvedValue({ ...notificationFixture, readAt: fixtureTime });
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: prefix });
    });
    await user.click(
      await screen.findByRole('button', { name: 'Retry marking notification as read' }),
    );
    await screen.findByText('Notification 101 marked as read.');
    expect(vi.mocked(activityApi.read).mock.calls).toEqual([[101], [101]]);
  },
);
it.each([403, 404])(
  'hides conflict recovery when a later GET revokes notification access with %s',
  async (status) => {
    vi.mocked(activityApi.read).mockRejectedValueOnce(new ApiError(409, 'Changed.'));
    const { user } = mount(<NotificationsPage />);
    await user.click(await screen.findByRole('button', { name: 'Mark notification 101 as read' }));
    await screen.findByRole('button', { name: 'Reload notifications and review' });
    const current = getSession()!;
    vi.mocked(activityApi.notifications).mockRejectedValueOnce(new ApiError(status, 'Revoked.'));
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: activityKeys.notifications(current.generation, current.role),
      });
    });
    await screen.findByText(
      status === 403
        ? 'You do not have access to this activity.'
        : 'This activity is no longer available to your account.',
    );
    expect(screen.queryByRole('button', { name: 'Reload notifications and review' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark notification 102 as read' })).toBeNull();
    expect(activityApi.read).toHaveBeenCalledTimes(1);
  },
);
it('does not reuse the previous recipient notifications after an account switch', async () => {
  mount(<NotificationsPage />);
  await screen.findByText('Test order update');
  const oldGeneration = getSession()!.generation;
  vi.mocked(activityApi.notifications).mockResolvedValue({
    ...notificationsFixture,
    items: [],
    totalElements: 0,
  });
  await act(async () =>
    startSession({
      accessToken: 'second-test-only',
      tokenType: 'Bearer',
      expiresIn: 600,
      role: 'CUSTOMER',
    }),
  );
  await screen.findByText('No notifications on this page.');
  expect(screen.queryByText('Test order update')).toBeNull();
  expect(
    queryClient.getQueriesData({ queryKey: activityKeys.all(oldGeneration, 'CUSTOMER') }),
  ).toEqual([]);
});
it('renders message text safely without treating it as HTML', async () => {
  vi.mocked(activityApi.notifications).mockResolvedValue({
    ...notificationsFixture,
    items: [{ ...notificationFixture, message: '<img src=x onerror=alert(1)>' }],
  });
  mount(<NotificationsPage />);
  expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(document.querySelector('img')).toBeNull();
});
it('does not offer a nonexistent Driver order-detail link', async () => {
  mount(<NotificationsPage />, 'DRIVER');
  await screen.findByText('Test order update');
  expect(screen.queryByRole('link', { name: 'Open request 11' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Email preferences' })).toBeNull();
});
