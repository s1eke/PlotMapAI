import { expect, test } from '@playwright/test';

import { navigateToBookshelf } from '../helpers/appHarness';

test.describe('空状态', () => {
  test('TC-003 未导入书籍时书架显示空提示', async ({ page }) => {
    await navigateToBookshelf(page);
    await expect(page.getByText('Bookshelf is empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' }).first()).toBeVisible();
  });
});
