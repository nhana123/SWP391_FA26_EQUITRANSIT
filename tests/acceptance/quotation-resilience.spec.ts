import { test, expect, quoteFrom, requireStatus, errorCode } from './fixtures';
import { openCustomerQuote } from './ui';

test('F06-23 Response loss after a real committed ACCEPT retries the same command', async ({
  live,
}) => {
  const quote = await live.publish();
  const before = await live.observe();
  const page = await openCustomerQuote(live, quote);
  const commands: unknown[] = [];
  let dropped = false;
  await page.route(
    (url) =>
      url.origin === live.readiness.apiOrigin &&
      url.pathname === `${live.base()}/quotes/${quote.quote.quoteId}/actions`,
    async (route) => {
      commands.push(route.request().postDataJSON());
      if (!dropped) {
        dropped = true;
        const actual = await route.fetch(); // Actual backend write; lose only its response.
        if (actual.status() !== 200)
          throw new Error('CONTROLLED_DROP_REQUIRES_SUCCESSFUL_REAL_WRITE');
        await actual.dispose();
        await route.abort('failed');
      } else await route.fallback();
    },
  );
  await page.getByRole('button', { name: 'Accept quotation', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm accept quotation' });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirm accept', exact: true }).click();
  await dialog.getByRole('button', { name: 'Retry the same response', exact: true }).click();
  await expect(page.getByText('Accepted', { exact: true })).toBeVisible();
  expect(commands.length).toBe(2);
  expect(commands[1]).toEqual(commands[0]);
  const after = await live.observe();
  expect(after.scheduleRows).toBe(before.scheduleRows);
  expect(after.acceptedQuotes - before.acceptedQuotes).toBe(1);
});

test('F06-24 Mobile keyboard confirmation, safe text and access revocation', async ({ live }) => {
  const quote = await live.publish();
  const page = await openCustomerQuote(live, quote);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accept = page.getByRole('button', { name: 'Accept quotation', exact: true });
  await accept.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Confirm accept quotation' });
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Confirm accept', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.quotation-terms script, .quotation-terms img')).toHaveCount(0);
  await expect(page.getByText(live.scenario.prepare.terms, { exact: true })).toBeVisible();
  await live.safeScreenshot(page, 'mobile-summary');
  await live.prepare(); // Real supersession makes the Customer's old detail inaccessible.
  await page.getByRole('button', { name: 'Refresh and review quotation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quotation summary', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Accept quotation', exact: true })).toHaveCount(0);
});

test('F06-25 Real unsupported snapshot is shown as an error', async ({ live }) => {
  const id = live.scenario.existingQuoteId;
  if (!id) throw new Error('DEDICATED_UNSUPPORTED_SNAPSHOT_FIXTURE_REQUIRED');
  const response = await live.call('manager', 'GET', `${live.base()}/quotes/${id}`);
  requireStatus(response, 409);
  expect(errorCode(response)).toBe('QUOTE_DATA_UNSUPPORTED');
  const page = await live.openRequest('manager');
  // The list is real; the authorized shared fixture provides this unsupported version.
  await page.locator(`a[href$="/quotes/${id}"]`).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Captured service breakdown' })).toHaveCount(0);
});

test('F06-26 Late real GET cannot expose the old Customer snapshot after logout', async ({
  live,
}) => {
  const quote = await live.publish();
  const page = await openCustomerQuote(live, quote);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fetched!: () => void;
  const received = new Promise<void>((resolve) => {
    fetched = resolve;
  });
  await page.route(
    (url) =>
      url.origin === live.readiness.apiOrigin &&
      url.pathname === `${live.base()}/quotes/${quote.quote.quoteId}`,
    async (route) => {
      const actual = await route.fetch();
      fetched();
      await gate;
      try {
        await route.fulfill({ response: actual });
      } catch {
        /* Navigation may cancel it. */
      }
      await actual.dispose();
    },
  );
  await page.getByRole('button', { name: 'Refresh and review quotation', exact: true }).click();
  await received;
  try {
    await page.getByRole('button', { name: /log out/i }).click();
    release();
    await expect(page.getByRole('heading', { name: 'Quotation summary' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Accept quotation', exact: true })).toHaveCount(
      0,
    );
  } finally {
    release();
  }
});

test('F06-27 Deployment-pending real backend returns 503 without migrations or auto retry', async ({
  readiness,
  playwright,
  browser,
  baseURL,
}) => {
  const target = readiness.inspection.schemaPendingTarget;
  test.skip(
    !target,
    'BLOCKED: separate verified test backend without migration 005 is not provided',
  );
  const api = await playwright.request.newContext({ baseURL: target!.apiOrigin, timeout: 10000 });
  // No database changes: only an authenticated read against an independently inspected target.
  try {
    const { credentials } = await import('./environment');
    const login = await api.post('/api/auth/login', {
      data: credentials(readiness.inspection, 'customer'),
    });
    if (login.status() !== 200) throw new Error('SCHEMA_PENDING_TEST_ACCOUNT_REQUIRED');
    const token = ((await login.json()) as { accessToken: string }).accessToken;
    const response = await api.get(`/api/transport-orders/${target!.orderId}/quotes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe('QUOTE_SCHEMA_PENDING');
    const context = await browser.newContext({ baseURL });
    let reads = 0;
    try {
      // Forward to an inspected real secondary backend, never fulfill a fake 503.
      await context.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== readiness.apiOrigin) {
            await route.abort();
            return;
          }
          if (url.pathname.endsWith('/quotes')) reads++;
          await route.continue({ url: target!.apiOrigin + url.pathname + url.search });
        },
      );
      const page = await context.newPage();
      await page.goto(
        `/login?returnTo=${encodeURIComponent(`/customer/requests/${target!.orderId}/quotes`)}`,
      );
      const account = credentials(readiness.inspection, 'customer');
      await page.getByLabel('Email address').fill(account.email);
      await page.getByLabel('Password', { exact: true }).fill(account.password);
      await page.getByRole('button', { name: 'Log In', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('has not been deployed');
      await page.waitForTimeout(1100); // Exceeds the default first query retry delay.
      expect(reads).toBe(1);
    } finally {
      await context.close();
    }
  } finally {
    await api.dispose();
  }
});

test('F06-28 Concurrent separate ACCEPT commands have one winner', async ({ live }) => {
  const quote = await live.publish();
  const before = await live.observe();
  const { randomUUID } = await import('node:crypto');
  const recordVersion = (await live.current()).recordVersion;
  const results = await Promise.all(
    [1, 2].map(() =>
      live.act(quote.quote.quoteId, 'ACCEPT', 'customer', {
        recordVersion,
        operationId: randomUUID(),
      }),
    ),
  );
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const accepted = quoteFrom(results.find((result) => result.status === 200)!);
  expect(accepted.quote.status).toBe('ACCEPTED');
  const after = await live.observe();
  expect(after.acceptedQuotes - before.acceptedQuotes).toBe(1);
  expect(after.scheduleRows).toBe(before.scheduleRows);
});
