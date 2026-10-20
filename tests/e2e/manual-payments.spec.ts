import { fillDateTime } from './date-time';
import { test, expect } from '@playwright/test';
import {
  testOverview,
  testBank,
  secondProofKey,
  pngBase64,
} from '../../src/features/payments/testing';
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('Customer uploads evidence and reports a transfer without recognizing bank money', async ({
  page,
}, info) => {
  let reported = false;
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const unexpected: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (path === '/api/auth/login')
        return route.fulfill({
          json: { accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'CUSTOMER' },
        });
      if (path === '/api/transport-orders/11/payments' && req.method() === 'GET') {
        const data = testOverview();
        return route.fulfill({
          json: reported
            ? {
                ...data,
                recordVersion: '00000000000000a2',
                reports: [
                  ...data.reports,
                  { ...data.reports[0], reportId: 202, proofFileKey: secondProofKey },
                ],
              }
            : data,
        });
      }
      if (req.method() === 'POST') {
        const body = req.postDataJSON();
        writes.push({ path, body });
        if (path.endsWith('/payments/proofs'))
          return route.fulfill({
            json: {
              fileKey: secondProofKey,
              mediaType: 'image/png',
              size: Buffer.from(pngBase64, 'base64').length,
            },
          });
        if (path.endsWith('/payments/reports')) {
          reported = true;
          return route.fulfill({ json: { entityId: 202, recordVersion: '00000000000000a2' } });
        }
      }
      unexpected.push(path);
      return route.fulfill({ status: 501, json: { message: 'Unexpected test request' } });
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login?returnTo=%2Fcustomer%2Frequests%2F11%2Fpayments');
  await page.getByLabel('Email address').fill('issue76@example.invalid');
  await page.getByLabel('Password').fill('TestPassword123!');
  await page.getByRole('button', { name: 'Log In' }).click();
  await page.getByRole('button', { name: 'Report a bank transfer', exact: true }).click();
  const form = page.getByRole('form', { name: 'Report a bank transfer' });
  await form.getByLabel('Payment obligation').selectOption('101');
  await form.getByLabel('Amount transferred (USD)').fill('50.00');
  await fillDateTime(form.getByLabel('Transferred at'), '2020-01-01T00:00:00Z');
  await form.getByLabel('Bank transfer reference').fill('TEST-REPORT');
  await form.getByLabel('PNG or JPEG evidence').setInputFiles({
    name: 'test-proof.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBase64, 'base64'),
  });
  await form.getByRole('button', { name: 'Upload evidence', exact: true }).click();
  await expect(form.getByText('Uploaded evidence selected.')).toBeVisible();
  await form.screenshot({ path: info.outputPath('customer-payment-report-mocked.png') });
  await form.getByRole('button', { name: 'Report a bank transfer', exact: true }).click();
  await expect(page.getByText(/Action recorded, reference 202/)).toBeVisible();
  await expect(
    page
      .getByRole('table', { name: 'Payment obligations' })
      .getByText('20.00 USD', { exact: true }),
  ).toBeVisible();
  expect(writes.map((w) => w.path)).toEqual([
    '/api/transport-orders/11/payments/proofs',
    '/api/transport-orders/11/payments/reports',
  ]);
  const proofCommand = writes[0].body.command as { operationId: string };
  const reportCommand = writes[1].body.command as { operationId: string };
  expect(reportCommand.operationId).not.toBe(proofCommand.operationId);
  expect(writes[0].body.contentBase64).toBe(pngBase64);
  expect(writes[1].body.proofFileKey).toBe(secondProofKey);
  expect(unexpected).toEqual([]);
});

test('Manager navigates from a case to payments and explicitly allocates verified funds', async ({
  page,
}, info) => {
  let allocated = false;
  const writes: Record<string, unknown>[] = [];
  const unexpected: string[] = [];
  const caseRow = {
    orderId: 11,
    orderNumber: 'TEST-11',
    orderStatus: 'APPROVED',
    recordVersion: '00000000000000a1',
    currentRevisionId: 7,
    originCountryCode: 'VN',
    destinationCountryCode: 'GB',
    deliveryDeadline: null,
  };
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      if (path === '/api/auth/login')
        return route.fulfill({
          json: { accessToken: 'test-only', tokenType: 'Bearer', expiresIn: 600, role: 'MANAGER' },
        });
      if (path === '/api/manager/transport-orders') {
        const items = url.searchParams.get('state') === 'APPROVED' ? [caseRow] : [];
        return route.fulfill({
          json: {
            items,
            page: 0,
            size: 20,
            totalElements: items.length,
            totalPages: items.length ? 1 : 0,
          },
        });
      }
      if (path === '/api/manager/transport-orders/11')
        return route.fulfill({
          json: {
            orderId: 11,
            orderNumber: 'TEST-11',
            orderStatus: 'APPROVED',
            recordVersion: '00000000000000a1',
            currentRevisionId: 7,
            revision: null,
            decision: null,
            assignments: [],
          },
        });
      if (/\/11\/(decisions|assignments)$/.test(path)) return route.fulfill({ json: [] });
      if (path === '/api/transport-orders/11/payments' && req.method() === 'GET') {
        const data = testOverview();
        return route.fulfill({
          json: allocated
            ? {
                ...data,
                recordVersion: '00000000000000a2',
                obligations: [{ ...data.obligations[0], paidAmount: '40.00' }],
              }
            : data,
        });
      }
      if (path === '/api/transport-orders/11/payments/transactions/601')
        return route.fulfill({ json: testBank() });
      if (path === '/api/transport-orders/11/payments/allocations' && req.method() === 'POST') {
        writes.push(req.postDataJSON());
        allocated = true;
        return route.fulfill({ json: { entityId: 502, recordVersion: '00000000000000a2' } });
      }
      if (/^\/api\/activity\/orders\/\d+\/timeline$/.test(path))
        return route.fulfill({ json: { orderId: 11, items: [], page: 0, size: 20 } });
      unexpected.push(path);

      return route.fulfill({ status: 501, json: { message: 'Unexpected test request' } });
    },
  );
  await page.goto('/login');
  await page.getByLabel('Email address').fill('issue76@example.invalid');
  await page.getByLabel('Password').fill('TestPassword123!');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page).toHaveURL(/\/manager\/requests$/);
  await page.getByLabel('Assessment state').selectOption('APPROVED');
  await page.getByRole('link', { name: 'TEST-11', exact: true }).click();
  await page.getByRole('link', { name: 'Payments', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create payment request' })).toBeDisabled();
  await page.getByLabel('Known bank receipt').selectOption('601');
  await page.getByRole('button', { name: 'Load bank receipt' }).click();
  await page.getByRole('button', { name: 'Allocate received funds', exact: true }).click();
  const form = page.getByRole('form', { name: 'Allocate received funds' });
  await form.getByLabel('Payment obligation').selectOption('101');
  await form.getByLabel('Amount (USD)').fill('20.00');
  await form.screenshot({ path: info.outputPath('manager-allocation-mocked.png') });
  await form.getByRole('button', { name: 'Allocate received funds', exact: true }).click();
  await expect(
    page
      .getByRole('table', { name: 'Payment obligations' })
      .getByText('40.00 USD', { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    command: { recordVersion: '00000000000000a1', operationId: expect.any(String) },
    transactionId: 601,
    paymentRequestId: 101,
    amount: '20.00',
  });
  expect(unexpected).toEqual([]);
});
