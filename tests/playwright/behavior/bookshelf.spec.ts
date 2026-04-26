import { expect, test } from '@playwright/test';

import { buildTestTxtFile, TEST_BOOK_TITLE } from '../fixtures/testEpubFile';
import { navigateToBookshelf } from '../helpers/appHarness';
import {
  clickBookCard,
  getBookCardCount,
  openUploadModal,
  uploadEpubFile,
} from '../helpers/bookshelfHarness';

test.describe('书架行为', () => {
  test('TC-020 上传按钮可打开上传弹窗', async ({ page }) => {
    await navigateToBookshelf(page);
    await openUploadModal(page);
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test('TC-021 单个 EPUB 上传成功并显示书籍卡片', async ({ page }) => {
    await navigateToBookshelf(page);
    await openUploadModal(page);
    await uploadEpubFile(page);

    const count = await getBookCardCount(page);
    expect(count).toBe(1);
  });

  test('TC-022 单个 TXT 上传成功并显示书籍卡片', async ({ page }) => {
    await navigateToBookshelf(page);
    await openUploadModal(page);

    const txtPayload = buildTestTxtFile();
    const fileInput = page.locator('input[type="file"][accept=".txt,.epub"]');
    await fileInput.setInputFiles(txtPayload);

    await expect(page.getByTestId('bookshelf-grid')).toBeVisible({ timeout: 30_000 });
    const count = await getBookCardCount(page);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('TC-023 点击书籍卡片可进入详情页', async ({ page }) => {
    await navigateToBookshelf(page);
    await openUploadModal(page);
    await uploadEpubFile(page);

    await clickBookCard(page, TEST_BOOK_TITLE);
    await expect(page.getByRole('heading', { name: TEST_BOOK_TITLE, level: 1 })).toBeVisible();
  });

  test('TC-024 多个 EPUB 上传后显示多张书籍卡片', async ({ page }) => {
    await navigateToBookshelf(page);
    await openUploadModal(page);
    await uploadEpubFile(page);

    const countAfterFirst = await getBookCardCount(page);
    expect(countAfterFirst).toBe(1);

    await page.getByRole('button', { name: 'Upload' }).first().click();
    const txtPayload = buildTestTxtFile();
    const fileInput = page.locator('input[type="file"][accept=".txt,.epub"]');
    await fileInput.setInputFiles(txtPayload);

    await expect.poll(async () => getBookCardCount(page), {
      timeout: 30_000,
    }).toBeGreaterThanOrEqual(2);
  });
});
