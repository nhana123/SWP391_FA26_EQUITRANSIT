import { test, expect } from '@playwright/test';
import { testDisclosure, testOrder } from '../../src/features/booking-services/testing';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('Customer reviews WIDE and Request Share on mobile without confirming a revision', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const unexpected: string[] = [];
  const order = testOrder();
  const disclosure = testDisclosure({
    selected: { airStall: 'WIDE' },
    airStalls: [
      {
        option: 'SHARED_ONE',
        slots: 1,
        status: 'UNSUITABLE',
        policyId: 4,
        policyVersion: 1,
        reasons: ['HORSE_EXCEEDS_APPROVED_LIMITS'],
      },
      {
        option: 'WIDE',
        slots: 1.5,
        status: 'ELIGIBLE',
        policyId: 4,
        policyVersion: 1,
        reasons: ['STALLION_COMPATIBILITY_REVIEW_REQUIRED'],
      },
    ],
  });
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (path === '/api/auth/login')
        return route.fulfill({
          json: {
            accessToken: 'browser-test-only',
            tokenType: 'Bearer',
            expiresIn: 600,
            role: 'CUSTOMER',
          },
        });
      if (req.method() !== 'GET') {
        writes.push({ path, body: req.postDataJSON() });
        if (path === '/api/transport-orders/11/services/preview')
          return route.fulfill({ json: disclosure });
      } else if (path === '/api/transport-orders/11') return route.fulfill({ json: order });
      else if (path === '/api/transport-orders/11/services')
        return route.fulfill({ json: disclosure });
      else if (path === '/api/transport-orders/11/services/rates')
        return route.fulfill({
          json: [
            {
              product: 'AIR_STALL',
              uiSection: 'AIR_STALL',
              unit: 'SHIPMENT',
              unitRate: '325.10',
              currency: 'USD',
              pricingMode: 'RATE',
              tariffId: 3,
              tariffVersion: 2,
              allowedUnits: ['SHIPMENT', 'SLOT_KM'],
            },
          ],
        });
      else if (/\/11\/(decisions|revisions)$/.test(path)) return route.fulfill({ json: [] });
      else if (path === '/api/horses')
        return route.fulfill({
          json: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
        });
      if (/^\/api\/activity\/orders\/\d+\/timeline$/.test(path))
        return route.fulfill({ json: { orderId: 11, items: [], page: 0, size: 20 } });
      unexpected.push(path);

      return route.fulfill({ status: 501, json: { message: 'Unexpected test request' } });
    },
  );
  await page.goto('/login?returnTo=%2Fcustomer%2Frequests%2F11');
  await page.getByLabel('Email address').fill('issue74@example.invalid');
  await page.getByLabel('Password').fill('TestPassword123!');
  await page.getByRole('button', { name: 'Log In' }).click();
  await page.getByRole('button', { name: '3. Service preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Available Air Stalls for Your Horse' }).click();
  await expect(page.getByLabel(/Wide stall/)).toBeChecked();
  await expect(page.getByText(/WIDE recommended/)).toBeVisible();
  await expect(page.getByText(/Stallion compatibility needs Coordinator review/)).toBeVisible();
  await expect(page.getByText(/Request Share — not matched or booked/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm service choices', exact: true }),
  ).toBeEnabled();
  await expect(page.getByText('Live estimate for your unsaved choices')).toBeVisible();
  expect(writes.every((write) => write.path.endsWith('/services/preview'))).toBe(true);
  expect(writes[0].body).not.toHaveProperty('operationId');
  expect(writes[0].body).not.toHaveProperty('autoWide');
  expect(writes[0].body).not.toHaveProperty('sharingCode');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page
    .locator('.booking')
    .screenshot({ path: testInfo.outputPath('customer-mobile-mocked.png') });
  expect(unexpected).toEqual([]);
});

