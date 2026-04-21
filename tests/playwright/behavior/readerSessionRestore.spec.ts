/**
 * 阅读进度持久化与恢复的 E2E 测试。
 *
 * 每个测试都遵循相同的模式：
 *   1. 导入一本书并产生真实的阅读进度（滚动、翻页、章节导航）。
 *   2. 等待进度刷新到 IndexedDB。
 *   3. 通过 SPA 导航（而非 page.reload）退出阅读器并立即重新进入。
 *   4. 断言阅读器恢复到保存的位置。
 */

import { expect, test } from '@playwright/test';

import {
  buildLongTestEpubFile,
  buildMultiChapterTestEpubFile,
  LONG_BOOK_TITLE,
  MULTI_CHAPTER_BOOK_CHAPTER_TITLES,
  MULTI_CHAPTER_BOOK_TITLE,
} from '../fixtures/testEpubFile';
import {
  clickNextPage,
  exitAndReopenReader,
  importEpubToDetailPage,
  navigateToChapterByTitle,
  openReaderDirect,
  openReaderFromDetailPage,
  revealReaderChrome,
  setReaderPreferences,
  waitForPersistedReadingProgress,
  waitForReaderBranch,
} from '../helpers/readerVisualHarness';

test.describe('reader session restore', () => {
  test('scroll mode: restores scroll position after SPA back-navigation', async ({ page }) => {
    // 1. 导入一本较长的单章节书籍并以滚动模式打开。
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );
    // 使用 openReaderDirect（会调用 page.reload()），以便应用重新读取我们刚设置的
    // localStorage 偏好设置。SPA 导航（openReaderFromDetailPage）
    // 不会重置内存中的偏好设置存储 —— 阅读器会沿用上一个测试中激活的
    // pageTurnMode。
    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    // 2. 滚动到章节的大约 40% 处。
    await page.getByTestId('reader-viewport').evaluate((viewport) => {
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = maxScrollTop * 0.4;
    });

    // 3. 等待进度写入 IndexedDB。
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) => s !== null && s.contentMode === 'scroll' && (s.chapterProgress ?? 0) > 0.15,
      { description: 'scroll progress > 15% persisted', timeout: 12_000 },
    );

    // 4. 通过 SPA 导航退出并重新进入。
    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');

    // 5a. 等待布局就绪（内容渲染并创建一个可滚动区域）。
    await expect.poll(
      async () => page.getByTestId('reader-viewport').evaluate((viewport) =>
        Math.max(0, viewport.scrollHeight - viewport.clientHeight)),
      { timeout: 20_000, message: 'Expected reader-viewport to have a non-zero scrollable range' },
    ).toBeGreaterThan(0);

    // 5b. 轮询直到阅读器恢复到一个有意义的滚动位置。
    //     恢复是异步的（先从 IndexedDB 水合，然后应用 scrollTop），
    //     因此我们无法在布局就绪后立即检查 scrollTop。
    await expect.poll(
      async () => page.getByTestId('reader-viewport').evaluate((viewport) => {
        const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        return maxScrollTop > 0 ? viewport.scrollTop / maxScrollTop : 0;
      }),
      { timeout: 10_000 },
    ).toBeGreaterThan(0.1);
  });

  test('paged mode: restores page index after SPA back-navigation', async ({ page }) => {
    // 1. 导入一本长书并以分页（滑动）模式打开。
    //    使用 openReaderDirect（完整 page.goto），以便应用重新读取我们将要设置的
    //    localStorage 偏好设置。SPA 导航不会重新读取偏好设置。
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );
    await setReaderPreferences(page, { pageTurnMode: 'slide' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'paged');

    // 2. 至少前进 3 页。
    await clickNextPage(page);
    await clickNextPage(page);
    await clickNextPage(page);

    // 3. 等待页码索引写入 IndexedDB。
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) => s !== null && s.contentMode === 'paged' && (s.pageIndex ?? 0) >= 3,
      { description: 'paged progress pageIndex >= 3 persisted', timeout: 12_000 },
    );

    // 4. 通过 SPA 导航退出并重新进入。
    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'paged');

    // 5. 验证阅读器是否恢复到至少第 4 页（索引 ≥ 3）。
    // 允许一页的容错，以防最后一次翻页写入与退出发生竞争。
    const restoredProgress = await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) => s !== null && s.contentMode === 'paged',
      { description: 'paged progress re-persisted after restore', timeout: 15_000 },
    );

    expect(restoredProgress.pageIndex ?? 0).toBeGreaterThanOrEqual(2);
  });

  test('after scroll→paged switch: correct mode and page restored after SPA navigation', async ({
    page,
  }) => {
    // 1. 以滚动模式打开，主产滚动进度。
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );
    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderFromDetailPage(page);
    await waitForReaderBranch(page, 'scroll');

    await page.getByTestId('reader-viewport').evaluate((viewport) => {
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = maxScrollTop * 0.4;
    });

    await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) => s !== null && s.contentMode === 'scroll' && (s.chapterProgress ?? 0) > 0.15,
      { description: 'initial scroll progress persisted', timeout: 12_000 },
    );

    // 2. 显现界面并通过工具栏切换到分页模式。
    await revealReaderChrome(page);
    const twoColumnsButton = page.locator('button[title="Two Columns"]');
    await expect(twoColumnsButton).toBeInViewport({ timeout: 5_000 });
    await twoColumnsButton.click();
    await waitForReaderBranch(page, 'paged');

    // 3. 前进几页，使页码索引不为零。
    await clickNextPage(page);
    await clickNextPage(page);

    await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) => s !== null && s.contentMode === 'paged' && (s.pageIndex ?? 0) >= 1,
      { description: 'paged progress after mode switch persisted', timeout: 12_000 },
    );

    // 4. 通过 SPA 导航退出并重新进入。
    await exitAndReopenReader(page);

    // 5. 阅读器应恢复到分页模式，且页码索引 ≥ 1。
    await waitForReaderBranch(page, 'paged');

    const restoredProgress = await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) => s !== null && s.contentMode === 'paged',
      { description: 'paged mode confirmed after restore', timeout: 15_000 },
    );

    expect(restoredProgress.pageIndex ?? 0).toBeGreaterThanOrEqual(1);
  });

  test('multi-chapter: restores to correct chapter after SPA back-navigation', async ({ page }) => {
    // 1. 导入一本有 3 章节的书并以滚动模式打开。
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildMultiChapterTestEpubFile(),
      MULTI_CHAPTER_BOOK_TITLE,
    );
    // 使用 openReaderDirect（会调用 page.reload()），以便应用重新读取
    // 我们刚设置的 localStorage 偏好设置。
    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    // 2. 通过目录侧边边栏从第 1 章节导航到第 2 章节。
    await navigateToChapterByTitle(page, MULTI_CHAPTER_BOOK_CHAPTER_TITLES[1]);
    await waitForReaderBranch(page, 'scroll');

    // 3. 在第 2 章节中稍微滚动，产生一个非零的进度值。
    await page.getByTestId('reader-viewport').evaluate((viewport) => {
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = maxScrollTop * 0.3;
    });

    // 4. 等待第 2 章节的进度被持久化。
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) =>
        s !== null
        && s.contentMode === 'scroll'
        && (s.canonical.chapterIndex ?? 0) === 1,
      { description: 'chapter 2 (index 1) progress persisted', timeout: 12_000 },
    );

    // 5. 通过 SPA 导航退出并重新进入。
    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');

    // 6. 阅读器应已恢复到第 2 章节。章节标题可见。
    await expect(
      page.getByTestId('reader-viewport').getByText(MULTI_CHAPTER_BOOK_CHAPTER_TITLES[1]).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
