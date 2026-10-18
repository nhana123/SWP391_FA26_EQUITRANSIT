import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { staffApi } from './api';
import { staffSchema, staffPageSchema } from './contracts';
import { testStaff, testStaffPage } from './testing';
import { profileOf, validateProfile } from './form';
import { getSession, startSession } from '../../shared/api/session';

const command = {
  recordVersion: '00000000000000b1',
  operationId: '54ee52b8-5df5-49ac-b681-f66122b6f768',
};
beforeEach(() =>
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'MANAGER' }),
);
afterEach(() => vi.unstubAllGlobals());
function response(data: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('uses bounded zero-based paging and exact role/status filters', async () => {
  const fetch = response(testStaffPage());
  await staffApi.list({ page: 2, role: 'DRIVER', status: 'LOCKED' });
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.pathname).toBe('/api/manager/staff');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    page: '2',
    size: '20',
    role: 'DRIVER',
    status: 'LOCKED',
  });
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only');
});
it('creates with a nested Manager command and never caches password in the response', async () => {
  const secret = 'TestCredential123!';
  const fetch = response({ ...testStaff(), initialPassword: secret, passwordHash: 'private' });
  const body = { command, profile: profileOf(testStaff()), initialPassword: secret };
  const receipt = await staffApi.create(body);
  expect(fetch.mock.calls[0][1].method).toBe('POST');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body);
  expect(receipt).not.toHaveProperty('initialPassword');
  expect(receipt).not.toHaveProperty('passwordHash');
});
it('updates a Staff ID with a full profile and target command, without password', async () => {
  const fetch = response(testStaff());
  const body = {
    command: { ...command, recordVersion: testStaff().recordVersion },
    profile: profileOf(testStaff()),
  };
  await staffApi.update(31, body);
  expect(fetch.mock.calls[0][0]).toContain('/staff/31');
  expect(fetch.mock.calls[0][1].method).toBe('PUT');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body);
});
it('posts status with target version and reason', async () => {
  const fetch = response(testStaff());
  const body = { command, status: 'INACTIVE' as const, reason: 'Transferred team' };
  await staffApi.status(31, body);
  expect(fetch.mock.calls[0][0]).toContain('/staff/31/status');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body);
});
it('sanitizes backend credential echoes and normalizes profile field errors', async () => {
  response(
    {
      message: 'Rejected secret-value',
      code: 'secret-value',
      fields: { initialPassword: 'secret-value', 'profile.email': 'secret-value' },
    },
    400,
  );
  await expect(
    staffApi.create({ command, profile: profileOf(testStaff()), initialPassword: 'secret-value' }),
  ).rejects.toMatchObject({
    status: 400,
    code: undefined,
    fields: { initialPassword: expect.any(String), email: expect.any(String) },
  });
  try {
    await staffApi.get(31);
  } catch (error) {
    expect(JSON.stringify(error)).not.toContain('secret-value');
  }
});
it('clears the session on 401 and reports 503 as deployment blocked', async () => {
  response({}, 503);
  await expect(staffApi.list()).rejects.toMatchObject({
    status: 503,
    message: expect.stringMatching(/Deployment blocked/),
  });
  response({}, 401);
  await expect(staffApi.list()).rejects.toMatchObject({ status: 401 });
  expect(getSession()).toBeNull();
});
it('accepts StaffPage without totalPages and separates Staff ID from User ID', () => {
  expect(staffPageSchema.parse(testStaffPage()).totalElements).toBe(1);
  expect(staffSchema.parse(testStaff()).staffId).not.toBe(testStaff().userId);
  expect(staffSchema.safeParse({ ...testStaff(), role: 'CUSTOMER' }).success).toBe(false);
});
it('validates UTF-8 password bytes and internal profile constraints', () => {
  const profile = profileOf(testStaff());
  expect(validateProfile(profile, '😀'.repeat(19))).toHaveProperty('initialPassword');
  expect(validateProfile(profile, 'short')).toHaveProperty('initialPassword');
  expect(validateProfile(profile, 'a'.repeat(73))).toHaveProperty('initialPassword');
  expect(validateProfile(profile, 'TestPassword123!')).toEqual({});
  expect(validateProfile({ ...profile, phone: '0912345678', employeeCode: '' })).toHaveProperty(
    'phone',
  );
});
