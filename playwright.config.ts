import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000', browserName: 'chromium', channel: process.env.CHEESIT_MOBILE_WEBKIT === '1' ? undefined : 'chrome', headless: true, viewport: { width: 390, height: 844 } },
  reporter: 'list',
});
