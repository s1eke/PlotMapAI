import { expect, test } from '@playwright/test';

import { navigateToSettings } from '../helpers/appHarness';
import { assertTabPanelVisible, switchTab } from '../helpers/settingsHarness';

test.describe('设置页行为', () => {
  test('TC-049 三个标签页均存在且可切换', async ({ page }) => {
    await navigateToSettings(page);

    await expect(page.getByRole('button', { name: 'Book Parsing Rules' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Purification Rules' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI Analysis Settings' })).toBeVisible();
  });

  test('TC-050 选中目录标签时显示对应面板', async ({ page }) => {
    await navigateToSettings(page);
    await assertTabPanelVisible(page, 'Book Parsing Rules');
  });

  test('TC-051 选中文本净化标签时显示对应面板', async ({ page }) => {
    await navigateToSettings(page);
    await assertTabPanelVisible(page, 'Purification Rules');
  });

  test('TC-052 选中 AI 设置标签时显示对应面板', async ({ page }) => {
    await navigateToSettings(page);
    await assertTabPanelVisible(page, 'AI Analysis Settings');
  });

  test('TC-053 各标签页之间切换正常', async ({ page }) => {
    await navigateToSettings(page);

    await switchTab(page, 'Purification Rules');
    await expect(page.locator('.glass').first()).toBeVisible();

    await switchTab(page, 'AI Analysis Settings');
    await expect(page.locator('.glass').first()).toBeVisible();

    await switchTab(page, 'Book Parsing Rules');
    await expect(page.locator('.glass').first()).toBeVisible();
  });

  test('TC-054 刷新后仍保留设置页面状态', async ({ page }) => {
    await navigateToSettings(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');
    await expect(page.getByRole('button', { name: 'Book Parsing Rules' })).toBeVisible();
  });
});
