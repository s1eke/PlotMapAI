import { expect, test } from '@playwright/test';

import {
  importFixtureToDetailPage,
  openReaderFromDetailPage,
  seedChapterAnalysis,
  seedChapterRichContent,
  setPageTurnMode,
  setReaderPreferences,
  waitForReaderViewportImages,
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
    await waitForReaderViewportImages(page);

    await page.getByLabel('Image Viewer').first().click();

    await expect(page).toHaveScreenshot('03-image-viewer-overlay.png');
  });

  test('renders image captions with stable spacing', async ({ page }) => {
    await importFixtureToDetailPage(page, 'imageCaption');
    await openReaderFromDetailPage(page);
    await waitForReaderViewportImages(page);

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('04-image-caption.png');
  });

  test('renders imported simple tables with stable spacing', async ({ page }) => {
    await importFixtureToDetailPage(page, 'simpleTable');
    await openReaderFromDetailPage(page);
    await expect(
      page.locator('[data-testid="reader-rich-table"], [data-testid="reader-flow-table"]').first(),
    ).toHaveScreenshot('05-simple-table.png');
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

  test('renders imported hr, internal links, and simple tables through the reader flow', async ({ page }) => {
    await importFixtureToDetailPage(page, 'linkedStructures');
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('09-structured-rich-viewport.png');
  });

  test('renders multi-image chapters with stable gallery spacing', async ({ page }) => {
    await importFixtureToDetailPage(page, 'multiImage');
    await openReaderFromDetailPage(page);
    await waitForReaderViewportImages(page, 2);

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('10-multi-image-viewport.png');
  });

  test('renders the paper-theme semantic showcase above the fold in scroll mode', async ({ page }) => {
    await importFixtureToDetailPage(page, 'semanticShowcase');
    await setReaderPreferences(page, {
      fontSize: 16,
      lineSpacing: 1.6,
      paragraphSpacing: 12,
      readerTheme: 'paper',
    }, {
      reload: true,
    });
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('11-scroll-paper-semantic-top.png');
  });

  test('renders the lower semantic showcase blocks in paper theme with stable structure spacing', async ({ page }) => {
    await importFixtureToDetailPage(page, 'semanticShowcase');
    await setReaderPreferences(page, {
      fontSize: 16,
      lineSpacing: 1.6,
      paragraphSpacing: 12,
      readerTheme: 'paper',
    }, {
      reload: true,
    });
    await openReaderFromDetailPage(page);

    const viewport = page.getByTestId('reader-viewport');
    const targetTable = page.locator(
      '[data-testid="reader-rich-table"], [data-testid="reader-flow-table"]',
    ).first();

    const scrollTop = await viewport.evaluate((element) => {
      const viewportElement = element;
      const target = viewportElement.querySelector(
        '[data-testid="reader-rich-table"], [data-testid="reader-flow-table"]',
      );
      if (!(target instanceof HTMLElement)) {
        return viewportElement.scrollTop;
      }

      const viewportRect = viewportElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      viewportElement.scrollTop += targetRect.top - viewportRect.top - 120;
      return viewportElement.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);

    await expect(targetTable).toBeVisible();
    await waitForReaderViewportImages(page);
    await expect(viewport).toHaveScreenshot('12-scroll-paper-semantic-lower.png', {
      maxDiffPixels: 20_000,
      maxDiffPixelRatio: 0.03,
    });
  });

  test('renders poem blocks in paged night theme through the standard rich-content pipeline', async ({ page }) => {
    const { novelId } = await importFixtureToDetailPage(page, 'analysisLinked');
    await seedChapterRichContent(page, {
      novelId,
      chapterIndex: 0,
      plainText: [
        'Night Chorus',
        '',
        'The bridge note leaned inward before the rain took over.',
        '',
        'Lantern one hums low.',
        'Lantern two answers from rain.',
        'The river keeps the meter.',
        '',
        'The ledger closes softly after the chorus.',
      ].join('\n'),
      richBlocks: [
        {
          type: 'heading',
          level: 2,
          children: [{
            type: 'text',
            text: 'Night Chorus',
          }],
        },
        {
          type: 'paragraph',
          indent: 2,
          children: [{
            type: 'text',
            text: 'The bridge note leaned inward before the rain took over.',
          }],
        },
        {
          type: 'poem',
          lines: [
            [{
              type: 'text',
              text: 'Lantern one hums low.',
            }],
            [{
              type: 'text',
              text: 'Lantern two answers from rain.',
            }],
            [{
              type: 'text',
              text: 'The river keeps the meter.',
            }],
          ],
        },
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'The ledger closes softly after the chorus.',
          }],
        },
      ],
    });
    await setReaderPreferences(page, {
      fontSize: 17,
      lineSpacing: 1.7,
      pageTurnMode: 'slide',
      paragraphSpacing: 12,
      readerTheme: 'night',
    }, {
      reload: true,
    });
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('paged-reader-interactive')).toHaveScreenshot('13-paged-night-poem-viewport.png');
  });
});
