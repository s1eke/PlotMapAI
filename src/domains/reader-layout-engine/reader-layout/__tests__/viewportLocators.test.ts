import { describe, expect, it } from 'vitest';

import type {
  ChapterContent,
  ReaderLocator,
} from '@shared/contracts/reader';
import type {
  MeasuredChapterLayout,
  PaginatedChapterLayout,
  ReaderMeasuredLine,
  ReaderTextPageItem,
  VirtualBlockMetrics,
} from '../../utils/layout/readerLayout';
import { getOffsetForLocator } from '../../utils/layout/readerLayout';
import {
  calculateVisibleScrollBlockRanges,
  resolveCurrentPagedLocator,
  resolveCurrentScrollLocator,
} from '../viewportLocators';

function createMeasuredLine(lineIndex: number): ReaderMeasuredLine {
  const text = `line-${lineIndex}`;

  return {
    lineIndex,
    text,
    width: text.length * 10,
    start: {
      segmentIndex: 0,
      graphemeIndex: lineIndex * 10,
    },
    end: {
      segmentIndex: 0,
      graphemeIndex: lineIndex * 10 + text.length,
    },
  };
}

function createTextMetric(params: {
  chapterIndex: number;
  blockIndex: number;
  lineCount: number;
  lineHeightPx: number;
  top: number;
}): VirtualBlockMetrics {
  const lines = Array.from({ length: params.lineCount }, (_, index) => createMeasuredLine(index));
  const contentHeight = params.lineCount * params.lineHeightPx;

  return {
    block: {
      chapterIndex: params.chapterIndex,
      blockIndex: params.blockIndex,
      paragraphIndex: params.blockIndex,
      key: `${params.chapterIndex}:${params.blockIndex}`,
      kind: 'text',
      marginBefore: 0,
      marginAfter: 0,
      text: lines.map((line) => line.text).join(''),
    },
    contentHeight,
    font: '400 16px serif',
    fontSizePx: 16,
    fontWeight: 400,
    height: contentHeight,
    lineHeightPx: params.lineHeightPx,
    lines,
    marginBefore: 0,
    marginAfter: 0,
    top: params.top,
  };
}

function createMeasuredLayout(params: {
  chapterIndex: number;
  lineCount: number;
  lineHeightPx: number;
}): MeasuredChapterLayout {
  const metric = createTextMetric({
    chapterIndex: params.chapterIndex,
    blockIndex: 0,
    lineCount: params.lineCount,
    lineHeightPx: params.lineHeightPx,
    top: 0,
  });

  return {
    chapterIndex: params.chapterIndex,
    blockCount: 1,
    metrics: [metric],
    renderMode: 'plain',
    textWidth: 360,
    totalHeight: metric.height,
  };
}

function createPagedTextItem(params: {
  chapterIndex: number;
  blockIndex: number;
  lineStartIndex: number;
  lines: ReaderMeasuredLine[];
  lineHeightPx: number;
}): ReaderTextPageItem {
  return {
    chapterIndex: params.chapterIndex,
    blockIndex: params.blockIndex,
    key: `${params.chapterIndex}:${params.blockIndex}:${params.lineStartIndex}`,
    kind: 'text',
    text: params.lines.map((line) => line.text).join(''),
    font: '400 16px serif',
    fontSizePx: 16,
    lineHeightPx: params.lineHeightPx,
    lineStartIndex: params.lineStartIndex,
    lines: params.lines,
    marginBefore: 0,
    marginAfter: 0,
    contentHeight: params.lines.length * params.lineHeightPx,
    height: params.lines.length * params.lineHeightPx,
  };
}

function createContentElement(params: {
  scrollTop: number;
  clientHeight: number;
}): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: params.scrollTop,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => params.clientHeight,
  });

  return element;
}

function createBodyElement(offsetTop: number): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'offsetTop', {
    configurable: true,
    get: () => offsetTop,
  });
  return element;
}

function createChapter(index: number): ChapterContent {
  return {
    index,
    title: `Chapter ${index + 1}`,
    plainText: 'content',
    richBlocks: [],
    contentFormat: 'plain',
    contentVersion: 1,
    wordCount: 100,
    totalChapters: 1,
    hasPrev: false,
    hasNext: false,
  };
}

