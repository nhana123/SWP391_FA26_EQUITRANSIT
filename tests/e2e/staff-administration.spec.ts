import { test, expect } from '@playwright/test';
import { testStaff, testStaffPage } from '../../src/features/staff-administration/testing';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('Manager creates staff through navigation and retries 503 without changing the command', async ({
  page,
}, info) => {
  let firstBody: Record<string, unknown> | undefined;
  let sameAction = false;
  let creates = 0;
  const unexpected: string[] = [];
  const created = testStaff({
    staffId: 32,
    userId: 82,
    fullName: 'New Test Staff',
    email: 'new@example.invalid',
    employeeCode: 'TEST-32',
    role: 'DRIVER',
  });
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (path === '/api/auth/login')
        return route.fulfill({
          json: { accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'MANAGER' },
        });
      if (path === '/api/manager/transport-orders')
        return route.fulfill({
          json: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
        });
      if (path === '/api/manager/staff' && req.method() === 'GET')
        return route.fulfill({ json: testStaffPage() });
      if (path === '/api/manager/staff' && req.method() === 'POST') {
        creates++;
        const body = req.postDataJSON();
        if (creates === 1) {
          firstBody = body;
          return route.fulfill({
            status: 503,
            json: { code: 'STAFF_SCHEMA_PENDING', message: 'Deploy staff schema.' },
          });
        }
        sameAction = JSON.stringify(firstBody) === JSON.stringify(body);
        return route.fulfill({ json: created });
      }
      if (path === '/api/manager/staff/32') return route.fulfill({ json: created });
      unexpected.push(path);
      return route.fulfill({ status: 501, json: { message: 'Unexpected test request' } });
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Email address').fill('issue75@example.invalid');
  await page.getByLabel('Password').fill('TestPassword123!');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page).toHaveURL(/\/manager\/requests$/);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('link', { name: 'Staff Administration', exact: true }).click();
  await page.getByRole('link', { name: 'Create staff account' }).click();
  await page.getByLabel('Full name').fill('New Test Staff');
  await page.getByLabel('Staff email').fill('new@example.invalid');
  await page.getByLabel('Employee code').fill('TEST-32');
  await page.getByLabel('Staff role').selectOption('DRIVER');
  await page.getByLabel('Initial password').fill('TestPassword123!');
  await page.getByRole('form').screenshot({
    path: info.outputPath('staff-create-mocked.png'),
    mask: [page.getByLabel('Initial password')],
  });
  await page.getByRole('button', { name: 'Create staff account', exact: true }).click();
  await expect(page.getByText('STAFF_SCHEMA_PENDING', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Staff email')).toHaveValue('new@example.invalid');
  await expect(page.getByLabel('Staff email')).toBeDisabled();
  await page.getByRole('button', { name: 'Retry the same action' }).click();
  await expect(page).toHaveURL(/\/staff-administration\/32$/);
  await expect(page.getByRole('heading', { name: 'New Test Staff' })).toBeVisible();
  expect(creates).toBe(2);
  expect(sameAction).toBe(true);
  expect(unexpected).toEqual([]);
});

test('Manager publishes a successor using SHIPMENT and the reviewed tariff version', async ({
  page,
}, info) => {
  const writes: Record<string, unknown>[] = [];
  let published = false;
  const tariff = {
    tariffId: 31,
    product: 'ROAD_TRANSPORT',
    unit: 'KM',
    unitPrice: '2.00',
    currency: 'USD',
    version: 1,
    effectiveFrom: '2026-01-01T00:00:00Z',
    effectiveTo: null,
    status: 'ACTIVE',
    sourceReference: 'Test approval',
    sourceReviewRequired: false,
    recordVersion: '00000000000000a1',
  };
  const successor = {
    ...tariff,
    tariffId: 32,
    unit: 'SHIPMENT',
    unitPrice: '150.00',
    version: 2,
    recordVersion: '00000000000000a2',
  };
  const unexpected: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (path === '/api/auth/login')
        return route.fulfill({
          json: { accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'MANAGER' },
        });
      if (path === '/api/manager/transport-orders')
        return route.fulfill({
          json: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
        });
      if (path === '/api/manager/service-tariffs/products')
        return route.fulfill({
          json: [
            {
              product: 'ROAD_TRANSPORT',
              uiSection: 'TRANSPORTATION',
              unit: published ? 'SHIPMENT' : 'KM',
              unitRate: published ? '150.00' : '2.00',
              currency: 'USD',
              pricingMode: 'RATE',
              tariffId: published ? 32 : 31,
              tariffVersion: published ? 2 : 1,
              allowedUnits: ['KM', 'SHIPMENT'],
            },
          ],
        });
      if (path === '/api/manager/service-tariffs')
        return route.fulfill({
          json: {
            items: published ? [successor, tariff] : [tariff],
            page: 0,
            size: 20,
            totalElements: published ? 2 : 1,
            totalPages: 1,
          },
        });
      if (path === '/api/manager/service-tariffs/31' && req.method() === 'GET')
        return route.fulfill({ json: tariff });
      if (path === '/api/manager/service-tariffs/31' && req.method() === 'PUT') {
        writes.push(req.postDataJSON());
        published = true;
        return route.fulfill({ json: successor });
      }
      unexpected.push(path);
      return route.fulfill({ status: 501, json: { message: 'Unexpected test request' } });
    },
  );
  await page.goto('/login');
  await page.getByLabel('Email address').fill('issue75@example.invalid');
  await page.getByLabel('Password').fill('TestPassword123!');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page).toHaveURL(/\/manager\/requests$/);
  await page.getByRole('link', { name: 'Service Prices', exact: true }).click();
  await page
    .getByRole('table', { name: 'Service products' })
    .getByRole('button', { name: 'Replace price' })
    .click();
  await page.getByLabel('Price unit').selectOption('SHIPMENT');
  await page.getByLabel('Unit price (USD)').fill('150.00');
  await page.getByLabel('Source reference (internal)').fill('Test approval');
  await page.getByRole('form').screenshot({ path: info.outputPath('tariff-shipment-mocked.png') });
  await page.getByRole('button', { name: 'Publish replacement' }).click();
  await expect(page.getByText(/Published Road transport version 2/)).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    unitCode: 'SHIPMENT',
    recordVersion: tariff.recordVersion,
    operationId: expect.any(String),
  });
  expect(writes[0]).not.toHaveProperty('command');
  expect(unexpected).toEqual([]);
});
