import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/manual-payments.spec.ts',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  globalTimeout: 45_000,
  outputDir: 'artifacts/issue76/browser',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5186',
    viewport: { width: 1440, height: 1000 },
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: 'npm run dev -- --port 5186 --strictPort',
    url: 'http://127.0.0.1:5186',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
