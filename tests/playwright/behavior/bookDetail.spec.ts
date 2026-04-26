import { expect, test } from '@playwright/test';

import { importTestBook } from '../helpers/appHarness';
import {
  cancelDelete,
  clickBackToBookshelf,
  clickDeleteBook,
  clickStartReading,
  clickViewCharacterGraph,
  confirmDelete,
  getBookTitle,
} from '../helpers/bookDetailHarness';

test.describe('书籍详情行为', () => {
  test('TC-025 正确展示书籍元数据', async ({ page }) => {
    const { title } = await importTestBook(page);
    const displayedTitle = await getBookTitle(page);
    expect(displayedTitle).toContain(title);
    await expect(page.getByRole('link', { name: 'Start Reading' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Character Graph' })).toBeVisible();
  });

  test('TC-026 点击“开始阅读”可进入阅读器', async ({ page }) => {
    await importTestBook(page);
    await clickStartReading(page);
    await expect(page.getByTestId('reader-viewport')).toBeVisible();
  });

  test('TC-027 点击“查看人物关系图”可进入图谱页', async ({ page }) => {
    await importTestBook(page);
    await clickViewCharacterGraph(page);
    await expect(page.getByText('No character graph is available yet.')).toBeVisible();
  });

  test('TC-028 点击“删除书籍”会打开确认对话框', async ({ page }) => {
    await importTestBook(page);
    await clickDeleteBook(page);
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.getByText(/Are you sure you want to delete/)).toBeVisible();
  });

  test('TC-029 取消删除会保留书籍', async ({ page }) => {
    const { title } = await importTestBook(page);
    await clickDeleteBook(page);
    await cancelDelete(page);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });

  test('TC-030 确认删除会移除书籍并返回书架', async ({ page }) => {
    const { title } = await importTestBook(page);
    await clickDeleteBook(page);
    await confirmDelete(page);

    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: title })).not.toBeVisible();
  });

  test('TC-031 返回按钮可回到书架', async ({ page }) => {
    await importTestBook(page);
    await clickBackToBookshelf(page);
    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible();
  });
});
