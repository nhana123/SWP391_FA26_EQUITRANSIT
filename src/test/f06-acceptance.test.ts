import { describe, expect, it } from 'vitest';
import {
  TEST_CATALOG,
  CASE_IDS,
  validateInspection,
  validateCleanup,
  validateObservation,
  validateScenario,
  validateLiveContract,
  openReadiness,
  acceptanceArgs,
} from '../../tests/acceptance/environment';
import { summarize } from '../../tests/acceptance/reporter';

const accounts = {
  manager: 'EQ_TEST_MANAGER',
  coordinator: 'EQ_TEST_COORDINATOR',
  customer: 'EQ_TEST_CUSTOMER',
  foreignCustomer: 'EQ_TEST_FOREIGN',
  unassignedCoordinator: 'EQ_TEST_UNASSIGNED',
  specialist: 'EQ_TEST_SPECIALIST',
  driver: 'EQ_TEST_DRIVER',
};
const inspection = {
  catalog: TEST_CATALOG,
  apiOrigin: 'http://127.0.0.1:8080',
  frontendOrigin: 'http://127.0.0.1:5173',
  migrations: [1, 2, 3, 4, 5],
  fixtureTool: '#55 test adapter',
  customerFeatureAvailable: true,
  accounts,
};
const env = Object.fromEntries(
  Object.values(accounts).flatMap((prefix) => [
    [`${prefix}_EMAIL`, 'test@example.invalid'],
    [`${prefix}_PASSWORD`, 'unit-test-only'],
  ]),
);
const runId = 'd86b4f63-5acc-4f20-8da3-e24323268814';
const observation = {
  catalog: TEST_CATALOG,
  runId,
  orderId: 1,
  scheduleRows: 1,
  acceptedQuotes: 0,
  moneyReceipts: 0,
  reservations: 0,
  departures: 0,
};
describe('F06 acceptance environment guards (unit tests, not live integration)', () => {
  it('fails closed without opt-in before loading fixture tools', async () => {
    await expect(openReadiness({})).rejects.toMatchObject({ code: 'OPT_IN_REQUIRED' });
  });
  it('refuses a real/unknown database even with opt-in', async () => {
    await expect(
      openReadiness({ EQ_ACCEPTANCE_ENABLED: 'true', EQ_ACCEPTANCE_CATALOG: 'EquiTransit' }),
    ).rejects.toMatchObject({ code: 'CATALOG_NOT_APPROVED' });
  });
  it('requires a trusted shared fixture module', async () => {
    await expect(
      openReadiness({
        EQ_ACCEPTANCE_ENABLED: 'true',
        EQ_ACCEPTANCE_CATALOG: TEST_CATALOG,
        EQ_ACCEPTANCE_API_ORIGIN: inspection.apiOrigin,
      }),
    ).rejects.toMatchObject({ code: 'SHARED_55_FIXTURE_DRIVER_REQUIRED' });
  });
  it('accepts inspected test scope and environment-only credentials', () => {
    expect(validateInspection(inspection, inspection.apiOrigin, env).catalog).toBe(TEST_CATALOG);
  });
  it.each([
    { catalog: 'EquiTransit' },
    { apiOrigin: 'http://other-test-host:8080' },
    { migrations: [1, 2, 3, 4] },
    { customerFeatureAvailable: false },
    { apiOrigin: 'http://user:credential@localhost:8080/' },
  ])('rejects an unverified environment: %j', (patch) => {
    expect(() =>
      validateInspection({ ...inspection, ...patch }, inspection.apiOrigin, env),
    ).toThrow();
  });
  it('never accepts absent account credentials as usable fixtures', () => {
    expect(() => validateInspection(inspection, inspection.apiOrigin, {})).toThrow(
      'MISSING_MANAGER_CREDENTIALS',
    );
  });
  it('rejects a schema-pending target that actually has migration 005', () => {
    expect(() =>
      validateInspection(
        {
          ...inspection,
          schemaPendingTarget: {
            catalog: TEST_CATALOG,
            apiOrigin: inspection.apiOrigin,
            migrations: [5],
            orderId: 7,
          },
        },
        inspection.apiOrigin,
        env,
      ),
    ).toThrow('SCHEMA_PENDING_TARGET_ALREADY_HAS_005');
  });
  it('normalizes a verified secondary origin and refuses the primary origin', () => {
    const target = {
      catalog: TEST_CATALOG,
      apiOrigin: 'http://127.0.0.1:8081/',
      migrations: [1, 2, 3, 4],
      orderId: 7,
    };
    expect(
      validateInspection({ ...inspection, schemaPendingTarget: target }, inspection.apiOrigin, env)
        .schemaPendingTarget?.apiOrigin,
    ).toBe('http://127.0.0.1:8081');
    expect(() =>
      validateInspection(
        { ...inspection, schemaPendingTarget: { ...target, apiOrigin: inspection.apiOrigin } },
        inspection.apiOrigin,
        env,
      ),
    ).toThrow('SCHEMA_PENDING_TARGET_MUST_BE_DISTINCT');
  });
  it('refuses a frontend other than the inspected test deployment', () => {
    expect(() =>
      validateInspection(inspection, inspection.apiOrigin, {
        ...env,
        EQ_ACCEPTANCE_FE_ORIGIN: 'https://another-test-host/',
      }),
    ).toThrow('FRONTEND_ORIGIN_MISMATCH');
    expect(() =>
      validateInspection(inspection, inspection.apiOrigin, {
        ...env,
        EQ_ACCEPTANCE_FE_ORIGIN: 'http://user:credential@localhost/',
      }),
    ).toThrow('FRONTEND_ORIGIN_MISMATCH');
  });
  it('rejects unscoped, negative or cross-order observations', () => {
    const scenario = { runId, orderId: 1 } as Parameters<typeof validateObservation>[1];
    expect(validateObservation(observation, scenario)).toEqual(observation);
    for (const patch of [{ catalog: 'EquiTransit' }, { orderId: 2 }, { scheduleRows: -1 }])
      expect(() => validateObservation({ ...observation, ...patch }, scenario)).toThrow();
  });
  it('does not permit fixture ownership to cross runs', () => {
    expect(() =>
      validateScenario(
        { catalog: TEST_CATALOG, runId: 'e86b4f63-5acc-4f20-8da3-e24323268814' } as Parameters<
          typeof validateScenario
        >[0],
        runId,
      ),
    ).toThrow();
  });
  it.each([
    { catalog: 'EquiTransit', remaining: 0 },
    { catalog: TEST_CATALOG, remaining: 1 },
  ])('does not report incomplete or wrong-scope cleanup as successful: %j', (result) => {
    expect(() => validateCleanup(result)).toThrow();
  });
  it('accepts cleanup only in the exact test catalog with no fixture residue', () => {
    expect(() => validateCleanup({ catalog: TEST_CATALOG, remaining: 0 })).not.toThrow();
  });
  it('checks the real OpenAPI nested action contract and rejects an invented reason field', () => {
    const spec = {
      paths: {
        '/api/transport-orders/{orderId}/quotes': {},
        '/api/transport-orders/{orderId}/quotes/{quoteId}/actions': {},
      },
      components: { schemas: { QuoteActionRequest: { properties: { command: {}, action: {} } } } },
    };
    expect(() => validateLiveContract(spec)).not.toThrow();
    expect(() =>
      validateLiveContract({
        ...spec,
        components: {
          schemas: { QuoteActionRequest: { properties: { command: {}, action: {}, reason: {} } } },
        },
      }),
    ).toThrow();
    expect(() => validateLiveContract({ paths: {}, components: { schemas: {} } })).toThrow();
  });
});

