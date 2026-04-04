import { describe, expect, it } from 'vitest';

import { createFakeReaderTextLayoutEngine } from '../../test/createFakeReaderTextLayoutEngine';
import { createReaderLayoutSignature } from '../readerLayoutShared';
import { createReaderTypographyMetrics } from '../readerMeasurement';
import {
  buildStaticPagedChapterTree,
  composePaginatedChapterLayout,
  createReaderRenderQueryManifest,
  estimateReaderRenderQueryManifest,
  getPagedContentHeight,
} from '../readerPagination';
import type {
  MeasuredChapterLayout,
  ReaderMeasuredLine,
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

describe('readerPagination', () => {
  it('splits text fragments across page boundaries', () => {
    const measuredLayout = createMeasuredLayout([
      createTextMetric({ blockIndex: 1, lineCount: 3, top: 0 }),
    ]);

    const paginatedLayout = composePaginatedChapterLayout(measuredLayout, 32, 1, 32);

    expect(paginatedLayout.pageSlices).toHaveLength(2);
    expect(paginatedLayout.pageSlices[0]?.columns[0]?.items[0]).toMatchObject({
      kind: 'text',
      lineStartIndex: 0,
    });
    expect(paginatedLayout.pageSlices[1]?.columns[0]?.items[0]).toMatchObject({
      kind: 'text',
      lineStartIndex: 2,
    });
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

  it('scales oversized images down to the available page height', () => {
    const measuredLayout = createMeasuredLayout([
      createImageMetric({
        blockIndex: 1,
        displayHeight: 200,
        displayWidth: 100,
        top: 0,
      }),
    ]);

    const paginatedLayout = composePaginatedChapterLayout(measuredLayout, 100, 1, 32);
    const imageItem = paginatedLayout.pageSlices[0]?.columns[0]?.items[0];

    expect(imageItem).toMatchObject({
      displayHeight: 68,
      displayWidth: 34,
      height: 100,
      kind: 'image',
    });
  });

  it('keeps estimated and materialized two-column page counts aligned', () => {
    const textLayoutEngine = createFakeReaderTextLayoutEngine();
    const chapter = {
      index: 0,
      title: 'Chapter 1',
      plainText: Array.from(
        { length: 18 },
        (_, paragraphIndex) => `Paragraph ${paragraphIndex + 1} ${'alpha beta gamma delta '.repeat(6)}`,
      ).join('\n'),
      richBlocks: [],
      contentFormat: 'plain' as const,
      contentVersion: 1,
      wordCount: 2400,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    };
    const typography = createReaderTypographyMetrics(18, 1.6, 16, 900);
    const layoutSignature = createReaderLayoutSignature({
      columnCount: 2,
      columnGap: 32,
      fontSize: 18,
      lineSpacing: 1.6,
      pageHeight: getPagedContentHeight(860),
      paragraphSpacing: 16,
      textWidth: 320,
    });
    const tree = buildStaticPagedChapterTree(
      chapter,
      layoutSignature.textWidth,
      layoutSignature.pageHeight,
      layoutSignature.columnCount,
      layoutSignature.columnGap,
      typography,
      new Map(),
      textLayoutEngine,
    );

    const materializedManifest = createReaderRenderQueryManifest('original-paged', tree);
    const estimatedManifest = estimateReaderRenderQueryManifest({
      chapter,
      imageDimensionsByKey: new Map(),
      layoutSignature,
      typography,
      variantFamily: 'original-paged',
    });

    expect(materializedManifest.pageCount).toBeGreaterThan(1);
    expect(estimatedManifest.pageCount).toBe(materializedManifest.pageCount);
  });
});
