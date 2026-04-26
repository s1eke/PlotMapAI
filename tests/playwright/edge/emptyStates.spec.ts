import { expect, test } from '@playwright/test';

import { importTestBook, navigateToBookshelf, navigateToCharacterGraph } from '../helpers/appHarness';

test.describe('空状态', () => {
  test('TC-004 未导入书籍时书架显示空提示', async ({ page }) => {
    await navigateToBookshelf(page);
    await expect(page.getByText('Bookshelf is empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' }).first()).toBeVisible();
  });

  test('TC-005 人物关系图显示带引导的空状态', async ({ page }) => {
    const { novelId } = await importTestBook(page);
    await navigateToCharacterGraph(page, novelId);

    await expect(page.getByText('No character graph is available yet.')).toBeVisible();
    await expect(page.getByText('Start AI analysis from the book page first')).toBeVisible();
  });

  test('TC-006 删除唯一书籍后书架再次显示空状态', async ({ page }) => {
    await importTestBook(page);

    // Delete the only book
    await page.getByRole('button', { name: 'Delete Book' }).click();
    await page.getByRole('button', { name: /confirm|delete/i }).last().click();

    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Bookshelf is empty')).toBeVisible();
  });
});
