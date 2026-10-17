import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AcceptanceBlocked, CASE_IDS, openReadiness } from '../tests/acceptance/environment.ts';

export async function runPreflight() {
  const result: {
    status: string;
    code: string;
    executedBusinessTests: number;
    catalogVerified: boolean;
    expectedBusinessCases: number;
    acceptanceComplete: boolean;
  } = {
    status: 'blocked',
    code: 'PREFLIGHT_NOT_COMPLETED',
    executedBusinessTests: 0,
    catalogVerified: false,
    expectedBusinessCases: CASE_IDS.length,
    acceptanceComplete: false,
  };
  try {
    await openReadiness(); // inspect only: never provision, migrate, seed or clean fixtures.
    result.status = 'ready';
    result.code = 'TEST_ENVIRONMENT_VERIFIED';
    result.catalogVerified = true;
  } catch (error) {
    result.code = error instanceof AcceptanceBlocked ? error.code : 'PREFLIGHT_FAILED';
  }
  const output = resolve('artifacts/f06/preflight.json');
  await mkdir(resolve('artifacts/f06'), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result) + '\n');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runPreflight();
  process.exitCode = result.status === 'ready' ? 0 : 1;
}
