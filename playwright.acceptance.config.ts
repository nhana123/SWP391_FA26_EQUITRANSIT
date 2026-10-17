import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/acceptance',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90000,
  forbidOnly: true,
  globalSetup: './tests/acceptance/setup.ts',
  reporter: [['./tests/acceptance/reporter.ts']],
  outputDir: 'artifacts/f06/browser',
  use: {
    baseURL: process.env.EQ_ACCEPTANCE_FE_ORIGIN || 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    // Raw browser traces contain bearer headers and login bodies. Emit safe evidence explicitly.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  // The environment must be verified before starting this runner (see test:acceptance).
  webServer: process.env.EQ_ACCEPTANCE_FE_ORIGIN
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:5173',
        timeout: 15000,
        reuseExistingServer: false,
        env: { VITE_API_BASE_URL: process.env.EQ_ACCEPTANCE_API_ORIGIN || '' },
      },
});
