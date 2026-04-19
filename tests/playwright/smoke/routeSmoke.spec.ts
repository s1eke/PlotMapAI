import { expect, test } from '@playwright/test';

import {
  assertHeaderHidden,
  assertHeaderVisible,
  importTestBook,
  navigateToBookshelf,
  navigateToCharacterGraph,
  navigateToReader,
  navigateToSettings,
} from '../helpers/appHarness';

test.describe('route smoke tests', () => {
  test('bookshelf page renders', async ({ page }) => {
    await navigateToBookshelf(page);
    await assertHeaderVisible(page);
    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My Bookshelf');
  });

  test('settings page renders with three tabs', async ({ page }) => {
    await navigateToSettings(page);
    await assertHeaderVisible(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');
    await expect(page.getByRole('button', { name: 'Book Parsing Rules' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Purification Rules' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI Analysis Settings' })).toBeVisible();
  });

  test('book detail page renders after importing a book', async ({ page }) => {
    const { title } = await importTestBook(page);
    await assertHeaderVisible(page);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start Reading' })).toBeVisible();
  });

  test('reader page renders and hides header', async ({ page }) => {
    const { novelId } = await importTestBook(page);
    await navigateToReader(page, novelId);
    await expect(page.getByTestId('reader-viewport')).toBeVisible({ timeout: 30_000 });
    await assertHeaderHidden(page);
  });

  test('character graph page renders empty state', async ({ page }) => {
    const { novelId } = await importTestBook(page);
    await navigateToCharacterGraph(page, novelId);
    await expect(page.getByText('No character graph is available yet.')).toBeVisible();
  });

  test('header logo navigates to bookshelf', async ({ page }) => {
    await navigateToSettings(page);
    await page.getByText('PlotMapAI').first().click();
    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible();
  });

  test('header settings icon navigates to settings', async ({ page }) => {
    await navigateToBookshelf(page);
    await page.locator('a[title="Settings"]').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');
  });

  test('theme toggle changes color scheme', async ({ page }) => {
    await navigateToBookshelf(page);
    const shell = page.getByTestId('app-layout-shell');
    const initialBg = await shell.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.locator('header button').first().click();
    await expect.poll(async () => {
      return shell.evaluate((el) => getComputedStyle(el).backgroundColor);
    }).not.toBe(initialBg);
  });
});