for (const role of ['MANAGER', 'COORDINATOR'] as const) {
  test(`${role} records explicit bundle coverage and clears private purchase input`, async ({
    page,
  }, testInfo) => {
    const base = role === 'MANAGER' ? '/manager/requests' : '/staff/cases';
    const coverage = role === 'MANAGER' ? 'ENTIRE_ROUTE' : 'PARTIAL_ROUTE';
    const writes: Record<string, unknown>[] = [];
    const unexpected: string[] = [];
    const caseRow = {
      orderId: 9,
      orderNumber: 'TEST-9',
      orderStatus: 'APPROVED',
      recordVersion: '00000000000000c1',
      currentRevisionId: 7,
      originCountryCode: 'VN',
      destinationCountryCode: 'GB',
      deliveryDeadline: null,
    };
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const path = url.pathname;
        if (path === '/api/auth/login')
          return route.fulfill({
            json: { accessToken: 'browser-test-only', tokenType: 'Bearer', expiresIn: 600, role },
          });
        if (path === '/api/transport-orders/9/supplier-offers' && req.method() === 'POST') {
          writes.push(req.postDataJSON());
          return route.fulfill({ json: { offerId: 55, recordVersion: '00000000000000c2' } });
        }
        if (path === '/api/manager/transport-orders' || path === '/api/staff/transport-orders') {
          const items =
            role === 'COORDINATOR' || url.searchParams.get('state') === 'APPROVED' ? [caseRow] : [];
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
        if (/\/9\/(decisions|assignments)$/.test(path)) return route.fulfill({ json: [] });
        if (path === '/api/manager/transport-orders/9' || path === '/api/staff/transport-orders/9')
          return route.fulfill({
            json: {
              orderId: 9,
              orderNumber: 'TEST-9',
              orderStatus: 'APPROVED',
              recordVersion: '00000000000000c1',
              currentRevisionId: 7,
              revision: null,
              decision: null,
              assignments: [],
            },
          });
        if (/^\/api\/activity\/orders\/\d+\/timeline$/.test(path))
          return route.fulfill({ json: { orderId: 9, items: [], page: 0, size: 20 } });
        unexpected.push(path);
        return route.fulfill({ status: 501, json: { message: 'Unexpected test request' } });
      },
    );
    await page.goto('/login');
    await page.getByLabel('Email address').fill('issue74@example.invalid');
    await page.getByLabel('Password').fill('TestPassword123!');
    await page.getByRole('button', { name: 'Log In' }).click();
    // Staff login deliberately opens the role workspace, ignoring returnTo.
    // Follow the real queue -> approved case -> preparation links in the SPA;
    // a page.goto here would reload and discard the memory-only session.
    await expect(page).toHaveURL(new RegExp(`${base}$`));
    if (role === 'MANAGER') await page.getByLabel('Assessment state').selectOption('APPROVED');
    await page.getByRole('link', { name: 'TEST-9', exact: true }).click();
    await page.getByRole('link', { name: 'Prepare quotation', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/9/quotes/prepare$`));
    const form = page.getByRole('form', { name: 'Record supplier offer' });
    await expect(form).toBeVisible();
    await form.getByLabel('Provider name').fill('TEST supplier');
    await form.getByLabel('Offer reference', { exact: true }).fill('TEST-74');
    await form.getByLabel('Quantity', { exact: true }).fill('1.000');
    await form.getByLabel(/Purchase unit price/).fill('812.20');
    await form.getByLabel(/Retail unit price/).fill('932.40');
    await form.getByLabel('Offer valid until').fill('2099-01-01T00:00:00Z');
    await form.getByLabel('Evidence reference', { exact: true }).fill('test-only/evidence');
    await form.getByLabel('Bundle coverage').selectOption(coverage);
    await form.getByLabel('Air stall', { exact: true }).check();
    if (coverage === 'PARTIAL_ROUTE')
      await expect(form.getByText(/Coverage needs review/)).toBeVisible();
    await form.screenshot({
      path: testInfo.outputPath(`${role.toLowerCase()}-bundle-form-mocked.png`),
      mask: [form.getByLabel(/Purchase unit price/)],
    });
    await form.getByRole('button', { name: 'Record offer', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Recorded offers' })).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      bundleCoverage: coverage,
      includesStall: true,
      unitCode: 'SHIPMENT',
      quantity: '1.000',
      command: { recordVersion: '00000000000000c1', operationId: expect.any(String) },
    });
    await expect(form.getByLabel(/Purchase unit price/)).toHaveValue('');
    await expect(
      page.getByRole('table', { name: 'Recorded offers' }).getByText(/812\.20/),
    ).toHaveCount(0);
    await page
      .getByRole('table', { name: 'Recorded offers' })
      .screenshot({ path: testInfo.outputPath(`${role.toLowerCase()}-receipt-mocked.png`) });
    expect(unexpected).toEqual([]);
  });
}
