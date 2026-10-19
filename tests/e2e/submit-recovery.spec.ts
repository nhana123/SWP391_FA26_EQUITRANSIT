import { fillDateTime } from './date-time';
import { test, expect } from '@playwright/test';
import type { Horse, Order, OrderDraft } from '../../src/shared/api/contracts';

const emptyPage = { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 };
test('customer saves a draft, submits once and retries only the failed status read', async ({
  page,
}) => {
  const horse: Horse = {
    horseId: 1,
    name: 'Browser Test Horse',
    microchipId: null,
    passportNumber: null,
    breed: null,
    dateOfBirth: null,
    sexCode: null,
    weightKg: null,
    heightCm: null,
    bodyWidthCm: null,
    measuredAt: null,
    specialCareNotes: null,
    handlingNotes: null,
    feedWaterRequirements: null,
    stallPreferences: null,
    veterinaryInstructions: null,
    veterinaryInstructionSource: null,
    recordVersion: '0000000000000001',
    measurementsComplete: false,
  };
  let order: Order | undefined;
  let submitCount = 0;
  let failNextRead = false;
  let submitted: unknown;
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      json: {
        accessToken: 'browser-test-only',
        tokenType: 'Bearer',
        expiresIn: 60,
        role: 'CUSTOMER',
      },
    }),
  );
  await page.route('**/api/horses?*', (route) =>
    route.fulfill({
      json: {
        ...emptyPage,
        items: [horse],
        totalElements: 1,
        totalPages: 1,
      },
    }),
  );
  await page.route('**/api/transport-orders**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/assessment')) {
      await route.fulfill({ json: { currentRevisionId: 3, decision: null, reason: null } });
    } else if (path.endsWith('/submit')) {
      submitCount++;
      submitted = request.postDataJSON();
      order = {
        ...order!,
        orderStatus: 'SUBMITTED',
        currentRevisionId: 3,
        recordVersion: '0000000000000002',
      };
      failNextRead = true;
      await route.fulfill({ json: { revisionId: 3 } });
    } else if (request.method() === 'POST') {
      order = {
        orderId: 1,
        orderNumber: 'TEST-BROWSER-1',
        orderStatus: 'DRAFT',
        currency: 'USD',
        recordVersion: '0000000000000001',
        currentRevisionId: null,
        currentPlanId: null,
        createdAt: '2030-01-01T00:00:00Z',
        updatedAt: '2030-01-01T00:00:00Z',
        draft: request.postDataJSON() as OrderDraft,
      };
      await route.fulfill({ status: 201, json: order });
    } else if (path.endsWith('/1')) {
      if (failNextRead) {
        failNextRead = false;
        await route.fulfill({ status: 503, json: { message: 'Temporary read failure' } });
      } else await route.fulfill({ json: order });
    } else await route.fulfill({ json: { ...emptyPage, items: order ? [order] : [] } });
  });
  await page.goto('/login');
  await page.getByLabel('Email address').fill('customer@example.invalid');
  await page.getByLabel('Password').fill('TestPassword123!');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.getByRole('heading', { name: 'My Horses' })).toBeVisible();
  await page.getByRole('link', { name: 'Requests', exact: true }).click();
  await page.getByRole('link', { name: 'New Request', exact: true }).click();
  await page.getByLabel('Pickup country (ISO code)').fill('VN');
  await page.getByLabel('Destination country (ISO code)').fill('GB');
  await page.getByLabel('Pickup address', { exact: true }).fill('Test origin stable');
  await page.getByLabel('Destination address', { exact: true }).fill('Test destination stable');
  await page.getByLabel('Origin timezone', { exact: true }).fill('Asia/Ho_Chi_Minh');
  await page.getByLabel('Destination timezone', { exact: true }).fill('Europe/London');
  await fillDateTime(page.getByLabel('Preferred departure'), '2030-02-01T08:00:00+07:00');
  await fillDateTime(page.getByLabel('Latest lawful handover deadline'), '2030-02-03T18:00:00Z');
  await page.getByLabel('Import type').selectOption('NEEDS_ADVICE');
  await page.getByRole('button', { name: '2. Horse' }).click();
  await page.getByRole('radio', { name: /Browser Test Horse/ }).check();
  await page.getByRole('button', { name: 'Save Draft' }).click();
  await expect(page).toHaveURL(/\/customer\/requests\/1$/);
  await expect(page.getByRole('heading', { name: 'Request TEST-BROWSER-1' })).toBeVisible();
  expect(order?.draft).toMatchObject({
    horseId: 1,
    services: null,
    receiverName: null,
    importType: 'NEEDS_ADVICE',
  });
  await page.getByRole('button', { name: '4. Review & Submit' }).click();
  await page.getByRole('button', { name: 'Submit for Review' }).click();
  await expect(page.getByText(/Submission was accepted/)).toBeVisible();
  await page.getByRole('button', { name: 'Refresh submitted request' }).click();
  await expect(page.getByText(/Request submitted for assessment/)).toBeVisible();
  expect(submitCount).toBe(1);
  expect(submitted).toEqual({
    recordVersion: '0000000000000001',
    operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  await expect(page.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
});
