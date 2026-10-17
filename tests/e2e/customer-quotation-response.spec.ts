import { test, expect } from '@playwright/test';
import { quotation } from '../../src/features/quotations/testing';
import { testOrder } from '../../src/features/booking-services/testing';

for (const action of ['ACCEPT', 'REJECT'] as const) {
  test(`Customer explicitly confirms ${action} without payment or booking side effects`, async ({
    page,
  }) => {
    let detail = {
      ...quotation,
      quote: { ...quotation.quote, validUntil: '2099-01-01T00:00:00Z' },
    };
    let order = testOrder({
      orderId: 9,
      orderStatus: 'APPROVED',
      currentRevisionId: detail.quote.revisionId,
      recordVersion: detail.recordVersion,
    });
    const writes: { path: string; body: unknown }[] = [];
    const unexpected: string[] = [];
    let reads = 0;
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() === 'POST') {
          if (path === '/api/auth/login') {
            await route.fulfill({
              json: {
                accessToken: 'browser-test-only',
                tokenType: 'Bearer',
                expiresIn: 600,
                role: 'CUSTOMER',
              },
            });
          } else if (path === '/api/transport-orders/9/quotes/31/actions') {
            const body = request.postDataJSON();
            writes.push({ path, body });
            const receipt = detail;
            detail = {
              ...detail,
              quote: { ...detail.quote, status: action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED' },
              acceptedAt: action === 'ACCEPT' ? '2026-10-17T02:00:00Z' : null,
              recordVersion: '00000000000000a3',
            };
            order = { ...order, recordVersion: detail.recordVersion };
            await route.fulfill({ json: receipt }); // prove GET overrides a historical receipt
          } else {
            unexpected.push(path);
            await route.fulfill({ status: 501, json: {} });
          }
        } else if (path === '/api/horses') {
          await route.fulfill({
            json: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
          });
        } else if (path === '/api/transport-orders/9') {
          await route.fulfill({ json: order });
        } else if (path === '/api/transport-orders/9/quotes/31') {
          reads++;
          await route.fulfill({ json: detail });
        } else {
          unexpected.push(path);
          await route.fulfill({ status: 501, json: {} });
        }
      },
    );
    await page.goto('/login?returnTo=%2Fcustomer%2Frequests%2F9%2Fquotes%2F31');
    await page.getByLabel('Email address').fill('quotation-test@example.invalid');
    await page.getByLabel('Password').fill('TestPassword123!');
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.getByRole('heading', { name: 'Quotation details' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Payment schedule' })).toBeVisible();
    expect(writes).toHaveLength(0);
    const label = action === 'ACCEPT' ? 'accept' : 'reject';
    await page
      .getByRole('button', { name: `${action === 'ACCEPT' ? 'Accept' : 'Reject'} quotation` })
      .click();
    const dialog = page.getByRole('dialog', { name: `Confirm ${label} quotation` });
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: `Confirm ${label}` })).toBeDisabled();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: `Confirm ${label}` }).click();
    await expect(
      page.getByText(action === 'ACCEPT' ? 'Accepted' : 'Rejected', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Your response was recorded/)).toBeVisible();
    await expect(page.getByRole('button', { name: /pay|book|depart/i })).toHaveCount(0);
    expect(writes).toEqual([
      {
        path: '/api/transport-orders/9/quotes/31/actions',
        body: {
          command: {
            recordVersion: quotation.recordVersion,
            operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          },
          action,
        },
      },
    ]);
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(unexpected).toEqual([]);
  });
}
