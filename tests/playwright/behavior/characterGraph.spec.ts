import { expect, test } from '@playwright/test';

import { importTestBook, navigateToCharacterGraph } from '../helpers/appHarness';
import { clickBackToBookDetail } from '../helpers/characterGraphHarness';

test.describe('人物关系图行为', () => {
  test('TC-048 返回导航可回到书籍详情', async ({ page }) => {
    const { novelId, title } = await importTestBook(page);
    await navigateToCharacterGraph(page, novelId);

    await clickBackToBookDetail(page);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });
});
