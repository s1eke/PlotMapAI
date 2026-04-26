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

test.describe('阅读器行为', () => {
  test('TC-018 阅读器打开后展示章节内容', async ({ page }) => {
    await importFixtureToDetailPage(page, 'scrollRich');
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-viewport')).toBeVisible();
    await expect(page.getByText('Street Prelude')).toBeVisible();
  });

  test('TC-019 刷新后保留滚动位置', async ({ page }) => {
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

  test('TC-020 点击图片可打开查看器，按 Escape 可关闭', async ({ page }) => {
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

  test('TC-021 原文和摘要切换在预置分析数据下可正常工作', async ({ page }) => {
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
});
