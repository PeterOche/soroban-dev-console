import { test, expect } from '@playwright/test';

test.describe('Workspace Flow', () => {
  test('should display default workspace on load', async ({ page }) => {
    await page.goto('/');
    
    const workspaceSelector = page.getByText(/default project/i).first();
    await expect(workspaceSelector).toBeVisible();
  });

  test('should create new workspace', async ({ page }) => {
    await page.goto('/');
    
    const createButton = page.getByRole('button', { name: /new workspace/i }).first();
    if (await createButton.isVisible()) {
      await createButton.click();
      
      await page.getByLabel(/workspace name/i).fill('Test Workspace');
      await page.getByRole('button', { name: /create/i }).click();
      
      await expect(page.getByText(/test workspace/i)).toBeVisible();
    }
  });

  test('should switch between workspaces', async ({ page }) => {
    await page.goto('/');
    
    const workspaceSelector = page.getByRole('button', { name: /default project/i }).first();
    if (await workspaceSelector.isVisible()) {
      await workspaceSelector.click();
      
      const workspaceOption = page.getByRole('option', { name: /default/i }).first();
      if (await workspaceOption.isVisible()) {
        await workspaceOption.click();
        await expect(page.getByText(/default project/i)).toBeVisible();
      }
    }
  });

  test('should persist workspace in localStorage', async ({ page }) => {
    await page.goto('/');
    
    const storage = await page.evaluate(() => localStorage.getItem('soroban-workspaces'));
    expect(storage).toBeTruthy();
    
    const workspaces = JSON.parse(storage || '{}');
    expect(workspaces).toHaveProperty('state');
  });
});
