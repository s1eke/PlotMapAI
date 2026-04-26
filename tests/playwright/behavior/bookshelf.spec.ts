import { expect, test } from '@playwright/test';

import { buildTestTxtFile } from '../fixtures/testEpubFile';
import { navigateToBookshelf } from '../helpers/appHarness';
import {
  getBookCardCount,
  openUploadModal,
  uploadEpubFile,
} from '../helpers/bookshelfHarness';

test.describe('书架行为', () => {
  test('TC-011 单个 EPUB 上传成功并显示书籍卡片', async ({ page }) => {
    await navigateToBookshelf(page);
    await openUploadModal(page);
    await expect(page.locator('input[type="file"]')).toBeAttached();
    await uploadEpubFile(page);

    const count = await getBookCardCount(page);
    expect(count).toBe(1);
  });

  test('TC-012 单个 TXT 上传成功并显示书籍卡片', async ({ page }) => {
    await navigateToBookshelf(page);
    await openUploadModal(page);

    const txtPayload = buildTestTxtFile();
    const fileInput = page.locator('input[type="file"][accept=".txt,.epub"]');
    await fileInput.setInputFiles(txtPayload);

    await expect(page.getByTestId('bookshelf-grid')).toBeVisible({ timeout: 30_000 });
    const count = await getBookCardCount(page);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('TC-013 多本书上传后显示多张书籍卡片', async ({ page }) => {
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
