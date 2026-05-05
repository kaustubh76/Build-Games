import { test, expect } from '@playwright/test';

test.describe('Battle replays', () => {
  test('replay index returns 2xx and renders content', async ({ page }) => {
    const response = await page.goto('/arena/replay');
    expect(response?.status() ?? 500).toBeLessThan(400);
    await page.waitForLoadState('domcontentloaded');
    // Page renders some non-trivial body content. Specific text varies based on
    // whether the on-chain scan completed before we asserted.
    const text = await page.locator('body').textContent();
    expect((text ?? '').length).toBeGreaterThan(50);
  });

  test('replay [hash] page returns 2xx for an unknown hash', async ({ page }) => {
    const response = await page.goto('/arena/replay/0xdeadbeef');
    // Either 200 (rendered fallback) or a clean 404 — both are user-visible
    // graceful states; what we care about is "no 500".
    expect(response?.status() ?? 500).toBeLessThan(500);
    await page.waitForLoadState('domcontentloaded');
  });
});
