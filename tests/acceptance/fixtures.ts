import {
  test as base,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type PlaywrightWorkerArgs,
  type TestInfo,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { quoteResponseSchema, type QuoteResponse } from '../../src/features/quotations/contracts';
import { orderSchema, loginSchema } from '../../src/shared/api/contracts';
import {
  actorRole,
  credentials,
  openReadiness,
  validateCleanup,
  validateObservation,
  validateScenario,
  AcceptanceBlocked,
  type Actor,
  type Created,
  type Readiness,
  type Scenario,
} from './environment';

type Reply = { status: number; data: unknown };
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
export function errorCode(reply: Reply) {
  return object(reply.data).code;
}
export function requireStatus(reply: Reply, expected: number) {
  if (reply.status !== expected) throw new Error(`API_STATUS_${reply.status}_EXPECTED_${expected}`);
}
export function quoteFrom(reply: Reply): QuoteResponse {
  requireStatus(reply, 200);
  const parsed = quoteResponseSchema.safeParse(reply.data);
  if (!parsed.success) throw new Error('QUOTE_RESPONSE_CONTRACT_MISMATCH');
  return parsed.data;
}
export function assertCustomerPayload(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(assertCustomerPayload);
    return;
  }
  for (const [key, child] of Object.entries(object(value))) {
    if (/purchase|margin|internal.?notes|evidenceFileKey|sourceReference/i.test(key))
      throw new Error('CUSTOMER_PAYLOAD_CONTAINS_INTERNAL_FIELD');
    assertCustomerPayload(child);
  }
}
export function cents(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('INVALID_EXACT_MONEY');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function assertSnapshot(quote: QuoteResponse, scenario: Scenario) {
  expect(quote.quote.revisionId).toBe(scenario.revisionId);
  expect(quote.quote.total).toBe(scenario.expectedTotal);
  expect(quote.currency).toBe('USD');
  expect(quote.terms).toBe(scenario.prepare.terms);
  expect(quote.cancellationTerms).toBe(scenario.prepare.cancellationTerms);
  expect(quote.termsVersion).toBe(scenario.prepare.termsVersion);
  expect(Date.parse(quote.quote.validUntil)).toBe(
    Math.floor(Date.parse(scenario.prepare.validUntil) / 1000) * 1000,
  );
  expect(quote.paymentSchedule.length).toBe(scenario.prepare.paymentSchedule.length);
  quote.paymentSchedule.forEach((row, i) => {
    const expected = scenario.prepare.paymentSchedule[i];
    expect(row.sequenceNo).toBe(i + 1);
    expect(row.paymentStage).toBe(expected.paymentStage);
    expect(cents(row.amountDue)).toBe(cents(expected.amountDue));
    expect(Date.parse(row.dueAt)).toBe(Math.floor(Date.parse(expected.dueAt) / 1000) * 1000);
  });
  expect(quote.paymentSchedule.reduce((sum, row) => sum + cents(row.amountDue), 0n)).toBe(
    cents(scenario.expectedTotal),
  );
  expect(
    quote.items
      .filter((line) => line.pricingStatus === 'PRICED')
      .reduce((sum, line) => sum + cents(line.amount!), 0n),
  ).toBe(cents(scenario.expectedTotal));
  for (const line of quote.items) {
    if (line.quantity !== null) expect(/^\d+(\.\d{1,3})?$/.test(line.quantity)).toBe(true);
    for (const value of [line.unitRate, line.amount])
      if (value !== null) expect(/^\d+(\.\d{1,2})?$/.test(value)).toBe(true);
    if (scenario.expectedIncludedCodes.includes(line.code)) {
      expect(line.pricingStatus).toBe('INCLUDED');
      expect(line.amount === null || cents(line.amount) === 0n).toBe(true);
    }
  }
  for (const code of scenario.expectedIncludedCodes)
    expect(
      quote.items.filter((line) => line.code === code && line.pricingStatus === 'INCLUDED').length,
    ).toBe(1);
  assertCustomerPayload(quote);
}

export class LiveCase {
  readonly created: Created = { quoteIds: [], offerIds: [], tariffIds: [], operationIds: [] };
  private apis = new Map<Actor, Promise<APIRequestContext>>();
  private contexts: BrowserContext[] = [];
  private events: { method: string; path: string; status: number }[] = [];
  private unexpectedOrigin = false;
  constructor(
    readonly readiness: Readiness,
    readonly scenario: Scenario,
    private playwright: PlaywrightWorkerArgs['playwright'],
    private browser: Browser,
    private testInfo: TestInfo,
  ) {}
  async api(actor: Actor) {
    let pending = this.apis.get(actor);
    if (!pending) {
      pending = this.authenticate(actor);
      this.apis.set(actor, pending);
    }
    return pending;
  }
  private async authenticate(actor: Actor): Promise<APIRequestContext> {
    const login = await this.playwright.request.newContext({
      baseURL: this.readiness.apiOrigin,
      timeout: 20000,
    });
    let token: string;
    try {
      const response = await login.post('/api/auth/login', {
        data: credentials(this.readiness.inspection, actor),
      });
      const parsed = loginSchema.safeParse(await response.json());
      if (response.status() !== 200 || !parsed.success || parsed.data.role !== actorRole[actor])
        throw new Error('TEST_ACCOUNT_LOGIN_FAILED');
      token = parsed.data.accessToken;
    } catch {
      throw new Error(`TEST_ACCOUNT_${actor.toUpperCase()}_LOGIN_FAILED`);
    } finally {
      await login.dispose();
    }
    return this.playwright.request.newContext({
      baseURL: this.readiness.apiOrigin,
      timeout: 20000,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
  }
  async call(
    actor: Actor,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<Reply> {
    if (!path.startsWith('/api/') || path.includes('://') || path.includes('..'))
      throw new Error('INVALID_TEST_API_PATH');
    const input = object(body);
    const command = object(input.command);
    const operation = input.operationId ?? command.operationId;
    if (typeof operation === 'string' && !this.created.operationIds.includes(operation))
      this.created.operationIds.push(operation);
    let reply: Reply;
    try {
      const response = await (await this.api(actor)).fetch(path, { method, data: body });
      reply = { status: response.status(), data: await response.json().catch(() => null) };
    } catch {
      throw new Error('TEST_BACKEND_REQUEST_UNAVAILABLE_NO_AUTO_RETRY');
    }
    this.events.push({ method, path, status: reply.status });
    if (method === 'POST' && reply.status >= 200 && reply.status < 300) {
      const result = object(reply.data);
      const quoteId = object(result.quote).quoteId;
      const offerId = result.offerId;
      const tariffId = result.tariffId;
      if (path.startsWith('/api/manager/service-tariffs') && typeof tariffId === 'number')
        this.track('tariffIds', tariffId);
      if (/\/quotes$/.test(path) && typeof quoteId === 'number') this.track('quoteIds', quoteId);
      if (/\/supplier-offers$/.test(path) && typeof offerId === 'number')
        this.track('offerIds', offerId);
    }
    return reply;
  }
  track(kind: 'quoteIds' | 'offerIds' | 'tariffIds', id: number) {
    if (!this.created[kind].includes(id)) this.created[kind].push(id);
  }
  base() {
    return `/api/transport-orders/${this.scenario.orderId}`;
  }
  async current() {
    const reply = await this.call('customer', 'GET', this.base());
    requireStatus(reply, 200);
    const parsed = orderSchema.safeParse(reply.data);
    if (
      !parsed.success ||
      parsed.data.orderId !== this.scenario.orderId ||
      parsed.data.orderNumber !== this.scenario.orderNumber
    )
      throw new Error('LIVE_FIXTURE_ORDER_MISMATCH');
    return parsed.data;
  }
  async read(id: number, actor: Actor = 'manager') {
    return quoteFrom(await this.call(actor, 'GET', `${this.base()}/quotes/${id}`));
  }
  async act(
    id: number,
    action: string,
    actor: Actor = 'manager',
    command?: { recordVersion: string; operationId: string },
  ) {
    return this.call(actor, 'POST', `${this.base()}/quotes/${id}/actions`, {
      command: command ?? {
        recordVersion: (await this.current()).recordVersion,
        operationId: randomUUID(),
      },
      action,
    });
  }
  async prepare(actor: Actor = 'manager', input = this.scenario.prepare) {
    return quoteFrom(
      await this.call(actor, 'POST', `${this.base()}/quotes`, {
        ...input,
        command: { recordVersion: (await this.current()).recordVersion, operationId: randomUUID() },
      }),
    );
  }
  async publish() {
    let quote = await this.prepare();
    quote = quoteFrom(await this.act(quote.quote.quoteId, 'APPROVE'));
    quote = quoteFrom(await this.act(quote.quote.quoteId, 'ISSUE'));
    return quote;
  }
  async observe() {
    return validateObservation(await this.readiness.driver.observe(this.scenario), this.scenario);
  }
  async loginPage(actor: Actor, returnTo = '/customer/requests') {
    const context = await this.browser.newContext({
      baseURL: this.testInfo.project.use.baseURL,
      viewport: this.testInfo.project.use.viewport,
      recordVideo: undefined,
    });
    this.contexts.push(context);
    await context.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route) => {
        if (new URL(route.request().url()).origin !== this.readiness.apiOrigin) {
          this.unexpectedOrigin = true;
          await route.abort();
        } else await route.continue(); // guard only: real network, no fulfill/mocked response.
      },
    );
    const page = await context.newPage();
    page.on('response', (response) => {
      const request = response.request();
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/api/'))
        this.events.push({ method: request.method(), path, status: response.status() });
    });
    await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    const account = credentials(this.readiness.inspection, actor);
    await page.getByLabel('Email address').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    return page;
  }
  async openRequest(actor: 'customer' | 'manager' | 'coordinator') {
    const page = await this.loginPage(actor);
    if (actor === 'manager') await page.getByLabel('Assessment state').selectOption('APPROVED');
    await page.getByRole('link', { name: this.scenario.orderNumber, exact: true }).click();
    await page.getByRole('link', { name: 'Quotations', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Quotations', exact: true })).toBeVisible();
    return page;
  }
  async safeScreenshot(page: Page, name: string) {
    // Only fixture Customer summaries; avoid staff offers, full-page notes and network traces.
    const summary = page.getByRole('heading', { name: 'Quotation summary' }).locator('..');
    await summary.screenshot({
      path: this.testInfo.outputPath(`${name}.png`),
      mask: [page.locator('input, textarea')],
    });
  }
  async dispose() {
    await Promise.all(this.contexts.map((context) => context.close()));
    await Promise.all(
      [...this.apis.values()].map(async (pending) => {
        const api = await pending.catch(() => undefined);
        await api?.dispose();
      }),
    );
    await this.testInfo.attach('sanitized-api-events', {
      body: Buffer.from(JSON.stringify(this.events)),
      contentType: 'application/json',
    });
    if (this.unexpectedOrigin) throw new Error('BROWSER_ATTEMPTED_UNVERIFIED_BACKEND');
  }
}

async function finishRun(readiness: Readiness) {
  try {
    validateCleanup(await readiness.driver.finishRun({ runId: readiness.runId }));
  } catch {
    throw new AcceptanceBlocked('RUN_FIXTURE_CLEANUP_FAILED');
  }
}
async function cleanupScenario(readiness: Readiness, scenario: Scenario, created: Created) {
  try {
    validateCleanup(
      await readiness.driver.cleanupScenario({
        runId: scenario.runId,
        scenarioId: scenario.scenarioId,
        orderId: scenario.orderId,
        created,
      }),
    );
  } catch {
    throw new AcceptanceBlocked('SCENARIO_FIXTURE_CLEANUP_FAILED');
  }
}
export const test = base.extend<{ live: LiveCase }, { readiness: Readiness }>({
  readiness: [
    async ({ playwright: workerPlaywright }, provide) => {
      void workerPlaywright;
      const readiness = await openReadiness();
      try {
        await provide(readiness);
      } finally {
        await finishRun(readiness);
      }
    },
    { scope: 'worker' },
  ],
  live: async ({ readiness, playwright, browser }, provide, info) => {
    let scenario: Scenario;
    try {
      scenario = validateScenario(
        await readiness.driver.createScenario({
          runId: readiness.runId,
          name: info.title.split(' ')[0],
        }),
        readiness.runId,
      );
    } catch {
      throw new AcceptanceBlocked('SCENARIO_FIXTURE_UNAVAILABLE');
    }
    const live = new LiveCase(readiness, scenario, playwright, browser, info);
    try {
      // Read ownership and source provenance before the first business mutation.
      await live.current();
      await live.observe();
      await provide(live);
    } finally {
      try {
        await live.dispose();
      } finally {
        await cleanupScenario(readiness, scenario, live.created);
      }
    }
  },
});
export { expect, randomUUID };
