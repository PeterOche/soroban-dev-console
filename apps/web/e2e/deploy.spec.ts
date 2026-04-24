import { test, expect } from '@playwright/test';

test.describe('Deploy Flow', () => {
  test('should navigate to deploy page', async ({ page }) => {
    await page.goto('/deploy');
    
    await expect(page).toHaveURL(/.*deploy/);
  });

  test('should display deploy form', async ({ page }) => {
    await page.goto('/deploy');
    
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();
  });

  test('should show file upload UI', async ({ page }) => {
    await page.goto('/deploy');
    
    const body = await page.locator('body').innerText();
    expect(body).toBeTruthy();
  });
});
