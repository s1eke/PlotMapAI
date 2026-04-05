import { expect, test } from '@playwright/test';

import {
  importFixtureToDetailPage,
  openReaderFromDetailPage,
  seedChapterAnalysis,
  seedPoemChapterContent,
  setPageTurnMode,
} from './helpers/readerVisualHarness';

test.describe('reader visual regression', () => {
  test('renders the rich scroll viewport baseline', async ({ page }) => {
    await importFixtureToDetailPage(page, 'scrollRich');
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('01-scroll-rich-viewport.png');
  });

  test('renders the paged reader baseline in slide mode', async ({ page }) => {
    await importFixtureToDetailPage(page, 'pagedRich');
    await openReaderFromDetailPage(page);
    await setPageTurnMode(page, 'Slide');

    await expect(page.getByTestId('paged-reader-interactive')).toHaveScreenshot('02-paged-slide-viewport.png');
  });

  test('renders the image viewer overlay baseline', async ({ page }) => {
    await importFixtureToDetailPage(page, 'imageViewer');
    await openReaderFromDetailPage(page);

    await page.getByLabel('Image Viewer').first().click();

    await expect(page).toHaveScreenshot('03-image-viewer-overlay.png');
  });

  test('renders image captions with stable spacing', async ({ page }) => {
    await importFixtureToDetailPage(page, 'imageCaption');
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-flow-image-caption')).toHaveScreenshot('04-image-caption.png');
  });

  test('renders table fallback blocks for unsupported rich content', async ({ page }) => {
    await importFixtureToDetailPage(page, 'tableFallback');
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-flow-table-fallback')).toHaveScreenshot('05-table-fallback.png');
  });

  test('renders sanitized dirty-style chapters consistently', async ({ page }) => {
    await importFixtureToDetailPage(page, 'dirtyStyle');
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('06-dirty-style-viewport.png');
  });

  test('renders long chapters after deep scrolling', async ({ page }) => {
    await importFixtureToDetailPage(page, 'longChapter');
    await openReaderFromDetailPage(page);

    await page.getByTestId('reader-viewport').evaluate((element) => {
      const viewport = element;
      viewport.scrollTop = 1800;
    });

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('07-long-chapter-deep-scroll.png');
  });

  test('renders summary-shell with seeded chapter analysis', async ({ page }) => {
    const { novelId } = await importFixtureToDetailPage(page, 'analysisLinked');
    await openReaderFromDetailPage(page);
    await seedChapterAnalysis(page, {
      novelId,
      chapterIndex: 0,
      chapterTitle: 'Bridge Chapter',
    });

    await page.getByRole('button', { name: 'AI Summary' }).evaluate((element: HTMLButtonElement) => {
      element.click();
    });
    await expect(page.getByText('Mara keeps the bridge watch while the city echoes back a warning.')).toBeVisible();

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('08-summary-shell-analysis.png');
  });

  test('renders seeded poem chapters through the reader flow', async ({ page }) => {
    const { novelId } = await importFixtureToDetailPage(page, 'poemSeed');
    await seedPoemChapterContent(page, {
      novelId,
      chapterIndex: 0,
    });
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('09-poem-viewport.png');
  });

  test('renders multi-image chapters with stable gallery spacing', async ({ page }) => {
    await importFixtureToDetailPage(page, 'multiImage');
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('10-multi-image-viewport.png');
  });
});
