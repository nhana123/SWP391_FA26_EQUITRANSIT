import { test, expect } from '@playwright/test';
import { quotation, pageOf } from '../../src/features/quotations/testing';
import { testOrder } from '../../src/features/booking-services/testing';

for (const role of ['CUSTOMER', 'MANAGER'] as const) {
  test(`${role} opens quotations from its request UI and reads a safe snapshot`, async ({
    page,
  }) => {
    if (role === 'CUSTOMER') await page.setViewportSize({ width: 390, height: 844 });
    const unexpected: string[] = [];
    const empty = { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 };
    const order = testOrder({ orderId: 9, orderNumber: 'TEST-9' });
    const current = {
      orderId: 9,
      orderNumber: 'TEST-9',
      orderStatus: 'SUBMITTED',
      recordVersion: '0000000000000001',
      currentRevisionId: null,
      revision: null,
      decision: null,
      assignments: [],
    };
    const caseRow = {
      orderId: 9,
      orderNumber: 'TEST-9',
      orderStatus: 'SUBMITTED',
      recordVersion: '0000000000000001',
      currentRevisionId: null,
      originCountryCode: 'VN',
      destinationCountryCode: 'GB',
      deliveryDeadline: null,
    };
    // Vite also serves modules under /src/shared/api/. Only mock backend paths.
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === '/api/auth/login')
          await route.fulfill({
            json: { accessToken: 'browser-test-only', tokenType: 'Bearer', expiresIn: 120, role },
          });
        else if (path === '/api/horses') await route.fulfill({ json: empty });
        else if (path === '/api/transport-orders')
          await route.fulfill({
            json: { ...empty, items: [order], totalElements: 1, totalPages: 1 },
          });
        else if (path === '/api/transport-orders/9') await route.fulfill({ json: order });
        else if (path === '/api/transport-orders/9/quotes') await route.fulfill({ json: pageOf() });
        else if (path === '/api/transport-orders/9/quotes/31')
          await route.fulfill({
            json: {
              ...quotation,
              terms: '<img src=x onerror=alert(1)>',
              purchaseCost: 'PRIVATE-PURCHASE-COST',
              internalNotes: 'PRIVATE-INTERNAL-NOTES',
            },
          });
        else if (path === '/api/manager/transport-orders' || path === '/api/staff/transport-orders')
          await route.fulfill({
            json: { ...empty, items: [caseRow], totalElements: 1, totalPages: 1 },
          });
        else if (
          path === '/api/manager/transport-orders/9' ||
          path === '/api/staff/transport-orders/9'
        )
          await route.fulfill({ json: current });
        else if (/\/9\/(decisions|assignments|revisions)$/.test(path))
          await route.fulfill({ json: [] });
        else if (/^\/api\/activity\/orders\/\d+\/timeline$/.test(path))
          await route.fulfill({ json: { orderId: 9, items: [], page: 0, size: 20 } });
        else {
          unexpected.push(path);

          await route.fulfill({ status: 501, json: { message: 'Unexpected test request' } });
        }
      },
    );
    await page.goto('/login');
    await page.getByLabel('Email address').fill('quotation-test@example.invalid');
    await page.getByLabel('Password').fill('TestPassword123!');
    await page.getByRole('button', { name: 'Log In' }).click();
    if (role === 'CUSTOMER') {
      await expect(page.getByRole('heading', { name: 'My Horses' })).toBeVisible();
      await page.getByRole('button', { name: 'Toggle navigation' }).click();
      await page.getByRole('link', { name: 'Requests', exact: true }).click();
    }
    await page.getByRole('link', { name: 'TEST-9', exact: true }).click();
    await page.getByRole('link', { name: 'Quotations', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Quotations', exact: true })).toBeVisible();
    await expect(page.getByText('Page 1 of 1')).toBeVisible();
    await page.getByRole('link', { name: 'Q-9-2' }).click();
    await expect(page.getByRole('heading', { name: 'Quotation details' })).toBeVisible();
    await expect(page.getByText('100.125', { exact: true })).toBeVisible();
    await expect(page.getByText('200.25', { exact: true })).toBeVisible();
    await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    await expect(page.locator('.quotation-terms img')).toHaveCount(0);
    await expect(page.getByText(/PRIVATE-/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /pay|accept|issue/i })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(unexpected).toEqual([]);
  });
}
