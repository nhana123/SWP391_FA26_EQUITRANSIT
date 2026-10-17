import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { QuotePrepareInput } from '../../src/features/quotations/mutations';
import type { SupplierOfferInput } from '../../src/features/quotations/mutation-contracts';
import type { OrderDraft } from '../../src/shared/api/contracts';
import type { Preferences } from '../../src/features/booking-services/contracts';
import type { TariffCommand } from '../../src/features/service-pricing/contracts';

export const TEST_CATALOG = 'EquiTransit_FigmaMigrationTest_20261013_143729';
export const actors = [
  'manager',
  'coordinator',
  'customer',
  'foreignCustomer',
  'unassignedCoordinator',
  'specialist',
  'driver',
] as const;
export type Actor = (typeof actors)[number];
const actorRole = {
  manager: 'MANAGER',
  coordinator: 'COORDINATOR',
  customer: 'CUSTOMER',
  foreignCustomer: 'CUSTOMER',
  unassignedCoordinator: 'COORDINATOR',
  specialist: 'SPECIALIST',
  driver: 'DRIVER',
} as const;
export { actorRole };
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().nonnegative();
const origin = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    );
  }, 'Use a credential-free HTTP origin');
export const inspectionSchema = z.object({
  catalog: z.literal(TEST_CATALOG),
  apiOrigin: origin,
  frontendOrigin: origin,
  migrations: z.array(z.number().int()),
  fixtureTool: z.string().min(1),
  // Set by the authorized shared #55 adapter after inspecting its real environment.
  customerFeatureAvailable: z.boolean(),
  accounts: z.object(
    Object.fromEntries(
      actors.map((actor) => [actor, z.string().regex(/^EQ_TEST_[A-Z_]+$/)]),
    ) as Record<Actor, z.ZodString>,
  ),
  schemaPendingTarget: z
    .object({
      catalog: z.literal(TEST_CATALOG),
      apiOrigin: origin,
      migrations: z.array(z.number().int()),
      orderId: id,
    })
    .optional(),
});
export type Inspection = z.infer<typeof inspectionSchema>;
export const observationSchema = z.object({
  catalog: z.literal(TEST_CATALOG),
  runId: z.uuid(),
  orderId: id,
  scheduleRows: count,
  acceptedQuotes: count,
  moneyReceipts: count,
  reservations: count,
  departures: count,
});
export type Observation = z.infer<typeof observationSchema>;
const scenarioHeader = z.object({
  catalog: z.literal(TEST_CATALOG),
  runId: z.uuid(),
  scenarioId: z.uuid(),
  orderId: id,
  revisionId: id,
  orderNumber: z.string().min(1),
  provenance: z.string().min(1),
});
export type Scenario = z.infer<typeof scenarioHeader> & {
  prepare: QuotePrepareInput;
  offer: SupplierOfferInput;
  // Actual source-backed expectations from shared fixtures, never application examples.
  expectedTotal: string;
  expectedIncludedCodes: string[];
  revisionDraft: OrderDraft;
  services: Preferences;
  horseRecordVersion: string | null;
  tariff?: { id: number; replacement: Omit<TariffCommand, 'recordVersion' | 'operationId'> };
  existingQuoteId?: number;
};
export type Created = {
  quoteIds: number[];
  offerIds: number[];
  tariffIds: number[];
  operationIds: string[];
};

