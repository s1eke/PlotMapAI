import { expect, test } from '@playwright/test';

import { importTestBook, navigateToBookshelf, navigateToCharacterGraph } from '../helpers/appHarness';

test.describe('empty states', () => {
  test('bookshelf shows empty message when no books imported', async ({ page }) => {
    await navigateToBookshelf(page);
    await expect(page.getByText('Bookshelf is empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' }).first()).toBeVisible();
  });

  test('character graph shows empty state with guidance', async ({ page }) => {
    const { novelId } = await importTestBook(page);
    await navigateToCharacterGraph(page, novelId);

    await expect(page.getByText('No character graph is available yet.')).toBeVisible();
    await expect(page.getByText('Start AI analysis from the book page first')).toBeVisible();
  });

  test('bookshelf shows empty again after deleting the only book', async ({ page }) => {
    await importTestBook(page);

    // Delete the only book
    await page.getByRole('button', { name: 'Delete Book' }).click();
    await page.getByRole('button', { name: /confirm|delete/i }).last().click();

    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Bookshelf is empty')).toBeVisible();
  });
});
