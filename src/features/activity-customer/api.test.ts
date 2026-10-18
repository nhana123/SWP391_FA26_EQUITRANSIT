import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getSession, startSession } from '../../shared/api/session';
import { activityApi } from './api';
import { managerActivityApi } from '../activity-reports/api';
import {
  dashboardFixture,
  notificationFixture,
  notificationsFixture,
  fixtureTime,
} from './testing';
import { financialFixture, auditFixture } from '../activity-reports/testing';

beforeEach(() =>
  startSession({ accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'CUSTOMER' }),
);
afterEach(() => vi.unstubAllGlobals());
function respond(body: unknown, status = 200) {
  const fetch = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('reads a bounded Customer dashboard and strips private data at every DTO boundary', async () => {
  const fetch = respond({
    ...dashboardFixture,
    actualCost: 'private',
    supplierCost: 'private',
    items: [{ ...dashboardFixture.items[0], internalNotes: 'private' }],
    counts: [{ ...dashboardFixture.counts[0], internalNotes: 'private' }],
  });
  const data = await activityApi.dashboard(2);
  expect(fetch.mock.calls[0][0]).toContain('/api/dashboard?page=2&size=20');
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only');
  expect(JSON.stringify(data)).not.toContain('private');
  expect(data).not.toHaveProperty('totalPages');
});
it.each([
  { ...dashboardFixture, role: 'MANAGER' },
  { ...dashboardFixture, totalElements: Number.MAX_SAFE_INTEGER + 1 },
  {
    ...dashboardFixture,
    items: [{ ...dashboardFixture.items[0], orderId: Number.MAX_SAFE_INTEGER + 1 }],
  },
])('fails closed on a wrong actor or unsafe dashboard numbers', async (body) => {
  respond(body);
  await expect(activityApi.dashboard(0)).rejects.toMatchObject({ status: 502 });
});
it('loads recipient notifications without any client recipient or user ID', async () => {
  const fetch = respond({
    ...notificationsFixture,
    userId: 999,
    internalNotes: 'private',
    items: [{ ...notificationFixture, recipientUserId: 999, supplierCost: 'private' }],
  });
  const result = await activityApi.notifications(3, 5);
  expect(fetch.mock.calls[0][0]).toContain('/api/notifications?page=3&size=5');
  expect(JSON.stringify(result)).not.toMatch(/private|recipientUserId|userId/);
});
it('marks the same notification read with bodyless PUT and no command or operation ID', async () => {
  const read = { ...notificationFixture, readAt: fixtureTime };
  const fetch = respond(read);
  expect(await activityApi.read(101)).toEqual(read);
  expect(await activityApi.read(101)).toEqual(read);
  for (const call of fetch.mock.calls) {
    expect(call[0]).toContain('/api/notifications/101/read');
    expect(call[1].method).toBe('PUT');
    expect(call[1].body).toBeUndefined();
    expect(call[1].headers).not.toHaveProperty('Content-Type');
  }
});
it('rejects a mismatched mark-read receipt instead of modifying the wrong cached notification', async () => {
  respond({ ...notificationFixture, notificationId: 999, readAt: fixtureTime });
  await expect(activityApi.read(101)).rejects.toMatchObject({ status: 502 });
});
it.each([true, false])(
  'writes only the explicit enabled=%s preference without a command',
  async (enabled) => {
    const fetch = respond({ enabled });
    expect(await activityApi.savePreference(enabled)).toEqual({ enabled });
    expect(fetch.mock.calls[0][0]).toContain('/api/customers/me/notification-preferences');
    expect(fetch.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ enabled });
  },
);
it('does not convert a missing preference into false or accept a mismatched saved choice', async () => {
  respond({ enabled: null });
  await expect(activityApi.preference()).rejects.toMatchObject({ status: 502 });
  respond({ enabled: false });
  await expect(activityApi.savePreference(true)).rejects.toMatchObject({ status: 502 });
});
it('keeps all seven report values independent and exact beyond the JS integer range', async () => {
  const fetch = respond(financialFixture);
  expect(await managerActivityApi.financial()).toEqual(financialFixture);
  expect(fetch.mock.calls[0][0]).toContain('/api/manager/reports/financial');
});
it('rejects an unsupported report currency rather than converting or relabelling it', async () => {
  respond({ ...financialFixture, currency: 'EUR' });
  await expect(managerActivityApi.financial()).rejects.toMatchObject({ status: 502 });
});
it('reads paginated audit data without any write endpoint', async () => {
  const fetch = respond(auditFixture);
  expect(await managerActivityApi.audit(1)).toEqual(auditFixture);
  expect(fetch.mock.calls[0][0]).toContain('/api/manager/audit-events?page=1&size=20');
  expect(fetch.mock.calls[0][1].method).toBe('GET');
});
it('clears the session on a real client 401 rather than rendering another actor data', async () => {
  respond({ message: 'Expired' }, 401);
  await expect(activityApi.notifications(0)).rejects.toMatchObject({ status: 401 });
  expect(getSession()).toBeNull();
});