/** Extension point for issue #55's authorized fixture tooling, not an API endpoint. */
export interface FixtureDriver {
  inspect(): Promise<unknown>; // Read-only; must inspect actual catalog, migrations and FE build.
  createScenario(input: { runId: string; name: string }): Promise<Scenario>;
  observe(input: { runId: string; scenarioId: string; orderId: number }): Promise<unknown>;
  cleanupScenario(input: {
    runId: string;
    scenarioId: string;
    orderId: number;
    created: Created;
  }): Promise<{ catalog: string; remaining: number }>;
  finishRun(input: { runId: string }): Promise<{ catalog: string; remaining: number }>;
}
export type Readiness = {
  runId: string;
  apiOrigin: string;
  inspection: Inspection;
  driver: FixtureDriver;
};
export class AcceptanceBlocked extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`F06 acceptance blocked: ${code}`);
    this.code = code;
  }
}
export const CASE_IDS = Array.from(
  { length: 28 },
  (_, i) => `F06-${String(i + 1).padStart(2, '0')}`,
);
export function acceptanceArgs(args: string[]) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headed') continue;
    if (/^--grep(?:-invert)?=.+/.test(args[i])) continue;
    if (/^--grep(?:-invert)?$/.test(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      i++;
      continue;
    }
    throw new AcceptanceBlocked('UNSUPPORTED_ACCEPTANCE_ARGUMENT');
  }
  return args;
}
export function validateLiveContract(raw: unknown) {
  const spec = z
    .object({
      paths: z.record(z.string(), z.unknown()),
      components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
    })
    .safeParse(raw);
  if (!spec.success) throw new AcceptanceBlocked('OPENAPI_CONTRACT_UNAVAILABLE');
  for (const path of [
    '/api/transport-orders/{orderId}/quotes',
    '/api/transport-orders/{orderId}/quotes/{quoteId}/actions',
  ])
    if (!spec.data.paths[path]) throw new AcceptanceBlocked('F06_OPENAPI_PATH_MISSING');
  const schema = spec.data.components.schemas.QuoteActionRequest as
    { properties?: Record<string, unknown> } | undefined;
  if (!schema?.properties?.command || !schema.properties.action || schema.properties.reason)
    throw new AcceptanceBlocked('QUOTE_ACTION_OPENAPI_MISMATCH');
}
export function validateInspection(raw: unknown, apiOrigin: string, env: NodeJS.ProcessEnv) {
  const parsed = inspectionSchema.safeParse(raw);
  if (!parsed.success) throw new AcceptanceBlocked('INVALID_OR_UNAPPROVED_TEST_ENVIRONMENT');
  const info = parsed.data;
  const frontend = origin.safeParse(env.EQ_ACCEPTANCE_FE_ORIGIN || 'http://127.0.0.1:5173');
  if (!frontend.success || new URL(info.frontendOrigin).origin !== new URL(frontend.data).origin)
    throw new AcceptanceBlocked('FRONTEND_ORIGIN_MISMATCH');
  if (new URL(info.apiOrigin).origin !== apiOrigin)
    throw new AcceptanceBlocked('BACKEND_ORIGIN_MISMATCH');
  if (![1, 2, 3, 4, 5].every((n) => info.migrations.includes(n)))
    throw new AcceptanceBlocked('MIGRATION_005_NOT_DEPLOYED');
  if (!info.customerFeatureAvailable)
    throw new AcceptanceBlocked('CUSTOMER_FEATURE_60_NOT_IN_TEST_BUILD');
  for (const actor of actors) {
    const prefix = info.accounts[actor];
    if (!env[`${prefix}_EMAIL`] || !env[`${prefix}_PASSWORD`])
      throw new AcceptanceBlocked(`MISSING_${actor.toUpperCase()}_CREDENTIALS`);
  }
  if (info.schemaPendingTarget?.migrations.includes(5))
    throw new AcceptanceBlocked('SCHEMA_PENDING_TARGET_ALREADY_HAS_005');
  if (info.schemaPendingTarget) {
    info.schemaPendingTarget.apiOrigin = new URL(info.schemaPendingTarget.apiOrigin).origin;
    if (info.schemaPendingTarget.apiOrigin === apiOrigin)
      throw new AcceptanceBlocked('SCHEMA_PENDING_TARGET_MUST_BE_DISTINCT');
  }
  return info;
}
export async function openReadiness(env: NodeJS.ProcessEnv = process.env): Promise<Readiness> {
  if (env.EQ_ACCEPTANCE_ENABLED !== 'true') throw new AcceptanceBlocked('OPT_IN_REQUIRED');
  if (env.EQ_ACCEPTANCE_CATALOG !== TEST_CATALOG)
    throw new AcceptanceBlocked('CATALOG_NOT_APPROVED');
  const api = origin.safeParse(env.EQ_ACCEPTANCE_API_ORIGIN);
  if (!api.success) throw new AcceptanceBlocked('TEST_BACKEND_ORIGIN_REQUIRED');
  const modulePath = env.EQ_ACCEPTANCE_FIXTURE_DRIVER;
  if (!modulePath || !isAbsolute(modulePath))
    throw new AcceptanceBlocked('SHARED_55_FIXTURE_DRIVER_REQUIRED');
  let driver: FixtureDriver;
  try {
    const loaded = await import(pathToFileURL(modulePath).href);
    driver = loaded.default;
  } catch {
    throw new AcceptanceBlocked('FIXTURE_DRIVER_LOAD_FAILED');
  }
  if (
    !driver ||
    !['inspect', 'createScenario', 'observe', 'cleanupScenario', 'finishRun'].every(
      (name) => typeof driver[name as keyof FixtureDriver] === 'function',
    )
  )
    throw new AcceptanceBlocked('FIXTURE_DRIVER_CONTRACT_INVALID');
  let inspected: unknown;
  try {
    inspected = await driver.inspect();
  } catch {
    throw new AcceptanceBlocked('READ_ONLY_ENVIRONMENT_INSPECTION_FAILED');
  }
  const apiOrigin = new URL(api.data).origin;
  const inspection = validateInspection(inspected, apiOrigin, env);
  try {
    const response = await fetch(`${apiOrigin}/v3/api-docs`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new AcceptanceBlocked('LIVE_OPENAPI_READ_FAILED');
    validateLiveContract(await response.json());
  } catch (error) {
    throw error instanceof AcceptanceBlocked
      ? error
      : new AcceptanceBlocked('LIVE_BACKEND_UNREACHABLE');
  }
  return { runId: randomUUID(), apiOrigin, inspection, driver };
}
export function validateScenario(raw: Scenario, runId: string): Scenario {
  const parsed = scenarioHeader.safeParse(raw);
  if (!parsed.success || parsed.data.runId !== runId)
    throw new AcceptanceBlocked('FIXTURE_SCOPE_MISMATCH');
  if (raw.prepare.revisionId !== raw.revisionId || raw.offer.revisionId !== raw.revisionId)
    throw new AcceptanceBlocked('FIXTURE_REVISION_MISMATCH');
  if (!/^\d+(\.\d{1,2})?$/.test(raw.expectedTotal))
    throw new AcceptanceBlocked('SOURCE_BACKED_EXPECTED_TOTAL_REQUIRED');
  return raw;
}
export function validateObservation(raw: unknown, scenario: Scenario): Observation {
  const parsed = observationSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.runId !== scenario.runId ||
    parsed.data.orderId !== scenario.orderId
  )
    throw new AcceptanceBlocked('OBSERVATION_SCOPE_MISMATCH');
  return parsed.data;
}
export function credentials(info: Inspection, actor: Actor) {
  const prefix = info.accounts[actor];
  return { email: process.env[`${prefix}_EMAIL`]!, password: process.env[`${prefix}_PASSWORD`]! };
}
export function validateCleanup(raw: { catalog: string; remaining: number }) {
  if (raw.catalog !== TEST_CATALOG || raw.remaining !== 0)
    throw new AcceptanceBlocked('FIXTURE_CLEANUP_INCOMPLETE');
}
