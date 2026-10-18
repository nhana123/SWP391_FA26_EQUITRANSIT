import { test, expect } from '@playwright/test';
import {
  dashboardFixture,
  notificationFixture,
  fixtureTime,
} from '../../src/features/activity-customer/testing';
import { financialFixture, auditFixture } from '../../src/features/activity-reports/testing';
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('Customer reviews dashboard, reads a notification and saves email preference on mobile', async ({
  page,
}, info) => {
  let read = false,
    enabled = false;
  const unexpected: string[] = [];
  const writes: { path: string; body: unknown }[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname;
      if (path === '/api/auth/login')
        return route.fulfill({
          json: { accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'CUSTOMER' },
        });
      if (path === '/api/dashboard')
        return route.fulfill({
          json: {
            ...dashboardFixture,
            counts: [{ ...dashboardFixture.counts[0], count: 1 }],
            totalElements: 1,
          },
        });
      if (path === '/api/notifications')
        return route.fulfill({
          json: {
            items: [{ ...notificationFixture, readAt: read ? fixtureTime : null }],
            totalElements: 1,
            page: 0,
            size: Number(url.searchParams.get('size')),
          },
        });
      if (path === '/api/notifications/101/read' && request.method() === 'PUT') {
        writes.push({ path, body: request.postData() });
        read = true;
        return route.fulfill({ json: { ...notificationFixture, readAt: fixtureTime } });
      }
      if (path === '/api/customers/me/notification-preferences') {
        if (request.method() === 'PUT') {
          const body = request.postDataJSON();
          writes.push({ path, body });
          enabled = body.enabled;
        }
        return route.fulfill({ json: { enabled } });
      }
      unexpected.push(path);
      return route.fulfill({ status: 501, json: { message: 'Unexpected test request' } });
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login?returnTo=%2Fcustomer%2Fdashboard');
  await page.getByLabel('Email address').fill('issue82@example.invalid');
  await page.getByLabel('Password').fill('TestPassword123!');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByRole('heading', { name: 'My dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'TEST-11', exact: true })).toBeVisible();
  await page
    .getByRole('main')
    .screenshot({ path: info.outputPath('customer-dashboard-mocked.png') });
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByText('Unread on this page: 1')).toBeVisible();
  await page.getByRole('link', { name: 'View all notifications' }).click();
  await page.getByRole('button', { name: 'Mark notification 101 as read' }).click();
  await expect(page.getByRole('button', { name: 'Already read' })).toBeDisabled();
  await page.getByRole('link', { name: 'Email preferences', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Receive ordinary order email updates' }).check();
  await page.getByRole('button', { name: 'Save email preference' }).click();
  await expect(page.getByText('Email preference saved.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(writes).toEqual([
    { path: '/api/notifications/101/read', body: null },
    { path: '/api/customers/me/notification-preferences', body: { enabled: true } },
  ]);
  expect(unexpected).toEqual([]);
});

test('Manager reviews distinct financial measures and read-only audit history', async ({
  page,
}, info) => {
  const unexpected: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/login')
        return route.fulfill({
          json: { accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'MANAGER' },
        });
      if (path === '/api/manager/transport-orders')
        return route.fulfill({
          json: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
        });
      if (path === '/api/manager/reports/financial')
        return route.fulfill({ json: financialFixture });
      if (path === '/api/manager/audit-events') return route.fulfill({ json: auditFixture });
      unexpected.push(path);
      return route.fulfill({ status: 501, json: { message: 'Unexpected test request' } });
    },
  );
  await page.goto('/login');
  await page.getByLabel('Email address').fill('issue82@example.invalid');
  await page.getByLabel('Password').fill('TestPassword123!');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page).toHaveURL(/\/manager\/requests$/);
  await page.getByRole('link', { name: 'Financial Report', exact: true }).click();
  await expect(page.getByText('99999999999999999999.99 USD')).toBeVisible();
  await expect(page.locator('dl dt')).toHaveCount(7);
  await page
    .getByRole('main')
    .screenshot({ path: info.outputPath('manager-financial-mocked.png') });
  await page.getByRole('link', { name: 'Audit Events', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
  await page.getByText('View redacted snapshot').click();
  await expect(page.getByText('{"redacted":true}', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /delete|edit|close transport/i })).toHaveCount(0);
  expect(unexpected).toEqual([]);
});
