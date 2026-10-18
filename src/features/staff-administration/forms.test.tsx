import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StaffForm } from './StaffForm';
import { staffApi } from './api';
import { testStaff } from './testing';
import { ApiError } from '../../shared/api/client';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  staffApi: { create: vi.fn(), update: vi.fn(), status: vi.fn() },
}));
beforeEach(() => vi.resetAllMocks());
function mount(mode: 'create' | 'edit' | 'status' = 'create') {
  const onDone = vi.fn().mockResolvedValue(undefined);
  const onReload = vi.fn().mockResolvedValue('00000000000000b2');
  const props = {
    mode,
    initialVersion: mode === 'create' ? '00000000000000b1' : testStaff().recordVersion,
    ...(mode === 'create' ? {} : { staff: testStaff() }),
    onDone,
    onReload,
    onCancel: vi.fn(),
  };
  const result = render(
    <MemoryRouter>
      <StaffForm {...props} />
    </MemoryRouter>,
  );
  return { ...result, props, onDone, onReload, user: userEvent.setup({ delay: null }) };
}
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name'), 'New Staff');
  await user.type(screen.getByLabelText('Staff email'), 'new@example.invalid');
  await user.type(screen.getByLabelText('Employee code'), 'NEW-31');
  await user.type(screen.getByLabelText('Initial password'), 'TestPassword123!');
}
it('creates using the actor version, four internal roles and optional nulls; clears the password', async () => {
  vi.mocked(staffApi.create).mockResolvedValue(testStaff());
  const { user, onDone } = mount();
  await fill(user);
  expect(
    [...screen.getByLabelText<HTMLSelectElement>('Staff role').options].map((o) => o.value),
  ).toEqual(['MANAGER', 'SPECIALIST', 'COORDINATOR', 'DRIVER']);
  expect(screen.getByLabelText('Initial password')).toHaveAttribute('type', 'password');
  await user.click(screen.getByRole('button', { name: 'Create staff account' }));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(staffApi.create).toHaveBeenCalledWith({
    command: { recordVersion: '00000000000000b1', operationId: expect.any(String) },
    profile: {
      email: 'new@example.invalid',
      fullName: 'New Staff',
      employeeCode: 'NEW-31',
      role: 'SPECIALIST',
      phone: null,
      department: null,
      specialization: null,
    },
    initialPassword: 'TestPassword123!',
  });
  expect(screen.getByLabelText('Initial password')).toHaveValue('');
});
it('edits the complete target profile with its Staff ID/version and no password field', async () => {
  vi.mocked(staffApi.update).mockResolvedValue(testStaff());
  const { user } = mount('edit');
  expect(screen.queryByLabelText('Initial password')).toBeNull();
  await user.clear(screen.getByLabelText('Department (optional)'));
  await user.click(screen.getByRole('button', { name: 'Edit staff profile' }));
  await waitFor(() =>
    expect(staffApi.update).toHaveBeenCalledWith(31, {
      command: { recordVersion: testStaff().recordVersion, operationId: expect.any(String) },
      profile: {
        email: testStaff().email,
        fullName: testStaff().fullName,
        employeeCode: 'TEST-31',
        role: 'SPECIALIST',
        phone: null,
        department: null,
        specialization: null,
      },
    }),
  );
});
it('does not adopt a background actor version until explicit reload after conflict', async () => {
  vi.mocked(staffApi.create).mockRejectedValue(
    new ApiError(409, 'Reload staff.', 'STAFF_VERSION_CONFLICT'),
  );
  const { user, rerender, props } = mount();
  await fill(user);
  rerender(
    <MemoryRouter>
      <StaffForm {...props} initialVersion="00000000000000b9" />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Create staff account' }));
  await screen.findByText(/The staff profile changed/);
  expect(vi.mocked(staffApi.create).mock.calls[0][0].command.recordVersion).toBe(
    '00000000000000b1',
  );
  expect(screen.getByRole('button', { name: 'Create staff account' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Reload and review' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create staff account' })).toBeEnabled(),
  );
  expect(screen.getByLabelText('Initial password')).toHaveValue('TestPassword123!');
  await user.click(screen.getByRole('button', { name: 'Create staff account' }));
  await waitFor(() => expect(staffApi.create).toHaveBeenCalledTimes(2));
  const [first, second] = vi.mocked(staffApi.create).mock.calls;
  expect(second[0].command.recordVersion).toBe('00000000000000b2');
  expect(second[0].command.operationId).not.toBe(first[0].command.operationId);
});
it.each([0, 503, 409])(
  'retains the exact create command and password for retry after %s',
  async (status) => {
    vi.mocked(staffApi.create)
      .mockRejectedValueOnce(
        new ApiError(status, 'Retry later.', status === 409 ? 'STAFF_ADMIN_BUSY' : undefined),
      )
      .mockResolvedValueOnce(testStaff());
    const { user, onDone } = mount();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create staff account' }));
    const retry = await screen.findByRole('button', { name: 'Retry the same action' });
    expect(screen.getByLabelText('Staff email')).toBeDisabled();
    expect(screen.getByLabelText('Initial password')).toHaveValue('TestPassword123!');
    if (status === 503) expect(screen.getByText(/Deployment blocked/)).toBeInTheDocument();
    await user.click(retry);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const calls = vi.mocked(staffApi.create).mock.calls;
    expect(calls[1][0]).toEqual(calls[0][0]);
  },
);
it.each([
  ['LAST_ACTIVE_MANAGER_PROTECTED', /At least one other active Manager/],
  ['DRIVER_IN_TRANSIT', /Reassign the in-transit driver/],
  ['STAFF_ASSIGNMENT_ROLE_CONFLICT', /End or reassign incompatible/],
  ['STAFF_DUPLICATE', /email or employee code already exists/],
] as const)('explains %s and requires review before another write', async (code, message) => {
  vi.mocked(staffApi.update).mockRejectedValue(new ApiError(409, 'Staff action rejected.', code));
  const { user } = mount('edit');
  await user.click(screen.getByRole('button', { name: 'Edit staff profile' }));
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit staff profile' })).toBeDisabled();
  expect(screen.getByLabelText('Employee code')).toHaveValue('TEST-31');
});
it('requires a reason before changing status and uses the target version', async () => {
  vi.mocked(staffApi.status).mockResolvedValue(
    testStaff({ staffStatus: 'INACTIVE', accountStatus: 'INACTIVE' }),
  );
  const { user } = mount('status');
  await user.click(screen.getByRole('button', { name: 'Change account status' }));
  expect(await screen.findByText(/Enter a reason/)).toBeInTheDocument();
  expect(staffApi.status).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Reason for status change'), 'Moved team');
  await user.click(screen.getByRole('button', { name: 'Change account status' }));
  await waitFor(() =>
    expect(staffApi.status).toHaveBeenCalledWith(31, {
      command: { recordVersion: testStaff().recordVersion, operationId: expect.any(String) },
      status: 'INACTIVE',
      reason: 'Moved team',
    }),
  );
});
it('hides actions and inputs after the server rejects Manager authority', async () => {
  vi.mocked(staffApi.create).mockRejectedValue(new ApiError(403, 'Active Manager required.'));
  const { user } = mount();
  await fill(user);
  await user.click(screen.getByRole('button', { name: 'Create staff account' }));
  expect(
    await screen.findByRole('link', { name: 'Back to staff administration' }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('Initial password')).toBeNull();
});
