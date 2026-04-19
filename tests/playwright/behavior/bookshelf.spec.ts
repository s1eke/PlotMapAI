import { expect, test } from '@playwright/test';

import { buildTestTxtFile, TEST_BOOK_TITLE } from '../fixtures/testEpubFile';
import { navigateToBookshelf } from '../helpers/appHarness';
import {
  clickBookCard,
  getBookCardCount,
  openUploadModal,
  uploadEpubFile,
} from '../helpers/bookshelfHarness';

test.describe('bookshelf behavior', () => {
  test('shows empty state when no books exist', async ({ page }) => {
    await navigateToBookshelf(page);
    await expect(page.getByText('Bookshelf is empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' }).first()).toBeVisible();
  });

  test('upload button opens upload modal', async ({ page }) => {
    await navigateToBookshelf(page);
    await openUploadModal(page);
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test('single EPUB upload succeeds and book card appears', async ({ page }) => {
    await navigateToBookshelf(page);
    await openUploadModal(page);
    await uploadEpubFile(page);

    const count = await getBookCardCount(page);
    expect(count).toBe(1);
  });

  test('single TXT upload succeeds and book card appears', async ({ page }) => {
    await navigateToBookshelf(page);
    await openUploadModal(page);

    const txtPayload = buildTestTxtFile();
    const fileInput = page.locator('input[type="file"][accept=".txt,.epub"]');
    await fileInput.setInputFiles(txtPayload);

    await expect(page.getByTestId('bookshelf-grid')).toBeVisible({ timeout: 30_000 });
    const count = await getBookCardCount(page);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('book card click navigates to detail page', async ({ page }) => {
    await navigateToBookshelf(page);
    await openUploadModal(page);
    await uploadEpubFile(page);

    await clickBookCard(page, TEST_BOOK_TITLE);
    await expect(page.getByRole('heading', { name: TEST_BOOK_TITLE, level: 1 })).toBeVisible();
  });

  test('multiple EPUB uploads produce multiple book cards', async ({ page }) => {
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
