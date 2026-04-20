import { expect, test } from '@playwright/test';

import { navigateToSettings } from '../helpers/appHarness';
import { assertTabPanelVisible, switchTab } from '../helpers/settingsHarness';

test.describe('settings behavior', () => {
  test('three tabs are present and switchable', async ({ page }) => {
    await navigateToSettings(page);

    await expect(page.getByRole('button', { name: 'Book Parsing Rules' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Purification Rules' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI Analysis Settings' })).toBeVisible();
  });

  test('TOC tab panel is visible when selected', async ({ page }) => {
    await navigateToSettings(page);
    await assertTabPanelVisible(page, 'Book Parsing Rules');
  });

  test('Purification tab panel is visible when selected', async ({ page }) => {
    await navigateToSettings(page);
    await assertTabPanelVisible(page, 'Purification Rules');
  });

  test('AI Settings tab panel is visible when selected', async ({ page }) => {
    await navigateToSettings(page);
    await assertTabPanelVisible(page, 'AI Analysis Settings');
  });

  test('switching between all tabs works correctly', async ({ page }) => {
    await navigateToSettings(page);

    await switchTab(page, 'Purification Rules');
    await expect(page.locator('.glass').first()).toBeVisible();

    await switchTab(page, 'AI Analysis Settings');
    await expect(page.locator('.glass').first()).toBeVisible();

    await switchTab(page, 'Book Parsing Rules');
    await expect(page.locator('.glass').first()).toBeVisible();
  });

  test('settings page persists across reload', async ({ page }) => {
    await navigateToSettings(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');
    await expect(page.getByRole('button', { name: 'Book Parsing Rules' })).toBeVisible();
  });
});
