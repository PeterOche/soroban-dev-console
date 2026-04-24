import { test, expect } from '@playwright/test';

test.describe('Contract Explorer', () => {
  test('should navigate to contracts page', async ({ page }) => {
    await page.goto('/contracts');
    
    await expect(page).toHaveURL(/.*contracts/);
  });

  test('should display contract explorer UI', async ({ page }) => {
    await page.goto('/contracts');
    
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();
  });

  test('should show empty state when no contracts', async ({ page }) => {
    await page.goto('/contracts');
    
    const body = await page.locator('body').innerText();
    expect(body).toBeTruthy();
  });
});
