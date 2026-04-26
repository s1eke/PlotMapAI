import { expect, test } from '@playwright/test';

import { navigateToBookshelf } from '../helpers/appHarness';

test.describe('路由冒烟测试', () => {
  test('TC-001 App Shell 可进入设置页并通过 Logo 返回书架', async ({ page }) => {
    await navigateToBookshelf(page);
    await page.locator('a[title="Settings"]').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');

    await page.getByText('PlotMapAI').first().click();
    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible();
  });

  test('TC-002 主题切换可更新配色方案', async ({ page }) => {
    await navigateToBookshelf(page);
    const shell = page.getByTestId('app-layout-shell');
    const initialBg = await shell.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.locator('header button').first().click();
    await expect.poll(async () => {
      return shell.evaluate((el) => getComputedStyle(el).backgroundColor);
    }).not.toBe(initialBg);
  });
});
