import { describe, expect, it } from 'vitest';

import {
  findLocatorForLayoutOffset,
  findPageIndexForLocator,
  findVisibleBlockRange,
  getOffsetForLocator,
} from '../readerLocator';
import type {
  MeasuredChapterLayout,
  PaginatedChapterLayout,
  ReaderMeasuredLine,
  ReaderTextPageItem,
  VirtualBlockMetrics,
} from '../readerLayoutTypes';

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
  const lines = Array.from(
    { length: lineCount },
    (_, index) => createMeasuredLine(`line-${blockIndex}-${index}`, index),
  );
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

function createImageMetric({
  blockIndex,
  displayHeight,
  displayWidth,
  marginAfter = 16,
  marginBefore = 16,
  top,
}: {
  blockIndex: number;
  displayHeight: number;
  displayWidth: number;
  marginAfter?: number;
  marginBefore?: number;
  top: number;
}): VirtualBlockMetrics {
  return {
    block: {
      blockIndex,
      chapterIndex: 0,
      imageKey: `image-${blockIndex}`,
      key: `0:image:${blockIndex}`,
      kind: 'image',
      marginAfter,
      marginBefore,
      paragraphIndex: blockIndex,
    },
    contentHeight: displayHeight,
    displayHeight,
    displayWidth,
    font: '400 16px sans-serif',
    fontSizePx: 16,
    fontWeight: 400,
    height: marginBefore + displayHeight + marginAfter,
    lineHeightPx: 16,
    lines: [],
    marginAfter,
    marginBefore,
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

describe('readerLocator', () => {
  it('prefers an exact page start locator over earlier overlapping fragments', () => {
    const overlappingLine = createMeasuredLine('line-0-1', 1);
    const firstPageItem: ReaderTextPageItem = {
      blockIndex: 0,
      chapterIndex: 0,
      contentHeight: 32,
      font: '400 16px sans-serif',
      fontSizePx: 16,
      height: 32,
      key: '0:text:0:page-0',
      kind: 'text',
      lineHeightPx: 16,
      lineStartIndex: 0,
      lines: [
        createMeasuredLine('line-0-0', 0),
        overlappingLine,
      ],
      marginAfter: 0,
      marginBefore: 0,
      text: 'line-0-0line-0-1',
    };
    const secondPageItem: ReaderTextPageItem = {
      ...firstPageItem,
      key: '0:text:0:page-1',
      lineStartIndex: 1,
      lines: [
        overlappingLine,
        createMeasuredLine('line-0-2', 2),
      ],
    };
    const secondPageLocator = {
      blockIndex: 0,
      chapterIndex: 0,
      endCursor: overlappingLine.end,
      kind: 'text' as const,
      lineIndex: 1,
      startCursor: overlappingLine.start,
    };
    const paginatedLayout: PaginatedChapterLayout = {
      chapterIndex: 0,
      columnCount: 1,
      columnGap: 32,
      columnWidth: 400,
      pageHeight: 600,
      pageSlices: [
        {
          columnCount: 1,
          columns: [{ height: 32, items: [firstPageItem] }],
          endLocator: {
            blockIndex: 0,
            chapterIndex: 0,
            endCursor: overlappingLine.end,
            kind: 'text',
            lineIndex: 1,
            startCursor: overlappingLine.start,
          },
          pageIndex: 0,
          startLocator: {
            blockIndex: 0,
            chapterIndex: 0,
            endCursor: firstPageItem.lines[0]?.end,
            kind: 'text',
            lineIndex: 0,
            startCursor: firstPageItem.lines[0]?.start,
          },
        },
        {
          columnCount: 1,
          columns: [{ height: 32, items: [secondPageItem] }],
          endLocator: {
            blockIndex: 0,
            chapterIndex: 0,
            endCursor: secondPageItem.lines[1]?.end,
            kind: 'text',
            lineIndex: 2,
            startCursor: secondPageItem.lines[1]?.start,
          },
          pageIndex: 1,
          startLocator: secondPageLocator,
        },
      ],
    };

    expect(findPageIndexForLocator(paginatedLayout, secondPageLocator)).toBe(1);
  });

  it('round-trips text and image locators to layout offsets', () => {
    const measuredLayout = createMeasuredLayout([
      createTextMetric({ blockIndex: 0, lineCount: 2, top: 0 }),
      createImageMetric({ blockIndex: 1, displayHeight: 120, displayWidth: 240, top: 32 }),
    ]);

    const textOffset =
      (measuredLayout.metrics[0]?.top ?? 0) + (measuredLayout.metrics[0]?.marginBefore ?? 0);
    const textLocator = findLocatorForLayoutOffset(measuredLayout, textOffset);
    expect(textLocator?.kind).toBe('text');
    expect(getOffsetForLocator(measuredLayout, textLocator)).toBe(textOffset);

    const imageMetric = measuredLayout.metrics[1];
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
