import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — runs e2e specs against a self-spawned Next dev server.
 *
 * Two viewports per spec: desktop 1280x800 and mobile 375x667. Mobile is the
 * regression-catcher for the responsive CSS work shipped this session.
 */
export default defineConfig({
  testDir: './test/e2e',
  timeout: 90_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // serialize to avoid hammering Fuji RPC
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
