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

test.describe('book detail behavior', () => {
  test('renders book metadata correctly', async ({ page }) => {
    const { title } = await importTestBook(page);
    const displayedTitle = await getBookTitle(page);
    expect(displayedTitle).toContain(title);
    await expect(page.getByRole('link', { name: 'Start Reading' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Character Graph' })).toBeVisible();
  });

  test('"Start Reading" navigates to reader', async ({ page }) => {
    await importTestBook(page);
    await clickStartReading(page);
    await expect(page.getByTestId('reader-viewport')).toBeVisible();
  });

  test('"View Character Graph" navigates to graph page', async ({ page }) => {
    await importTestBook(page);
    await clickViewCharacterGraph(page);
    await expect(page.getByText('No character graph is available yet.')).toBeVisible();
  });

  test('"Delete Book" opens confirmation dialog', async ({ page }) => {
    await importTestBook(page);
    await clickDeleteBook(page);
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.getByText(/Are you sure you want to delete/)).toBeVisible();
  });

  test('cancel delete keeps book intact', async ({ page }) => {
    const { title } = await importTestBook(page);
    await clickDeleteBook(page);
    await cancelDelete(page);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });

  test('confirm delete removes book and navigates to bookshelf', async ({ page }) => {
    const { title } = await importTestBook(page);
    await clickDeleteBook(page);
    await confirmDelete(page);

    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: title })).not.toBeVisible();
  });

  test('back button returns to bookshelf', async ({ page }) => {
    await importTestBook(page);
    await clickBackToBookshelf(page);
    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible();
  });
});
