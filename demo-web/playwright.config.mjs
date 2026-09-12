import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', timeout: 45000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  reporter: [['list']],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
