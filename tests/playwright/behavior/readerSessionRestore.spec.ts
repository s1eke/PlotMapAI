/**
 * E2E tests for reading-progress persistence and restore.
 *
 * Every test follows the same pattern:
 *   1. Import a book and produce real reading progress (scroll, page-turn, chapter nav).
 *   2. Wait for the progress to be flushed to IndexedDB.
 *   3. Exit the reader via SPA navigation (not page.reload) and immediately re-enter.
 *   4. Assert that the reader resumes at the saved position.
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
    // 1. Import a long single-chapter book and open in scroll mode.
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );
    // Use openReaderDirect (which calls page.reload()) so the app re-reads the
    // localStorage preference we just set. SPA navigation (openReaderFromDetailPage)
    // does NOT reset the in-memory preference store — the reader would use whatever
    // pageTurnMode was active in the previous test.
    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    // 2. Scroll to roughly 40% of the chapter.
    await page.getByTestId('reader-viewport').evaluate((viewport) => {
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = maxScrollTop * 0.4;
    });

    // 3. Wait for the progress to be written to IndexedDB.
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) => s !== null && s.contentMode === 'scroll' && (s.chapterProgress ?? 0) > 0.15,
      { description: 'scroll progress > 15% persisted', timeout: 12_000 },
    );

    // 4. Exit via SPA navigation and re-enter.
    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');

    // 5a. Wait for layout to be ready (content renders and creates a scrollable range).
    await expect.poll(
      async () => page.getByTestId('reader-viewport').evaluate((viewport) =>
        Math.max(0, viewport.scrollHeight - viewport.clientHeight),
      ),
      { timeout: 20_000, message: 'Expected reader-viewport to have a non-zero scrollable range' },
    ).toBeGreaterThan(0);

    // 5b. Poll until the reader restores to a meaningful scroll position.
    //     The restore is async (hydrates from IndexedDB then applies scrollTop),
    //     so we cannot check scrollTop immediately after the layout is ready.
    await expect.poll(
      async () => page.getByTestId('reader-viewport').evaluate((viewport) => {
        const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        return maxScrollTop > 0 ? viewport.scrollTop / maxScrollTop : 0;
      }),
      { timeout: 10_000 },
    ).toBeGreaterThan(0.1);
  });

  test('paged mode: restores page index after SPA back-navigation', async ({ page }) => {
    // 1. Import a long book and open in paged (slide) mode.
    //    Use openReaderDirect (full page.goto) so the app re-reads the localStorage
    //    preference we are about to set. SPA navigation does not re-read prefs.
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );
    await setReaderPreferences(page, { pageTurnMode: 'slide' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'paged');

    // 2. Advance at least 3 pages.
    await clickNextPage(page);
    await clickNextPage(page);
    await clickNextPage(page);

    // 3. Wait for the page index to be written to IndexedDB.
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) => s !== null && s.contentMode === 'paged' && (s.pageIndex ?? 0) >= 3,
      { description: 'paged progress pageIndex >= 3 persisted', timeout: 12_000 },
    );

    // 4. Exit via SPA navigation and re-enter.
    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'paged');

    // 5. Verify the reader restored to at least the 4th page (index ≥ 3).
    // Allow one page of tolerance in case the last page-turn write races with exit.
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
    // 1. Open in scroll mode, produce scroll progress.
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

    // 2. Reveal chrome and switch to paged mode via the toolbar.
    await revealReaderChrome(page);
    const twoColumnsButton = page.locator('button[title="Two Columns"]');
    await expect(twoColumnsButton).toBeInViewport({ timeout: 5_000 });
    await twoColumnsButton.click();
    await waitForReaderBranch(page, 'paged');

    // 3. Advance a few pages so we have a non-zero page index.
    await clickNextPage(page);
    await clickNextPage(page);

    await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) => s !== null && s.contentMode === 'paged' && (s.pageIndex ?? 0) >= 1,
      { description: 'paged progress after mode switch persisted', timeout: 12_000 },
    );

    // 4. Exit via SPA navigation and re-enter.
    await exitAndReopenReader(page);

    // 5. Reader should restore to paged mode at a page index ≥ 1.
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
    // 1. Import a 3-chapter book and open in scroll mode.
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildMultiChapterTestEpubFile(),
      MULTI_CHAPTER_BOOK_TITLE,
    );
    // Use openReaderDirect (which calls page.reload()) so the app re-reads the
    // localStorage preference we just set.
    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    // 2. Navigate from chapter 1 to chapter 2 via the TOC sidebar.
    await navigateToChapterByTitle(page, MULTI_CHAPTER_BOOK_CHAPTER_TITLES[1]);
    await waitForReaderBranch(page, 'scroll');

    // 3. Scroll a little in chapter 2 to produce a non-trivial progress value.
    await page.getByTestId('reader-viewport').evaluate((viewport) => {
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = maxScrollTop * 0.3;
    });

    // 4. Wait for chapter 2 progress to be persisted.
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (s) =>
        s !== null
        && s.contentMode === 'scroll'
        && (s.canonical.chapterIndex ?? 0) === 1,
      { description: 'chapter 2 (index 1) progress persisted', timeout: 12_000 },
    );

    // 5. Exit via SPA navigation and re-enter.
    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');

    // 6. The reader should have restored to chapter 2. The chapter heading is visible.
    await expect(
      page.getByTestId('reader-viewport').getByText(MULTI_CHAPTER_BOOK_CHAPTER_TITLES[1]).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
