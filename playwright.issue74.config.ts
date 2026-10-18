import { defineConfig } from '@playwright/test';

// Browser UI regression with mocked API. This is not live BE acceptance.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/service-preferences.spec.ts',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  globalTimeout: 45_000,
  outputDir: 'artifacts/issue74/browser',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5184',
    viewport: { width: 1440, height: 1000 },
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: 'npm run dev -- --port 5184 --strictPort',
    url: 'http://127.0.0.1:5184',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
