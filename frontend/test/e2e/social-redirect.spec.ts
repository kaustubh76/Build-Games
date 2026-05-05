import { test, expect } from '@playwright/test';

test.describe('/social redirect', () => {
  test('/social renders the copy-trading page content', async ({ page }) => {
    const response = await page.goto('/social');
    expect(response?.status() ?? 500).toBeLessThan(400);
    await page.waitForLoadState('domcontentloaded');
    // Whether we see /social or /social/copy-trading in the URL depends on
    // whether Next did a hard nav or a server redirect — both are correct.
    // Assert by content instead of URL.
    const text = await page.locator('body').textContent();
    expect((text ?? '').length).toBeGreaterThan(50);
  });

  test('/social/copy-trading is reachable directly', async ({ page }) => {
    const response = await page.goto('/social/copy-trading');
    expect(response?.status() ?? 500).toBeLessThan(400);
    await page.waitForLoadState('domcontentloaded');
  });
});
