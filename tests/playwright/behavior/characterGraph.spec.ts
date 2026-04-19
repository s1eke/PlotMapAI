import { expect, test } from '@playwright/test';

import { importTestBook, navigateToCharacterGraph } from '../helpers/appHarness';
import { assertEmptyState, clickBackToBookDetail } from '../helpers/characterGraphHarness';

test.describe('character graph behavior', () => {
  test('shows empty state with correct message', async ({ page }) => {
    const { novelId } = await importTestBook(page);
    await navigateToCharacterGraph(page, novelId);
    await assertEmptyState(page);
    await expect(page.getByText('Start AI analysis from the book page first')).toBeVisible();
  });

  test('empty state has a link back to book detail', async ({ page }) => {
    const { novelId } = await importTestBook(page);
    await navigateToCharacterGraph(page, novelId);
    await assertEmptyState(page);
    await expect(page.getByRole('link', { name: /analysis/i })).toBeVisible();
  });

  test('back navigation returns to book detail', async ({ page }) => {
    const { novelId, title } = await importTestBook(page);
    await navigateToCharacterGraph(page, novelId);

    await clickBackToBookDetail(page);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });
});
