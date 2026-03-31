import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildReaderBlocks,
  composePaginatedChapterLayout,
  createReaderTypographyMetrics,
  createReaderViewportMetrics,
  findVisibleBlockRange,
  findLocatorForLayoutOffset,
  findPageIndexForLocator,
  getReaderLayoutPretextCacheSizeForTests,
  getPagedContentHeight,
  getOffsetForLocator,
  measureReaderChapterLayout,
  PAGED_VIEWPORT_TOP_PADDING_PX,
  resetReaderLayoutPretextCacheForTests,
} from '../readerLayout';
import type { MeasuredChapterLayout, ReaderMeasuredLine, VirtualBlockMetrics } from '../readerLayout';

function createMeasuredLine(text: string, lineIndex: number): ReaderMeasuredLine {
  return {
    end: {
      graphemeIndex: text.length,
      segmentIndex: 0,
    },
    lineIndex,
    start: {
      graphemeIndex: 0,
      segmentIndex: 0,
    },
    text,
    width: text.length * 16,
  };
}

function createTextMetric({
  blockIndex,
  lineCount,
  marginAfter = 0,
  marginBefore = 0,
  top,
}: {
  blockIndex: number;
  lineCount: number;
  marginAfter?: number;
  marginBefore?: number;
  top: number;
}): VirtualBlockMetrics {
  const lineHeightPx = 16;
  const lines = Array.from({ length: lineCount }, (_, index) => createMeasuredLine(`line-${blockIndex}-${index}`, index));
  const contentHeight = lines.length * lineHeightPx;

  return {
    block: {
      blockIndex,
      chapterIndex: 0,
      key: `0:text:${blockIndex}`,
      kind: 'text',
      marginAfter,
      marginBefore,
      paragraphIndex: blockIndex,
      text: lines.map((line) => line.text).join(''),
    },
    contentHeight,
    font: '400 16px sans-serif',
    fontSizePx: 16,
    fontWeight: 400,
    height: marginBefore + contentHeight + marginAfter,
    lineHeightPx,
    lines,
    marginAfter,
    marginBefore,
    top,
  };
}

function createBlankMetric({
  blockIndex,
  height,
  top,
}: {
  blockIndex: number;
  height: number;
  top: number;
}): VirtualBlockMetrics {
  return {
    block: {
      blockIndex,
      chapterIndex: 0,
      key: `0:blank:${blockIndex}`,
      kind: 'blank',
      marginAfter: height,
      marginBefore: 0,
      paragraphIndex: blockIndex,
    },
    contentHeight: 0,
    font: '400 16px sans-serif',
    fontSizePx: 16,
    fontWeight: 400,
    height,
    lineHeightPx: 16,
    lines: [],
    marginAfter: height,
    marginBefore: 0,
    top,
  };
}

function createMeasuredLayout(metrics: VirtualBlockMetrics[]): MeasuredChapterLayout {
  return {
    blockCount: metrics.length,
    chapterIndex: 0,
    metrics,
    textWidth: 320,
    totalHeight: metrics.reduce((total, metric) => total + metric.height, 0),
  };
}

