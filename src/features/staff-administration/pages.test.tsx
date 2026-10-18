import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StaffAdministrationPage, StaffAdministrationDetailPage, CreateStaffPage } from './pages';
import { staffApi, staffKeys } from './api';
import { testStaff, testStaffPage } from './testing';
import { getSession, startSession } from '../../shared/api/session';
import { queryClient } from '../../shared/api/query';
import { ApiError } from '../../shared/api/client';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  staffApi: { list: vi.fn(), get: vi.fn(), update: vi.fn(), create: vi.fn(), status: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
  queryClient.clear();
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'MANAGER' });
  vi.mocked(staffApi.list).mockResolvedValue(testStaffPage());
  vi.mocked(staffApi.get).mockResolvedValue(testStaff());
});
function mount(path = '/manager/staff-administration') {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/manager/staff-administration" element={<StaffAdministrationPage />} />
          <Route path="/manager/staff-administration/new" element={<CreateStaffPage />} />
          <Route
            path="/manager/staff-administration/:staffId"
            element={<StaffAdministrationDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ delay: null });
}
it('links list, detail and create screens and displays separate IDs and workloads', async () => {
  const user = mount();
  const table = await screen.findByRole('table', { name: 'Staff accounts' });
  expect(within(table).getByText('31 / 81')).toBeInTheDocument();
  expect(within(table).getByText('2 / 0 / 2')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Create staff account' })).toHaveAttribute(
    'href',
    '/manager/staff-administration/new',
  );
  await user.click(screen.getByRole('link', { name: 'View Test Specialist' }));
  expect(await screen.findByRole('button', { name: 'Edit profile' })).toBeInTheDocument();
  expect(staffApi.get).toHaveBeenCalledWith(31, expect.any(AbortSignal));
});
it('filters by all four roles and account status, with pagination derived from totalElements', async () => {
  vi.mocked(staffApi.list).mockImplementation(async (filters) =>
    testStaffPage({ page: filters?.page ?? 0, totalElements: 41 }),
  );
  const user = mount();
  await screen.findByRole('table');
  await user.selectOptions(screen.getByLabelText('Filter staff role'), 'DRIVER');
  await user.selectOptions(screen.getByLabelText('Filter account status'), 'LOCKED');
  await screen.findByText('Page 1 of 3');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2 of 3');
  expect(staffApi.list).toHaveBeenCalledWith(
    { page: 1, role: 'DRIVER', status: 'LOCKED' },
    expect.any(AbortSignal),
  );
});
it.each(['CUSTOMER', 'SPECIALIST', 'COORDINATOR', 'DRIVER'] as const)(
  'does not read private staff data for %s',
  async (role) => {
    startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role });
    mount();
    expect(await screen.findByText(/Only an active Manager/)).toBeInTheDocument();
    expect(staffApi.list).not.toHaveBeenCalled();
  },
);
it.each([403, 503])(
  'shows a blocked list with no create action or false empty state after %s',
  async (status) => {
    vi.mocked(staffApi.list).mockRejectedValue(new ApiError(status, 'Staff unavailable.'));
    mount();
    expect(await screen.findByText('Staff unavailable.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create staff account' })).toBeNull();
    expect(screen.queryByText('No staff match these filters.')).toBeNull();
  },
);
it('preserves create inputs during a background schema error, then explicitly reloads the actor version', async () => {
  const user = mount('/manager/staff-administration/new');
  await user.type(await screen.findByLabelText('Full name'), 'Preserved Staff');
  await user.type(screen.getByLabelText('Initial password'), 'TestPassword123!');
  vi.mocked(staffApi.list).mockRejectedValue(new ApiError(503, 'Schema pending.'));
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: staffKeys.all(getSession()!.generation) });
  });
  await screen.findByText('Schema pending.');
  expect(screen.getByLabelText('Full name')).toHaveValue('Preserved Staff');
  expect(screen.getByLabelText('Initial password')).toHaveValue('TestPassword123!');
  expect(screen.getByRole('button', { name: 'Create staff account' })).toBeDisabled();
  vi.mocked(staffApi.list).mockResolvedValue(
    testStaffPage({ actorRecordVersion: '00000000000000b2' }),
  );
  await user.click(screen.getByRole('button', { name: 'Reload and review' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create staff account' })).toBeEnabled(),
  );
  expect(staffApi.create).not.toHaveBeenCalled();
});
it('ends the local session when the acting Manager disables their own account', async () => {
  const manager = testStaff({ staffId: 11, role: 'MANAGER' });
  vi.mocked(staffApi.get).mockResolvedValue(manager);
  vi.mocked(staffApi.status).mockResolvedValue({
    ...manager,
    accountStatus: 'INACTIVE',
    staffStatus: 'INACTIVE',
  });
  const user = mount('/manager/staff-administration/11');
  await user.click(await screen.findByRole('button', { name: 'Change status' }));
  await user.type(screen.getByLabelText('Reason for status change'), 'Transferred role');
  await user.click(screen.getByRole('button', { name: 'Change account status' }));
  await waitFor(() => expect(getSession()).toBeNull());
  expect(screen.queryByLabelText('Reason for status change')).toBeNull();
});
