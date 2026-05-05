import { test, expect } from '@playwright/test';

const ROUTES = [
  '/',
  '/whale-tracker',
  '/portfolio',
  '/portfolio/risk',
  '/markets',
  '/leaderboard',
  '/arena',
  '/arena/replay',
  '/social/copy-trading',
  '/ai-agents',
  '/warriorsMinter',
];

test.describe('Smoke — every nav route renders', () => {
  for (const route of ROUTES) {
    test(`${route} returns 2xx and renders content`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status() ?? 500).toBeLessThan(400);
      await page.waitForLoadState('domcontentloaded');
      // Body should have non-trivial content (not just a blank doc)
      const text = await page.locator('body').textContent();
      expect((text ?? '').length).toBeGreaterThan(50);
    });
  }
});

test.describe('Home', () => {
  test('shows the wallet connect / explore feature grid', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // The QUICK_LINKS grid contains the literal strings "MARKETS", "AI AGENTS", etc.
    await expect(page.getByText('MARKETS', { exact: false }).first()).toBeVisible();
  });
});