describe('Live runner evidence settings', () => {
  it('allows headed and explicitly filtered runs', () => {
    expect(acceptanceArgs(['--headed', '--grep', 'F06-01'])).toEqual([
      '--headed',
      '--grep',
      'F06-01',
    ]);
    expect(acceptanceArgs(['--grep-invert=F06-27'])).toEqual(['--grep-invert=F06-27']);
  });
  it.each(['--trace=on', '--reporter=html', '--config=playwright.config.ts', '--grep'])(
    'refuses unsafe evidence/configuration override %s',
    (arg) => {
      expect(() => acceptanceArgs([arg])).toThrow('UNSUPPORTED_ACCEPTANCE_ARGUMENT');
    },
  );
});
describe('Acceptance reporting cannot turn missing evidence into a pass', () => {
  const all = CASE_IDS.map((id) => ({
    title: `${id} fixture test`,
    status: 'passed',
    durationMs: 1,
  }));
  it('only marks all 28 actually passed acceptance cases complete', () => {
    expect(summarize('passed', 28, all).acceptanceComplete).toBe(true);
  });
  it.each(['skipped', 'failed', 'timedOut', 'interrupted'])(
    'remains incomplete with one %s case',
    (status) => {
      expect(
        summarize('passed', 28, [...all.slice(0, -1), { ...all[27], status }]).acceptanceComplete,
      ).toBe(false);
    },
  );
  it('keeps a grep/partial run and setup failure incomplete', () => {
    expect(summarize('passed', 1, all.slice(0, 1)).acceptanceComplete).toBe(false);
    expect(summarize('failed', 0, []).acceptanceComplete).toBe(false);
    expect(summarize('passed', 28, all.slice(0, -1)).notExecuted).toBe(1);
  });
  it('refuses duplicate scenario IDs in place of missing coverage', () => {
    expect(summarize('passed', 28, [...all.slice(0, -1), all[0]]).acceptanceComplete).toBe(false);
  });
});
