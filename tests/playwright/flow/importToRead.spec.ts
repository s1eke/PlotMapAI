import { expect, test } from '@playwright/test';

import { buildTestEpubFile, TEST_BOOK_TITLE } from '../fixtures/testEpubFile';
import { disableAnimations } from '../helpers/appHarness';

test.describe('import to read flow', () => {
  test('complete happy path: upload → bookshelf → detail → reader → back', async ({ page }) => {
    // 1. Start at bookshelf (empty)
    await page.goto('/');
    await disableAnimations(page);
    await expect(page.getByText('Bookshelf is empty')).toBeVisible();

    // 2. Upload an EPUB file
    await page.getByRole('button', { name: 'Upload' }).first().click();
    await page.locator('input[type="file"][accept=".txt,.epub"]').setInputFiles(
      await buildTestEpubFile(),
    );

    // 3. Verify book card appears in grid
    await expect(page.getByRole('link', { name: TEST_BOOK_TITLE })).toBeVisible({
      timeout: 30_000,
    });

    // 4. Click book card → arrive at book detail
    await page.getByRole('link', { name: TEST_BOOK_TITLE }).click();
    await disableAnimations(page);
    await expect(page.getByRole('heading', { name: TEST_BOOK_TITLE, level: 1 })).toBeVisible();

    // 5. Click "Start Reading" → arrive at reader
    await page.getByRole('link', { name: 'Start Reading' }).click();
    await disableAnimations(page);
    await expect(page.getByTestId('reader-viewport')).toBeVisible({ timeout: 30_000 });

    // 6. Verify reader displays chapter content
    await expect(page.getByText('The first sentence of the test book')).toBeVisible();

    // 7. Exit reader → return to book detail
    await page.goBack();
    await disableAnimations(page);
    await expect(page.getByRole('heading', { name: TEST_BOOK_TITLE, level: 1 })).toBeVisible();

    // 8. Navigate back to bookshelf → book still listed
    await page.getByRole('link', { name: 'Back' }).first().click();
    await disableAnimations(page);
    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible();
    await expect(page.getByRole('link', { name: TEST_BOOK_TITLE })).toBeVisible();
  });
});
