import { test, expect } from '@playwright/test';

test.describe('Share Flow', () => {
  test('should navigate to share page', async ({ page }) => {
    await page.goto('/share');
    
    await expect(page).toHaveURL(/.*share/);
  });

  test('should display share UI', async ({ page }) => {
    await page.goto('/share');
    
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();
  });
});
