import { expect, test } from '@playwright/test';

import { importTestBook } from '../helpers/appHarness';
import { clickViewCharacterGraph } from '../helpers/bookDetailHarness';
import { clickBackToBookDetail } from '../helpers/characterGraphHarness';

test.describe('人物关系图行为', () => {
  test('TC-017 可从书籍详情进入空图谱并返回详情', async ({ page }) => {
    const { title } = await importTestBook(page);
    await clickViewCharacterGraph(page);

    await expect(page.getByText('No character graph is available yet.')).toBeVisible();
    await expect(page.getByText('Start AI analysis from the book page first')).toBeVisible();

    await clickBackToBookDetail(page);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });
});
