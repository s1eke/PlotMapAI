import { expect, test } from '@playwright/test';

import { importTestBook } from '../helpers/appHarness';
import {
  cancelDelete,
  clickBackToBookshelf,
  clickDeleteBook,
  confirmDelete,
  getBookTitle,
} from '../helpers/bookDetailHarness';

test.describe('书籍详情行为', () => {
  test('TC-014 正确展示书籍元数据', async ({ page }) => {
    const { title } = await importTestBook(page);
    const displayedTitle = await getBookTitle(page);
    expect(displayedTitle).toContain(title);
    await expect(page.getByRole('link', { name: 'Start Reading' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Character Graph' })).toBeVisible();
  });

  test('TC-015 删除书籍可取消确认或确认移除', async ({ page }) => {
    const { title } = await importTestBook(page);
    await clickDeleteBook(page);
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.getByText(/Are you sure you want to delete/)).toBeVisible();
    await cancelDelete(page);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

    await clickDeleteBook(page);
    await confirmDelete(page);

    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: title })).not.toBeVisible();
    await expect(page.getByText('Bookshelf is empty')).toBeVisible();
  });

  test('TC-016 返回按钮可回到书架', async ({ page }) => {
    await importTestBook(page);
    await clickBackToBookshelf(page);
    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible();
  });
});
