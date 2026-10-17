import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { runPreflight } from './f06-preflight.ts';
import { acceptanceArgs } from '../tests/acceptance/environment.ts';

const result = await runPreflight();
if (result.status !== 'ready') process.exitCode = 1;
else {
  const exitCode = await new Promise<number>((resolveExit) => {
    const child = spawn(
      process.execPath,
      [
        resolve('node_modules/@playwright/test/cli.js'),
        'test',
        '--config',
        'playwright.acceptance.config.ts',
        ...acceptanceArgs(process.argv.slice(2)),
      ],
      { env: process.env, stdio: 'inherit', windowsHide: true },
    );
    child.once('error', () => resolveExit(1));
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  process.exitCode = exitCode;
}
