import { test, expect } from '@playwright/test';

test.describe('/whale-tracker', () => {
  test('renders header and Risk Dashboard CTA', async ({ page }) => {
    await page.goto('/whale-tracker');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText(/WHALE TRACKER/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Risk Dashboard/i })).toBeVisible();
  });

  test('Risk Dashboard link navigates to /portfolio/risk', async ({ page }) => {
    await page.goto('/whale-tracker');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: /Risk Dashboard/i }).click();
    await page.waitForURL(/\/portfolio\/risk/);
    expect(page.url()).toMatch(/\/portfolio\/risk$/);
  });
});
