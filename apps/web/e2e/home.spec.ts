import { test, expect } from '@playwright/test';

test.describe('Home Page & Navigation', () => {
  test('should load home page successfully', async ({ page }) => {
    await page.goto('/');
    
    await expect(page).toHaveTitle(/Soroban/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate to contracts page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /contracts/i }).click();
    
    await expect(page).toHaveURL(/.*contracts/);
  });

  test('should navigate to deploy page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /deploy/i }).click();
    
    await expect(page).toHaveURL(/.*deploy/);
  });

  test('should navigate to tools page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /tools/i }).click();
    
    await expect(page).toHaveURL(/.*tools/);
  });

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /settings/i }).click();
    
    await expect(page).toHaveURL(/.*settings/);
  });

  test('should have consistent layout across routes', async ({ page }) => {
    const routes = ['/', '/contracts', '/deploy', '/tools', '/settings'];
    
    for (const route of routes) {
      await page.goto(route);
      const header = page.locator('header, nav').first();
      await expect(header).toBeVisible();
    }
  });
});
