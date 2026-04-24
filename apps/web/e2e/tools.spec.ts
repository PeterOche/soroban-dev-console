import { test, expect } from '@playwright/test';

test.describe('Tools & Tx-Builder', () => {
  test('should navigate to tools page', async ({ page }) => {
    await page.goto('/tools');
    
    await expect(page).toHaveURL(/.*tools/);
  });

  test('should display tools UI', async ({ page }) => {
    await page.goto('/tools');
    
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();
  });

  test('should navigate to tx-builder', async ({ page }) => {
    await page.goto('/tools/tx-builder');
    
    await expect(page).toHaveURL(/.*tx-builder/);
  });

  test('should display tx-builder UI', async ({ page }) => {
    await page.goto('/tools/tx-builder');
    
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();
  });
});
