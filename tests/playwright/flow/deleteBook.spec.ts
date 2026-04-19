import { expect, test } from '@playwright/test';

import { TEST_BOOK_TITLE } from '../fixtures/testEpubFile';
import { disableAnimations, importTestBook } from '../helpers/appHarness';
import { clickDeleteBook, confirmDelete } from '../helpers/bookDetailHarness';
import { getBookCardCount } from '../helpers/bookshelfHarness';

test.describe('delete book flow', () => {
  test('import → detail → delete → bookshelf empty', async ({ page }) => {
    // 1. Import a test book and land on detail page
    await importTestBook(page);
    await expect(page.getByRole('heading', { name: TEST_BOOK_TITLE, level: 1 })).toBeVisible();

    // 2. Click delete and confirm
    await clickDeleteBook(page);
    await confirmDelete(page);

    // 3. Should redirect to bookshelf
    await disableAnimations(page);
    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible({ timeout: 15_000 });

    // 4. Bookshelf should be empty (or at least the deleted book is gone)
    const count = await getBookCardCount(page);
    expect(count).toBe(0);

    // 5. Verify the deleted book title is not present
    await expect(page.getByRole('link', { name: TEST_BOOK_TITLE })).not.toBeVisible();
  });
});
