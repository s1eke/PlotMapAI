/**
 * 阅读进度持久化与恢复的 E2E 测试。
 *
 * 每个测试都遵循相同的模式：
 *   1. 导入一本书并产生真实的阅读进度（滚动、翻页、章节导航）。
 *   2. 等待进度刷新到 IndexedDB。
 *   3. 通过 SPA 导航（而非 page.reload）退出阅读器并立即重新进入。
 *   4. 断言阅读器恢复到保存的位置。
 */

import type { Page } from '@playwright/test';

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
  setReaderPreferences,
  waitForPersistedReadingProgress,
  waitForPagedViewportPageIndex,
  waitForReaderBranch,
} from '../helpers/readerVisualHarness';

async function waitForExactPagedProgress(
  page: Page,
  novelId: number,
  expectedPageIndex: number,
  description: string,
) {
  return waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => snapshot !== null
      && snapshot.contentMode === 'paged'
      && snapshot.pageIndex === expectedPageIndex,
    { description, timeout: 15_000 },
  );
}

test.describe('阅读会话恢复', () => {
  test('TC-022 滚动模式：SPA 返回导航后可恢复滚动位置', async ({ page }) => {
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
    await page.getByTestId('reader-viewport').evaluate((element) => {
      const viewport = element as HTMLElement;
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

  test('TC-023 翻页模式：SPA 返回导航后可恢复页码', async ({ page }) => {
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
    const baselineProgress = await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) => s !== null && s.contentMode === 'paged' && (s.pageIndex ?? 0) >= 3,
      { description: 'paged progress pageIndex >= 3 persisted', timeout: 12_000 },
    );
    const expectedPageIndex = baselineProgress.pageIndex ?? 0;
    await waitForPagedViewportPageIndex(page, expectedPageIndex, {
      description: `paged viewport settled at pageIndex=${expectedPageIndex} before exit`,
      timeout: 15_000,
    });

    // 4. 通过 SPA 导航退出并重新进入。
    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'paged');

    // 5. 验证阅读器恢复到了退出前看到的实际页码，而不是只恢复到“某个非零页”。
    const restoredProgress = await waitForExactPagedProgress(
      page,
      novelId,
      expectedPageIndex,
      `paged progress restored to pageIndex=${expectedPageIndex}`,
    );
    const restoredSnapshot = await waitForPagedViewportPageIndex(page, expectedPageIndex, {
      description: `paged viewport restored to pageIndex=${expectedPageIndex}`,
      timeout: 15_000,
    });

    expect(expectedPageIndex).toBeGreaterThanOrEqual(3);
    expect(restoredProgress.pageIndex).toBe(expectedPageIndex);
    expect(restoredSnapshot.currentPageIndex).toBe(expectedPageIndex);
  });

  test('TC-024 多章节场景：SPA 返回导航后可恢复到正确章节', async ({ page }) => {
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
    await page.getByTestId('reader-viewport').evaluate((element) => {
      const viewport = element as HTMLElement;
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = maxScrollTop * 0.3;
      viewport.dispatchEvent(new Event('scroll'));
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
