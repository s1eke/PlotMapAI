import { expect, test } from '@playwright/test';

import {
  importFixtureToDetailPage,
  openReaderFromDetailPage,
  seedChapterAnalysis,
  seedChapterRichContent,
  setPageTurnMode,
  setReaderPreferences,
  waitForReaderViewportImages,
} from '../helpers/readerVisualHarness';

test.describe('阅读器视觉回归', () => {
  test('TC-031 富文本滚动视口基线渲染正确', async ({ page }) => {
    await importFixtureToDetailPage(page, 'scrollRich');
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('01-scroll-rich-viewport.png');
  });

  test('TC-032 分页模式（水平滑动转场）的阅读器基线渲染正确', async ({ page }) => {
    await importFixtureToDetailPage(page, 'pagedRich');
    await openReaderFromDetailPage(page);
    await setPageTurnMode(page, 'Slide');

    await expect(page.getByTestId('paged-reader-interactive')).toHaveScreenshot('02-paged-slide-viewport.png');
  });

  test('TC-033 图片查看器遮罩层基线渲染正确', async ({ page }) => {
    await importFixtureToDetailPage(page, 'imageViewer');
    await openReaderFromDetailPage(page);
    await waitForReaderViewportImages(page);

    await page.getByLabel('Image Viewer').first().click();

    await expect(page).toHaveScreenshot('03-image-viewer-overlay.png');
  });

  test('TC-034 预置章节分析数据时摘要视图基线渲染正确', async ({ page }) => {
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

  test('TC-035 通过阅读流程正确渲染导入的分隔线、内部链接和简单表格', async ({ page }) => {
    await importFixtureToDetailPage(page, 'linkedStructures');
    await openReaderFromDetailPage(page);

    const viewport = page.getByTestId('reader-viewport');
    const richLink = viewport.getByRole('link', { name: 'Return to the gate note' });
    const richRule = viewport.getByTestId('reader-flow-hr');
    const richTable = viewport.getByTestId('reader-flow-table');

    await expect(richLink).toHaveClass(/pm-reader-inline-link/u);
    await expect(richRule).toBeVisible();
    await expect(richTable).toBeVisible();
    await expect(richTable.getByText('Route')).toBeVisible();
    await expect(richTable.getByText('Status')).toBeVisible();
    await expect(richTable.getByText('North Lock')).toBeVisible();
    await expect(richTable.getByText('Canal Gate')).toBeVisible();

    await expect(viewport).toHaveScreenshot('09-structured-rich-viewport.png', {
      maxDiffPixels: 20_000,
      maxDiffPixelRatio: 0.025,
    });
  });

  test('TC-036 多图片章节的画廊间距渲染稳定', async ({ page }) => {
    await importFixtureToDetailPage(page, 'multiImage');
    await openReaderFromDetailPage(page);
    await waitForReaderViewportImages(page, 2);

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('10-multi-image-viewport.png');
  });

  test('TC-037 滚动模式下纸张主题首屏语义展示渲染正确', async ({ page }) => {
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

  test('TC-038 文本策略首屏、图注与表格渲染稳定', async ({ page }) => {
    await importFixtureToDetailPage(page, 'textPolicyShowcase');
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('14-scroll-text-policy-top.png');

    await waitForReaderViewportImages(page);
    await page.getByText('节点 Node').first().scrollIntoViewIfNeeded();
    await expect(page.getByText('https://example.test/table/superlongtoken')).toBeVisible();

    await expect(page.getByTestId('reader-viewport')).toHaveScreenshot('16-scroll-text-policy-caption-table.png');
  });

  test('TC-039 窄栏翻页标题按测量行渲染稳定', async ({ page }) => {
    await importFixtureToDetailPage(page, 'textPolicyShowcase');
    await setReaderPreferences(page, {
      fontSize: 20,
      lineSpacing: 1.6,
      pageTurnMode: 'slide',
      paragraphSpacing: 12,
      readerTheme: 'paper',
    }, {
      reload: true,
    });
    await openReaderFromDetailPage(page);

    await expect(page.getByTestId('paged-reader-interactive')).toHaveScreenshot('15-paged-text-policy-heading.png');
  });

  test('TC-040 夜间翻页主题下诗歌块通过标准富文本管线渲染正确', async ({ page }) => {
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
