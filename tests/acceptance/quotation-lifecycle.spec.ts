import {
  test,
  expect,
  randomUUID,
  assertSnapshot,
  assertCustomerPayload,
  quoteFrom,
  requireStatus,
  errorCode,
} from './fixtures';
import { prepareThroughUI, managerAction, openCustomerQuote, customerAction } from './ui';
import { displayDate } from '../../src/shared/lib/validation';

for (const [id, actor] of [
  ['F06-01', 'manager'],
  ['F06-02', 'coordinator'],
] as const) {
  test(`${id} real UI source prepare publish and customer acceptance (${actor})`, async ({
    live,
  }) => {
    const before = await live.observe();
    const { page, quote } = await prepareThroughUI(live, actor);
    expect(quote.quote.status).toBe('DRAFT');
    expect(live.scenario.expectedIncludedCodes.length).toBeGreaterThan(0);
    if (live.scenario.offer.purchaseUnitPrice === live.scenario.offer.retailUnitPrice)
      throw new Error('COST_AND_RETAIL_FIXTURE_MUST_DIFFER');
    expect(
      quote.items.find((line) => line.code === live.scenario.offer.serviceCode)?.unitRate,
    ).toBe(live.scenario.offer.retailUnitPrice);
    assertSnapshot(quote, live.scenario);
    await expect(page.getByRole('button', { name: 'Accept quotation', exact: true })).toHaveCount(
      0,
    );
    const managerPage = actor === 'manager' ? page : await live.loginPage('manager');
    if (actor !== 'manager') {
      await managerPage.getByLabel('Assessment state').selectOption('APPROVED');
      await managerPage.getByRole('link', { name: live.scenario.orderNumber, exact: true }).click();
      await managerPage.getByRole('link', { name: 'Quotations', exact: true }).click();
      await managerPage.getByRole('link', { name: quote.quote.quoteNumber, exact: true }).click();
    }
    await managerAction(managerPage, 'APPROVE');
    await managerAction(managerPage, 'ISSUE');
    const published = await live.read(quote.quote.quoteId, 'customer');
    expect(published.quote.status).toBe('ISSUED');
    const customer = await openCustomerQuote(live, published);
    await expect(customer.getByRole('heading', { name: 'Payment schedule' })).toBeVisible();
    await expect(customer.getByRole('heading', { name: 'Cancellation terms' })).toBeVisible();
    await customerAction(customer, 'accept', true);
    await expect(customer.getByText('Accepted', { exact: true })).toBeVisible();
    const accepted = await live.read(quote.quote.quoteId, 'customer');
    expect(accepted.acceptedAt).not.toBeNull();
    await expect(
      customer.getByText(displayDate(accepted.acceptedAt), { exact: true }),
    ).toBeVisible();
    expect(accepted.quote.version).toBe(quote.quote.version);
    expect((await live.current()).recordVersion).not.toBe(quote.recordVersion);
    assertSnapshot(accepted, live.scenario);
    const after = await live.observe();
    expect(after.scheduleRows - before.scheduleRows).toBe(accepted.paymentSchedule.length);
    expect(after.acceptedQuotes - before.acceptedQuotes).toBe(1);
    for (const key of ['moneyReceipts', 'reservations', 'departures'] as const)
      expect(after[key]).toBe(before[key]);
    await live.safeScreenshot(customer, 'accepted-summary');
  });
}

for (const [id, state] of [
  ['F06-03', 'DRAFT'],
  ['F06-04', 'APPROVED'],
] as const) {
  test(`${id} Manager rejects ${state} through UI`, async ({ live }) => {
    const quote = await live.prepare();
    if (state === 'APPROVED') quoteFrom(await live.act(quote.quote.quoteId, 'APPROVE'));
    const page = await live.openRequest('manager');
    await page.getByRole('link', { name: quote.quote.quoteNumber, exact: true }).click();
    await managerAction(page, 'REJECT');
    expect((await live.read(quote.quote.quoteId)).quote.status).toBe('REJECTED');
    requireStatus(
      await live.call('customer', 'GET', `${live.base()}/quotes/${quote.quote.quoteId}`),
      404,
    );
  });
}