describe('readerLayout', () => {
  afterEach(() => {
    resetReaderLayoutPretextCacheForTests();
    vi.restoreAllMocks();
  });

  it('normalizes headings, text, and image markers into ordered reader blocks', () => {
    const blocks = buildReaderBlocks({
      index: 0,
      title: 'Chapter 1',
      content: 'Intro text [IMG:cover] tail text\nSecond paragraph',
      wordCount: 100,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    }, 16);

    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'text',
      'image',
      'text',
      'text',
    ]);
    expect(blocks[2]).toMatchObject({
      imageKey: 'cover',
      kind: 'image',
    });
    expect(blocks[3]?.kind).toBe('text');
    expect(blocks[3]?.text?.trim()).toBe('tail text');
  });

  it('collapses paragraph spacing around blank line separators', () => {
    const blocks = buildReaderBlocks({
      index: 0,
      title: 'Chapter 1',
      content: 'First paragraph\n\n\nSecond paragraph\n',
      wordCount: 100,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    }, 16);

    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'text',
      'blank',
      'text',
    ]);
    expect(blocks[1]?.marginAfter).toBe(0);
    expect(blocks[2]?.marginAfter).toBe(16);
    expect(blocks[3]?.marginAfter).toBe(0);
  });

  it('maps page slice locators back to their composed page index', () => {
    const viewport = createReaderViewportMetrics(600, 800, 600, 800);
    const typography = createReaderTypographyMetrics(18, 1.8, 16, viewport.pagedViewportWidth);
    const chapter = {
      index: 0,
      title: 'Chapter 1',
      content: Array.from(
        { length: 48 },
        (_, paragraphIndex) => `Paragraph ${paragraphIndex + 1} ${'alpha beta gamma delta epsilon '.repeat(8)}`,
      ).join('\n'),
      wordCount: 4000,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    };

    const measuredLayout = measureReaderChapterLayout(
      chapter,
      viewport.pagedColumnWidth,
      typography,
      new Map(),
    );
    const paginatedLayout = composePaginatedChapterLayout(
      measuredLayout,
      getPagedContentHeight(viewport.pagedViewportHeight),
      viewport.pagedColumnCount,
      viewport.pagedColumnGap,
    );

    expect(paginatedLayout.pageSlices.length).toBeGreaterThan(1);
    const secondPageLocator = paginatedLayout.pageSlices[1]?.startLocator;
    expect(secondPageLocator).not.toBeNull();
    expect(findPageIndexForLocator(paginatedLayout, secondPageLocator)).toBe(1);
  });

  it('drops terminal paragraph spacing when that keeps the next paragraph on the same page', () => {
    const measuredLayout = createMeasuredLayout([
      createTextMetric({ blockIndex: 1, lineCount: 1, marginAfter: 16, top: 0 }),
      createTextMetric({ blockIndex: 2, lineCount: 1, top: 32 }),
    ]);

    const paginatedLayout = composePaginatedChapterLayout(measuredLayout, 32, 1, 32);

    expect(paginatedLayout.pageSlices).toHaveLength(1);
    expect(paginatedLayout.pageSlices[0]?.columns[0]?.items).toHaveLength(2);
    expect(paginatedLayout.pageSlices[0]?.columns[0]?.items[0]).toMatchObject({
      kind: 'text',
      marginAfter: 0,
    });
  });

  it('skips a blank spacer when it would waste the last line of a page', () => {
    const measuredLayout = createMeasuredLayout([
      createTextMetric({ blockIndex: 1, lineCount: 1, top: 0 }),
      createBlankMetric({ blockIndex: 2, height: 16, top: 16 }),
      createTextMetric({ blockIndex: 3, lineCount: 1, top: 32 }),
    ]);

    const paginatedLayout = composePaginatedChapterLayout(measuredLayout, 32, 1, 32);

    expect(paginatedLayout.pageSlices).toHaveLength(1);
    expect(paginatedLayout.pageSlices[0]?.columns[0]?.items.map((item) => item.kind)).toEqual([
      'text',
      'text',
    ]);
  });

  it('falls back to a single paged column for portrait or large-type viewports', () => {
    const portraitViewport = createReaderViewportMetrics(600, 800, 800, 1400, 18);
    const largeTypeViewport = createReaderViewportMetrics(600, 800, 900, 720, 28);
    const wideViewport = createReaderViewportMetrics(600, 800, 1280, 800, 18);

    expect(portraitViewport.pagedFitsTwoColumns).toBe(false);
    expect(portraitViewport.pagedColumnCount).toBe(1);
    expect(largeTypeViewport.pagedFitsTwoColumns).toBe(false);
    expect(largeTypeViewport.pagedColumnCount).toBe(1);
    expect(wideViewport.pagedFitsTwoColumns).toBe(true);
    expect(wideViewport.pagedColumnCount).toBe(2);
  });

  it('reserves paged viewport top padding from the available content height', () => {
    expect(getPagedContentHeight(800)).toBe(800 - PAGED_VIEWPORT_TOP_PADDING_PX);
    expect(getPagedContentHeight(8)).toBe(0);
  });

  it('round-trips text and image locators to layout offsets', () => {
    const typography = createReaderTypographyMetrics(18, 1.8, 16, 600);
    const chapter = {
      index: 0,
      title: 'Chapter 1',
      content: 'First paragraph\n[IMG:illustration]\nSecond paragraph',
      wordCount: 120,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    };
    const measuredLayout = measureReaderChapterLayout(
      chapter,
      400,
      typography,
      new Map([
        ['illustration', { width: 800, height: 400, aspectRatio: 2 }],
      ]),
    );

    const textMetric = measuredLayout.metrics.find((metric) => metric.block.kind === 'text');
    expect(textMetric).toBeDefined();
    const textOffset = (textMetric?.top ?? 0) + (textMetric?.marginBefore ?? 0);
    const textLocator = findLocatorForLayoutOffset(measuredLayout, textOffset);
    expect(textLocator?.kind).toBe('text');
    expect(getOffsetForLocator(measuredLayout, textLocator)).toBe(textOffset);

    const imageMetric = measuredLayout.metrics.find((metric) => metric.block.kind === 'image');
    expect(imageMetric).toBeDefined();
    const imageOffset = (imageMetric?.top ?? 0) + (imageMetric?.height ?? 0) * 0.75;
    const imageLocator = findLocatorForLayoutOffset(measuredLayout, imageOffset);
    expect(imageLocator).toMatchObject({
      edge: 'end',
      kind: 'image',
    });
    expect(getOffsetForLocator(measuredLayout, imageLocator)).toBe(
      (imageMetric?.top ?? 0) + (imageMetric?.height ?? 0),
    );
  });

  it('falls back to sans-serif when document.body is unavailable', () => {
    const originalBody = document.body;
    Object.defineProperty(document, 'body', {
      configurable: true,
      value: null,
    });

    try {
      const typography = createReaderTypographyMetrics(18, 1.8, 16, 600);
      expect(typography.bodyFont).toContain('sans-serif');
      expect(typography.headingFont).toContain('sans-serif');
    } finally {
      Object.defineProperty(document, 'body', {
        configurable: true,
        value: originalBody,
      });
    }
  });

  it('keeps the pretext cache bounded with LRU eviction', () => {
    const typography = createReaderTypographyMetrics(18, 1.8, 16, 600);

    for (let index = 0; index < 320; index += 1) {
      measureReaderChapterLayout({
        index,
        title: 'Chapter 1',
        content: `Paragraph ${index} ${'alpha beta gamma '.repeat(4)}`,
        wordCount: 100,
        totalChapters: 320,
        hasPrev: index > 0,
        hasNext: index < 319,
      }, 420, typography, new Map());
    }

    expect(getReaderLayoutPretextCacheSizeForTests()).toBeLessThanOrEqual(256);
  });

  it('resolves blank-space locators to the nearest previous meaningful block', () => {
    const measuredLayout = createMeasuredLayout([
      createTextMetric({ blockIndex: 0, lineCount: 1, top: 0 }),
      createBlankMetric({ blockIndex: 1, height: 16, top: 16 }),
      createBlankMetric({ blockIndex: 2, height: 16, top: 32 }),
      createTextMetric({ blockIndex: 3, lineCount: 1, top: 48 }),
    ]);

    expect(findLocatorForLayoutOffset(measuredLayout, 20)).toMatchObject({
      blockIndex: 0,
      kind: 'text',
    });
  });

  it('returns only the block range overlapping the viewport window', () => {
    const measuredLayout = createMeasuredLayout([
      createTextMetric({ blockIndex: 0, lineCount: 1, top: 0 }),
      createTextMetric({ blockIndex: 1, lineCount: 1, top: 16 }),
      createTextMetric({ blockIndex: 2, lineCount: 1, top: 32 }),
      createTextMetric({ blockIndex: 3, lineCount: 1, top: 48 }),
    ]);

    expect(findVisibleBlockRange(measuredLayout, 16, 16, 0)).toEqual({
      endIndex: 1,
      startIndex: 1,
    });
    expect(findVisibleBlockRange(measuredLayout, 16, 16, 16)).toEqual({
      endIndex: 2,
      startIndex: 0,
    });
  });

  it('returns an empty range when the viewport is fully outside the chapter body', () => {
    const measuredLayout = createMeasuredLayout([
      createTextMetric({ blockIndex: 0, lineCount: 1, top: 0 }),
      createTextMetric({ blockIndex: 1, lineCount: 1, top: 16 }),
    ]);

    expect(findVisibleBlockRange(measuredLayout, -80, 32, 0)).toEqual({
      endIndex: -1,
      startIndex: 0,
    });
    expect(findVisibleBlockRange(measuredLayout, 80, 32, 0)).toEqual({
      endIndex: -1,
      startIndex: 0,
    });
  });
});
