import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
  FullConfig,
} from '@playwright/test/reporter';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CASE_IDS } from './environment';

type Entry = { title: string; status: string; durationMs: number };
export function summarize(status: string, expected: number, results: Entry[]) {
  const counts = Object.fromEntries(
    ['passed', 'failed', 'skipped', 'timedOut', 'interrupted'].map((value) => [
      value,
      results.filter((x) => x.status === value).length,
    ]),
  );
  const found = new Set(results.map((row) => row.title.split(' ')[0]));
  return {
    status,
    expected,
    executed: results.filter((x) => x.status !== 'skipped').length,
    counts,
    notExecuted: Math.max(0, expected - results.length),
    acceptanceComplete:
      status === 'passed' &&
      expected === CASE_IDS.length &&
      results.length === expected &&
      counts.passed === expected &&
      CASE_IDS.every((id) => found.has(id)),
    results,
  };
}

/** Never serialize raw Playwright errors, requests, stdout, attachments or credentials. */
export default class SafeReporter implements Reporter {
  private results: { title: string; status: string; durationMs: number }[] = [];
  private expected = 0;
  onBegin(_config: FullConfig, suite: { allTests(): TestCase[] }) {
    this.expected = suite.allTests().length;
  }
  onTestEnd(test: TestCase, result: TestResult) {
    this.results.push({ title: test.title, status: result.status, durationMs: result.duration });
    process.stdout.write(`${result.status}: ${test.title}\n`);
  }
  onError() {
    process.stderr.write(
      'F06 runner/setup failed. Inspect sanitized preflight and fixture tooling diagnostics.\n',
    );
  }
  onEnd(result: FullResult) {
    mkdirSync(resolve('artifacts/f06'), { recursive: true });
    const report = summarize(result.status, this.expected, this.results);
    writeFileSync(
      resolve('artifacts/f06/acceptance-results.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    process.stdout.write(JSON.stringify({ ...report, results: undefined }) + '\n');
  }
}
