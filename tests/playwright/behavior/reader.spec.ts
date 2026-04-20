import { expect, test } from '@playwright/test';

import { buildLongTestEpubFile, LONG_BOOK_TITLE } from '../fixtures/testEpubFile';
import { disableAnimations } from '../helpers/appHarness';
import {
  importFixtureToDetailPage,
  openReaderFromDetailPage,
  readReaderViewportSnapshot,
  seedChapterAnalysis,
  setReaderPreferences,
  waitForPersistedReadingProgress,
  waitForReaderBranch,
  type ReaderViewportSnapshot,
} from '../helpers/readerVisualHarness';

async function importLongBookToDetailPage(
  page: import('@playwright/test').Page,
): Promise<{ novelId: number; title: string }> {
  await page.goto('/');
  await disableAnimations(page);
  await page.getByRole('button', { name: 'Upload' }).first().click();
  await page.locator('input[type="file"][accept=".txt,.epub"]').setInputFiles(
    await buildLongTestEpubFile(),
  );
  await expect(page.getByRole('link', { name: LONG_BOOK_TITLE })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('link', { name: LONG_BOOK_TITLE }).click();
  await expect(page.getByRole('heading', { name: LONG_BOOK_TITLE, level: 1 })).toBeVisible();

  const match = page.url().match(/\/novel\/(\d+)/u);
  if (!match) {
    throw new Error('Unable to resolve novel id from url');
  }
  return { novelId: Number(match[1]), title: LONG_BOOK_TITLE };
}

test.describe('reader behavior', () => {
  test('reader opens and displays chapter content', async ({ page }) => {
    await importFixtureToDetailPage(page, 'scrollRich');
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-viewport')).toBeVisible();
    await expect(page.getByText('Street Prelude')).toBeVisible();
  });

  test('exit reader returns to book detail', async ({ page }) => {
    const { title } = await importFixtureToDetailPage(page, 'scrollRich');
    await openReaderFromDetailPage(page);

    await page.goBack();
    await disableAnimations(page);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });

  test('scroll position persists on reload', async ({ page }) => {
    const { novelId } = await importLongBookToDetailPage(page);
    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderFromDetailPage(page);
    await waitForReaderBranch(page, 'scroll');

    // Wait for scroll content to render fully
    const viewport = page.getByTestId('reader-viewport');
    await expect.poll(async () =>
      viewport.evaluate((el) => el.scrollHeight > el.clientHeight),
    { timeout: 15_000 }).toBe(true);

    await viewport.evaluate((el) => {
      const element = el;
      const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = Math.round(maxScrollTop * 0.4);
      element.dispatchEvent(new Event('scroll'));
    });

    await waitForPersistedReadingProgress(page, novelId, (snapshot) => (
      snapshot?.contentMode === 'scroll'
      && typeof snapshot.chapterProgress === 'number'
      && snapshot.chapterProgress > 0.1
    ), { timeout: 15_000 });

    await page.reload();
    await disableAnimations(page);
    await waitForReaderBranch(page, 'scroll');

    await expect.poll(async () => {
      const snapshot = await readReaderViewportSnapshot(page);
      return snapshot.scrollProgress !== null && snapshot.scrollProgress > 0.1;
    }, { timeout: 15_000 }).toBe(true);
  });

  test('image click opens viewer and Escape closes it', async ({ page }) => {
    await importFixtureToDetailPage(page, 'imageViewer');
    await openReaderFromDetailPage(page);

    const images = page.getByTestId('reader-viewport').locator('img');
    await expect.poll(async () => images.count()).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => images.first().evaluate((img: HTMLImageElement) => (
      img.complete && img.naturalWidth > 0
    ))).toBe(true);

    await page.getByLabel('Image Viewer').first().click();
    const imageDialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(imageDialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(imageDialog).not.toBeVisible();
  });

  test('original/summary toggle works with seeded analysis', async ({ page }) => {
    const { novelId } = await importFixtureToDetailPage(page, 'analysisLinked');
    await openReaderFromDetailPage(page);

    await seedChapterAnalysis(page, {
      novelId,
      chapterIndex: 0,
      chapterTitle: 'Bridge Chapter',
    });

    await page.getByRole('button', { name: 'AI Summary' }).evaluate((el: HTMLButtonElement) => {
      el.click();
    });
    await expect(page.getByText('Mara keeps the bridge watch')).toBeVisible();

    await page.getByRole('button', { name: 'Original' }).evaluate((el: HTMLButtonElement) => {
      el.click();
    });
    await expect(page.getByText('Mara waited beneath the eastern bridge')).toBeVisible();
  });

  test('scroll↔paged mode switch preserves reading progress', async ({ page }) => {
    test.slow();

    const { novelId } = await importLongBookToDetailPage(page);
    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderFromDetailPage(page);
    await waitForReaderBranch(page, 'scroll');

    // Wait for scroll content to fully render
    const viewport = page.getByTestId('reader-viewport');
    await expect.poll(async () =>
      viewport.evaluate((el) => el.scrollHeight > el.clientHeight),
    { timeout: 15_000 }).toBe(true);

    // Step A: scroll down to ~40% in scroll mode
    await viewport.evaluate((el) => {
      const element = el;
      const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = Math.round(maxScrollTop * 0.4);
      element.dispatchEvent(new Event('scroll'));
    });

    // Step B: wait for scroll progress to persist
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => (
        snapshot?.contentMode === 'scroll'
        && typeof snapshot.chapterProgress === 'number'
        && snapshot.chapterProgress > 0.1
      ),
      { description: 'waiting for scroll progress to persist before mode switch', timeout: 15_000 },
    );

    // Step C: switch to paged mode via toolbar button
    const twoColumnsButton = page.locator('button[title="Two Columns"]').first();
    await expect(twoColumnsButton).toBeAttached();
    await twoColumnsButton.evaluate((el: HTMLButtonElement) => el.click());
    await waitForReaderBranch(page, 'paged');

    const pagedPersisted = await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => (
        snapshot?.contentMode === 'paged'
        && typeof snapshot.pageIndex === 'number'
      ),
      { description: 'waiting for paged progress to persist after switch', timeout: 15_000 },
    );
    // Scroll→Paged: user's reading position should be on the current page (not page 1)
    expect(pagedPersisted.pageIndex).toBeGreaterThan(0);

    // Step D: switch back to scroll mode via toolbar button
    const singleColumnButton = page.locator('button[title="Single Column"]').first();
    await expect(singleColumnButton).toBeAttached();
    await singleColumnButton.evaluate((el: HTMLButtonElement) => el.click());
    await waitForReaderBranch(page, 'scroll');

    // Paged→Scroll: scroll position should be non-zero (page unfold pattern)
    let restoredScrollSnapshot: ReaderViewportSnapshot | null = null;
    await expect.poll(async () => {
      restoredScrollSnapshot = await readReaderViewportSnapshot(page);
      return restoredScrollSnapshot.scrollProgress !== null
        && restoredScrollSnapshot.scrollProgress > 0;
    }, { timeout: 15_000 }).toBe(true);

    expect(restoredScrollSnapshot!.scrollProgress).toBeGreaterThan(0);

    // Step E: wait for scroll progress to persist after switch back
    const reloadedProgress = await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => (
        snapshot?.contentMode === 'scroll'
        && typeof snapshot.chapterProgress === 'number'
        && snapshot.chapterProgress > 0
      ),
      { description: 'waiting for scroll progress to persist after mode switch back', timeout: 15_000 },
    );
    expect(reloadedProgress.contentMode).toBe('scroll');
    expect(reloadedProgress.chapterProgress).toBeGreaterThan(0);
  });
});
