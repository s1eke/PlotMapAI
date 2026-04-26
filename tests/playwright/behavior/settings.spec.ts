import { expect, test } from '@playwright/test';

import { navigateToSettings } from '../helpers/appHarness';
import { assertTabPanelVisible, switchTab } from '../helpers/settingsHarness';

test.describe('设置页行为', () => {
  test('TC-029 设置页标签存在且可切换到对应面板', async ({ page }) => {
    await navigateToSettings(page);

    await expect(page.getByRole('button', { name: 'Book Parsing Rules' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Purification Rules' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI Analysis Settings' })).toBeVisible();
    await assertTabPanelVisible(page, 'Book Parsing Rules');

    await switchTab(page, 'Purification Rules');
    await assertTabPanelVisible(page, 'Purification Rules');

    await switchTab(page, 'AI Analysis Settings');
    await assertTabPanelVisible(page, 'AI Analysis Settings');

    await switchTab(page, 'Book Parsing Rules');
    await assertTabPanelVisible(page, 'Book Parsing Rules');
  });

  test('TC-030 刷新后仍保留设置页面状态', async ({ page }) => {
    await navigateToSettings(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');
    await expect(page.getByRole('button', { name: 'Book Parsing Rules' })).toBeVisible();
  });
});