test('F06-05 Customer explicitly rejects an issued quotation', async ({ live }) => {
  const quote = await live.publish();
  const page = await openCustomerQuote(live, quote);
  await customerAction(page, 'reject');
  expect((await live.read(quote.quote.quoteId, 'customer')).quote.status).toBe('REJECTED');
});

test('F06-06 Actual expiry blocks customer and Manager explicitly expires the quote', async ({
  live,
}) => {
  const deadline = Date.parse(live.scenario.prepare.validUntil);
  if (deadline <= Date.now() || deadline - Date.now() > 45000)
    throw new Error('EXPIRY_FIXTURE_MUST_HAVE_A_REAL_45_SECOND_WINDOW');
  const quote = await live.publish();
  await expect.poll(() => Date.now() >= deadline, { timeout: 50000, intervals: [500] }).toBe(true);
  const expired = await live.act(quote.quote.quoteId, 'ACCEPT', 'customer');
  requireStatus(expired, 409);
  expect(errorCode(expired)).toBe('QUOTE_EXPIRED');
  const page = await live.openRequest('manager');
  await page.getByRole('link', { name: quote.quote.quoteNumber, exact: true }).click();
  await managerAction(page, 'EXPIRE');
  expect((await live.read(quote.quote.quoteId)).quote.status).toBe('EXPIRED');
});

for (const [id, missing] of [
  ['F06-07', 'evidence'],
  ['F06-08', 'rate'],
  ['F06-09', 'quantity'],
  ['F06-10', 'expired-source'],
] as const) {
  test(`${id} Missing ${missing} stays pending and cannot approve or issue`, async ({ live }) => {
    const quote = await live.prepare();
    expect(quote.quote.total).toBeNull();
    expect(quote.blockers.length).toBeGreaterThan(0);
    const pending = quote.items.filter((line) => line.pricingStatus === 'PENDING');
    expect(pending.length).toBeGreaterThan(0);
    for (const line of pending) expect(line.amount).toBeNull();
    if (missing === 'quantity') expect(pending.some((line) => line.quantity === null)).toBe(true);
    requireStatus(await live.act(quote.quote.quoteId, 'APPROVE'), 409);
    requireStatus(await live.act(quote.quote.quoteId, 'ISSUE'), 409);
    const page = await live.openRequest('manager');
    await page.getByRole('link', { name: quote.quote.quoteNumber, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Issue to customer', exact: true })).toHaveCount(
      0,
    );
  });
}

test('F06-11 Scope and role matrix enforced by real API', async ({ live, playwright }) => {
  const quote = await live.publish();
  for (const actor of [
    'foreignCustomer',
    'unassignedCoordinator',
    'specialist',
    'driver',
  ] as const) {
    const read = await live.call(actor, 'GET', `${live.base()}/quotes/${quote.quote.quoteId}`);
    requireStatus(read, actor === 'foreignCustomer' ? 404 : 403);
    const write = await live.act(quote.quote.quoteId, 'ACCEPT', actor);
    expect([403, 404]).toContain(write.status);
    const prepare = await live.call(actor, 'POST', `${live.base()}/quotes`, {
      ...live.scenario.prepare,
      command: { recordVersion: quote.recordVersion, operationId: randomUUID() },
    });
    expect([403, 404]).toContain(prepare.status);
    const offer = await live.call(actor, 'POST', `${live.base()}/supplier-offers`, {
      ...live.scenario.offer,
      command: { recordVersion: quote.recordVersion, operationId: randomUUID() },
    });
    expect([403, 404]).toContain(offer.status);
  }
  requireStatus(await live.act(quote.quote.quoteId, 'ACCEPT', 'manager'), 403);
  const raw = await live.call('customer', 'GET', `${live.base()}/quotes/${quote.quote.quoteId}`);
  assertCustomerPayload(raw.data);
  const invalid = await playwright.request.newContext({
    baseURL: live.readiness.apiOrigin,
    extraHTTPHeaders: { Authorization: 'Bearer deliberately-invalid-test-token' },
  });
  try {
    expect((await invalid.get(`${live.base()}/quotes`)).status()).toBe(401);
  } finally {
    await invalid.dispose();
  }
});