describe('viewportLocators canonical sampling', () => {
  it('samples paged locator from reading flow instead of pinning to page start', () => {
    const firstColumnLines = Array.from({ length: 10 }, (_, index) => createMeasuredLine(index));
    const secondColumnLines = Array.from(
      { length: 10 },
      (_, index) => createMeasuredLine(index + 10),
    );
    const firstItem = createPagedTextItem({
      chapterIndex: 0,
      blockIndex: 0,
      lineStartIndex: 0,
      lines: firstColumnLines,
      lineHeightPx: 10,
    });
    const secondItem = createPagedTextItem({
      chapterIndex: 0,
      blockIndex: 1,
      lineStartIndex: 0,
      lines: secondColumnLines,
      lineHeightPx: 10,
    });
    const startLocator: ReaderLocator = {
      chapterIndex: 0,
      blockIndex: 0,
      kind: 'text',
      lineIndex: 0,
      startCursor: firstColumnLines[0]?.start,
      endCursor: firstColumnLines[0]?.end,
      pageIndex: 0,
    };
    const pagedLayout: PaginatedChapterLayout = {
      chapterIndex: 0,
      columnCount: 2,
      columnGap: 32,
      columnWidth: 360,
      pageHeight: 100,
      pageSlices: [{
        pageIndex: 0,
        columnCount: 2,
        columns: [
          { height: firstItem.height, items: [firstItem] },
          { height: secondItem.height, items: [secondItem] },
        ],
        startLocator,
        endLocator: {
          chapterIndex: 0,
          blockIndex: 1,
          kind: 'text',
          lineIndex: 9,
          startCursor: secondColumnLines[9]?.start,
          endCursor: secondColumnLines[9]?.end,
          pageIndex: 0,
        },
      }],
    };

    const locator = resolveCurrentPagedLocator({
      currentPagedLayout: pagedLayout,
      isPagedMode: true,
      pageIndex: 0,
      viewMode: 'original',
      anchorRatio: 0.75,
    });

    expect(locator).toMatchObject({
      chapterIndex: 0,
      blockIndex: 1,
      kind: 'text',
      pageIndex: 0,
    });
    expect(locator).not.toEqual(startLocator);
  });

  it('falls back to page-start locator when the sampled paged column is empty', () => {
    const lines = Array.from({ length: 5 }, (_, index) => createMeasuredLine(index));
    const item = createPagedTextItem({
      chapterIndex: 0,
      blockIndex: 0,
      lineStartIndex: 0,
      lines,
      lineHeightPx: 10,
    });
    const startLocator: ReaderLocator = {
      chapterIndex: 0,
      blockIndex: 0,
      kind: 'text',
      lineIndex: 0,
      startCursor: lines[0]?.start,
      endCursor: lines[0]?.end,
      pageIndex: 0,
    };
    const pagedLayout: PaginatedChapterLayout = {
      chapterIndex: 0,
      columnCount: 2,
      columnGap: 32,
      columnWidth: 360,
      pageHeight: 100,
      pageSlices: [{
        pageIndex: 0,
        columnCount: 2,
        columns: [
          { height: item.height, items: [item] },
          { height: 0, items: [] },
        ],
        startLocator,
        endLocator: {
          chapterIndex: 0,
          blockIndex: 0,
          kind: 'text',
          lineIndex: 4,
          startCursor: lines[4]?.start,
          endCursor: lines[4]?.end,
          pageIndex: 0,
        },
      }],
    };

    const locator = resolveCurrentPagedLocator({
      currentPagedLayout: pagedLayout,
      isPagedMode: true,
      pageIndex: 0,
      viewMode: 'original',
      anchorRatio: 0.75,
    });

    expect(locator).toEqual(startLocator);
  });

  it('keeps scroll and paged sampled offsets within one line height at the same anchor ratio', () => {
    const chapter = createChapter(0);
    const measuredLayout = createMeasuredLayout({
      chapterIndex: 0,
      lineCount: 10,
      lineHeightPx: 10,
    });
    const measuredLines = measuredLayout.metrics[0]?.lines ?? [];
    const pagedLayout: PaginatedChapterLayout = {
      chapterIndex: 0,
      columnCount: 2,
      columnGap: 32,
      columnWidth: 360,
      pageHeight: 50,
      pageSlices: [{
        pageIndex: 0,
        columnCount: 2,
        columns: [
          {
            height: 50,
            items: [createPagedTextItem({
              chapterIndex: 0,
              blockIndex: 0,
              lineStartIndex: 0,
              lines: measuredLines.slice(0, 5),
              lineHeightPx: 10,
            })],
          },
          {
            height: 50,
            items: [createPagedTextItem({
              chapterIndex: 0,
              blockIndex: 0,
              lineStartIndex: 5,
              lines: measuredLines.slice(5, 10),
              lineHeightPx: 10,
            })],
          },
        ],
        startLocator: {
          chapterIndex: 0,
          blockIndex: 0,
          kind: 'text',
          lineIndex: 0,
          startCursor: measuredLines[0]?.start,
          endCursor: measuredLines[0]?.end,
          pageIndex: 0,
        },
        endLocator: {
          chapterIndex: 0,
          blockIndex: 0,
          kind: 'text',
          lineIndex: 9,
          startCursor: measuredLines[9]?.start,
          endCursor: measuredLines[9]?.end,
          pageIndex: 0,
        },
      }],
    };
    const anchorRatio = 0.6;
    const contentElement = createContentElement({
      scrollTop: 0,
      clientHeight: 100,
    });
    const scrollLocator = resolveCurrentScrollLocator({
      chapterIndex: 0,
      contentElement,
      isPagedMode: false,
      scrollLayouts: new Map([[0, measuredLayout]]),
      scrollChapterBodyElements: new Map([[0, createBodyElement(0)]]),
      scrollReaderChapters: [{ index: 0, chapter }],
      viewMode: 'original',
      anchorRatio,
    });
    const pagedLocator = resolveCurrentPagedLocator({
      currentPagedLayout: pagedLayout,
      isPagedMode: true,
      pageIndex: 0,
      viewMode: 'original',
      anchorRatio,
    });

    expect(scrollLocator).not.toBeNull();
    expect(pagedLocator).not.toBeNull();

    const scrollOffset = getOffsetForLocator(measuredLayout, scrollLocator);
    const pagedOffset = getOffsetForLocator(measuredLayout, pagedLocator);
    const lineHeight = measuredLayout.metrics[0]?.lineHeightPx ?? 0;

    expect(scrollOffset).not.toBeNull();
    expect(pagedOffset).not.toBeNull();
    expect(Math.abs((scrollOffset ?? 0) - (pagedOffset ?? 0))).toBeLessThanOrEqual(lineHeight);
  });

  it('uses flow block summaries for visible scroll block ranges before DOM offsets', () => {
    const metrics = [
      createTextMetric({ chapterIndex: 0, blockIndex: 0, lineCount: 1, lineHeightPx: 100, top: 0 }),
      createTextMetric({
        chapterIndex: 0,
        blockIndex: 1,
        lineCount: 1,
        lineHeightPx: 100,
        top: 100,
      }),
      createTextMetric({
        chapterIndex: 0,
        blockIndex: 2,
        lineCount: 1,
        lineHeightPx: 100,
        top: 200,
      }),
    ];
    const layout: MeasuredChapterLayout = {
      blockCount: metrics.length,
      chapterIndex: 0,
      metrics,
      renderMode: 'plain',
      textWidth: 360,
      totalHeight: 300,
    };
    const ranges = calculateVisibleScrollBlockRanges({
      contentElement: createContentElement({ clientHeight: 80, scrollTop: 1120 }),
      isPagedMode: false,
      renderableScrollLayouts: [{
        chapter: createChapter(0),
        flowEntry: {
          blockSummaries: metrics.map((metric) => ({
            height: metric.height,
            startOffset: metric.top,
          })),
          scrollStart: 1000,
        },
        index: 0,
        layout,
      }],
      scrollChapterBodyElements: new Map([[0, createBodyElement(9999)]]),
      scrollViewportHeight: 80,
      scrollViewportTop: 1120,
      viewMode: 'original',
    });

    expect(ranges.get(0)).toEqual({
      startIndex: 0,
      endIndex: 2,
    });
  });

  it('prefers the live DOM scrollTop when the synced scroll state is stale', () => {
    const metrics = [
      createTextMetric({ chapterIndex: 0, blockIndex: 0, lineCount: 1, lineHeightPx: 100, top: 0 }),
      createTextMetric({
        chapterIndex: 0,
        blockIndex: 1,
        lineCount: 1,
        lineHeightPx: 100,
        top: 100,
      }),
      createTextMetric({
        chapterIndex: 0,
        blockIndex: 2,
        lineCount: 1,
        lineHeightPx: 100,
        top: 200,
      }),
      createTextMetric({
        chapterIndex: 0,
        blockIndex: 3,
        lineCount: 1,
        lineHeightPx: 100,
        top: 300,
      }),
      createTextMetric({
        chapterIndex: 0,
        blockIndex: 4,
        lineCount: 1,
        lineHeightPx: 100,
        top: 400,
      }),
      createTextMetric({
        chapterIndex: 0,
        blockIndex: 5,
        lineCount: 1,
        lineHeightPx: 100,
        top: 500,
      }),
    ];
    const layout: MeasuredChapterLayout = {
      blockCount: metrics.length,
      chapterIndex: 0,
      metrics,
      renderMode: 'plain',
      textWidth: 360,
      totalHeight: 600,
    };
    const ranges = calculateVisibleScrollBlockRanges({
      contentElement: createContentElement({ clientHeight: 80, scrollTop: 1500 }),
      isPagedMode: false,
      renderableScrollLayouts: [{
        chapter: createChapter(0),
        flowEntry: {
          blockSummaries: metrics.map((metric) => ({
            height: metric.height,
            startOffset: metric.top,
          })),
          scrollStart: 1000,
        },
        index: 0,
        layout,
      }],
      scrollChapterBodyElements: new Map([[0, createBodyElement(9999)]]),
      scrollViewportHeight: 80,
      scrollViewportTop: 1000,
      viewMode: 'original',
    });

    expect(ranges.get(0)).toEqual({
      startIndex: 2,
      endIndex: 5,
    });
  });
});
