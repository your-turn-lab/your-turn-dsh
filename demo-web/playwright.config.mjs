import { defineConfig } from '@playwright/test';
const baseURL = process.env.DEMO_BASE_URL || `http://127.0.0.1:${process.env.PORT || 4173}`;
export default defineConfig({
  testDir: './test/browser', timeout: 45000, workers: 1,
  use: { baseURL, viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  reporter: [['list']],
  webServer: process.env.DEMO_BASE_URL ? undefined : { command: 'npm run dev', url: baseURL, reuseExistingServer: !process.env.CI },
});
