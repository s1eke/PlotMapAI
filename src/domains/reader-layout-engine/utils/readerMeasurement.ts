import type { PreparedTextWithSegments } from '@chenglou/pretext';
import type { ChapterContent } from '../readerContentService';
import type { ReaderImageDimensions } from './readerImageResourceCache';
import type {
  MeasuredChapterLayout,
  ReaderImageLayoutConstraints,
  ReaderMeasuredLine,
  ReaderTypographyMetrics,
  VirtualBlockMetrics,
} from './readerLayoutTypes';

import {
  layoutWithLines,
  prepareWithSegments,
} from '@chenglou/pretext';

import {
  buildPagedReaderBlocks,
  buildReaderBlocks,
  getApproximateMaxCharsPerLine,
  resolveReaderImageSize,
} from './readerLayoutShared';
import {
  buildRichScrollReaderBlocks,
  getRichScrollHorizontalTextWidth,
  getRichScrollRuleHeight,
  shouldUseRichScrollBlocks,
} from './richScroll';
import { getRichInlinePlainText } from '@shared/text-processing';

const MAX_PRETEXT_CACHE_SIZE = 256;
const PRETEXT_CACHE = new Map<string, PreparedTextWithSegments | null>();
const TABLE_BORDER_WIDTH_PX = 1;
const TABLE_CELL_HORIZONTAL_PADDING_PX = 12;
const TABLE_CELL_VERTICAL_PADDING_PX = 10;

interface PreparedTextBlock {
  font: string;
  prepared: PreparedTextWithSegments | null;
  text: string;
}

export interface ReaderTextLayoutEngine {
  layoutLines: (params: {
    font: string;
    fontSizePx: number;
    lineHeightPx: number;
    maxWidth: number;
    text: string;
  }) => ReaderMeasuredLine[];
}

function getPreparedTextFromCache(key: string): PreparedTextWithSegments | null | undefined {
  const prepared = PRETEXT_CACHE.get(key);
  if (prepared === undefined) {
    return undefined;
  }

  PRETEXT_CACHE.delete(key);
  PRETEXT_CACHE.set(key, prepared);
  return prepared;
}

function setPreparedTextInCache(key: string, prepared: PreparedTextWithSegments | null): void {
  if (PRETEXT_CACHE.has(key)) {
    PRETEXT_CACHE.delete(key);
  }

  PRETEXT_CACHE.set(key, prepared);
  while (PRETEXT_CACHE.size > MAX_PRETEXT_CACHE_SIZE) {
    const oldestKey = PRETEXT_CACHE.keys().next().value;
    if (!oldestKey) {
      return;
    }
    PRETEXT_CACHE.delete(oldestKey);
  }
}

function createPreparedTextBlock(
  text: string,
  font: string,
): PreparedTextBlock {
  const key = `${font}\u0000${text}`;
  let prepared = getPreparedTextFromCache(key);
  if (prepared === undefined) {
    prepared = prepareText(text, font);
    setPreparedTextInCache(key, prepared);
  }

  return {
    font,
    prepared,
    text,
  };
}

function prepareText(text: string, font: string): PreparedTextWithSegments | null {
  try {
    return prepareWithSegments(text, font);
  } catch {
    return null;
  }
}

function fallbackLayoutLines(
  text: string,
  maxWidth: number,
  fontSizePx: number,
): ReaderMeasuredLine[] {
  if (!text) {
    return [];
  }

  const maxCharsPerLine = getApproximateMaxCharsPerLine(maxWidth, fontSizePx);
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    chunks.push(text.slice(cursor, cursor + maxCharsPerLine));
    cursor += maxCharsPerLine;
  }

  return chunks.map((chunk, index) => ({
    end: {
      graphemeIndex: Math.min((index + 1) * maxCharsPerLine, text.length),
      segmentIndex: 0,
    },
    lineIndex: index,
    start: {
      graphemeIndex: index * maxCharsPerLine,
      segmentIndex: 0,
    },
    text: chunk,
    width: Math.min(maxWidth, chunk.length * fontSizePx * 0.55),
  }));
}

function measurePreparedTextBlock(params: {
  font: string;
  fontSizePx: number;
  lineHeightPx: number;
  maxWidth: number;
  text: string;
}): ReaderMeasuredLine[] {
  if (params.maxWidth <= 0) {
    return [];
  }

  const prepared = createPreparedTextBlock(params.text, params.font);
  if (prepared.prepared) {
    try {
      return layoutWithLines(prepared.prepared, params.maxWidth, params.lineHeightPx)
        .lines.map((line, index) => ({
          ...line,
          lineIndex: index,
        }));
    } catch {
      return fallbackLayoutLines(params.text, params.maxWidth, params.fontSizePx);
    }
  }

  return fallbackLayoutLines(params.text, params.maxWidth, params.fontSizePx);
}

export const browserReaderTextLayoutEngine: ReaderTextLayoutEngine = {
  layoutLines(params) {
    return measurePreparedTextBlock(params);
  },
};

export function createReaderTypographyMetrics(
  fontSize: number,
  lineSpacing: number,
  paragraphSpacing: number,
  viewportWidth: number,
): ReaderTypographyMetrics {
  const fontFamily = resolveReaderFontFamily();
  const headingFontSize = Math.max(
    fontSize * 1.35,
    viewportWidth >= 640 ? 28 : 24,
  );

  return {
    bodyFont: `400 ${fontSize}px ${fontFamily}`,
    bodyFontSize: fontSize,
    bodyLineHeightPx: Math.max(1, fontSize * lineSpacing),
    headingFont: `700 ${headingFontSize}px ${fontFamily}`,
    headingFontSize,
    headingLineHeightPx: Math.max(1, headingFontSize * 1.4),
    paragraphSpacing,
  };
}

function measureCaptionLines(params: {
  captionText: string;
  lineHeightPx: number;
  maxWidth: number;
  textLayoutEngine: ReaderTextLayoutEngine;
  typography: ReaderTypographyMetrics;
}): Pick<
  VirtualBlockMetrics,
  | 'captionFont'
  | 'captionFontSizePx'
  | 'captionHeight'
  | 'captionLineHeightPx'
  | 'captionLines'
  | 'captionSpacing'
> {
  const captionLines = params.captionText.length > 0
    ? params.textLayoutEngine.layoutLines({
      font: params.typography.bodyFont,
      fontSizePx: params.typography.bodyFontSize,
      lineHeightPx: params.lineHeightPx,
      maxWidth: params.maxWidth,
      text: params.captionText,
    })
    : [];
  const captionHeight = captionLines.length * params.lineHeightPx;

  return {
    captionFont: params.typography.bodyFont,
    captionFontSizePx: params.typography.bodyFontSize,
    captionHeight,
    captionLineHeightPx: params.lineHeightPx,
    captionLines,
    captionSpacing: captionLines.length > 0 ? 8 : 0,
  };
}

function measureTableRows(params: {
  lineHeightPx: number;
  maxWidth: number;
  tableRows: NonNullable<VirtualBlockMetrics['block']['tableRows']>;
  textLayoutEngine: ReaderTextLayoutEngine;
  typography: ReaderTypographyMetrics;
}): {
    contentHeight: number;
    rowHeights: number[];
  } {
  if (params.tableRows.length === 0) {
    return {
      contentHeight: 0,
      rowHeights: [],
    };
  }

  const columnCount = Math.max(
    ...params.tableRows.map((row) => row.length),
    1,
  );
  const totalHorizontalPadding =
    columnCount * TABLE_CELL_HORIZONTAL_PADDING_PX * 2
    + (columnCount + 1) * TABLE_BORDER_WIDTH_PX;
  const cellMaxWidth = Math.max(
    48,
    (params.maxWidth - totalHorizontalPadding) / columnCount,
  );
  const rowHeights = params.tableRows.map((row) => {
    const maxCellHeight = Math.max(...row.map((cell) => {
      const cellText = getRichInlinePlainText(cell.children);
      const measuredLines = cellText.length > 0
        ? params.textLayoutEngine.layoutLines({
          font: params.typography.bodyFont,
          fontSizePx: params.typography.bodyFontSize,
          lineHeightPx: params.lineHeightPx,
          maxWidth: cellMaxWidth,
          text: cellText,
        })
        : [];

      return Math.max(measuredLines.length, 1) * params.lineHeightPx
        + TABLE_CELL_VERTICAL_PADDING_PX * 2;
    }), params.lineHeightPx + TABLE_CELL_VERTICAL_PADDING_PX * 2);

    return maxCellHeight;
  });
  const borderHeight = (params.tableRows.length + 1) * TABLE_BORDER_WIDTH_PX;

  return {
    contentHeight: rowHeights.reduce((total, height) => total + height, 0) + borderHeight,
    rowHeights,
  };
}

function measureReaderBlocks(params: {
  blocks: ReturnType<typeof buildReaderBlocks>;
  chapterIndex: number;
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>;
  imageLayoutConstraints?: ReaderImageLayoutConstraints;
  renderMode: MeasuredChapterLayout['renderMode'];
  richAware: boolean;
  textLayoutEngine: ReaderTextLayoutEngine;
  typography: ReaderTypographyMetrics;
  width: number;
}): MeasuredChapterLayout {
  const metrics: VirtualBlockMetrics[] = [];
  let offsetTop = 0;

  for (const block of params.blocks) {
    let blockMetrics: VirtualBlockMetrics;

    if (block.kind === 'heading' || block.kind === 'text') {
      const font = block.kind === 'heading'
        ? params.typography.headingFont
        : params.typography.bodyFont;
      const fontSizePx = block.kind === 'heading'
        ? params.typography.headingFontSize
        : params.typography.bodyFontSize;
      const lineHeightPx = block.kind === 'heading'
        ? params.typography.headingLineHeightPx
        : params.typography.bodyLineHeightPx;
      const maxWidth = params.richAware
        ? getRichScrollHorizontalTextWidth(block, params.width)
        : params.width;

      if (block.renderRole === 'table' && block.tableRows) {
        const tableMetrics = measureTableRows({
          lineHeightPx,
          maxWidth,
          tableRows: block.tableRows,
          textLayoutEngine: params.textLayoutEngine,
          typography: params.typography,
        });

        blockMetrics = {
          block,
          contentHeight: tableMetrics.contentHeight,
          font,
          fontSizePx,
          fontWeight: 400,
          height: block.marginBefore + tableMetrics.contentHeight + block.marginAfter,
          lineHeightPx,
          lines: [],
          marginAfter: block.marginAfter,
          marginBefore: block.marginBefore,
          tableRowHeights: tableMetrics.rowHeights,
          top: offsetTop,
        };
      } else if (block.renderRole === 'hr') {
        blockMetrics = {
          block,
          contentHeight: getRichScrollRuleHeight(),
          font,
          fontSizePx,
          fontWeight: 400,
          height: block.marginBefore + getRichScrollRuleHeight() + block.marginAfter,
          lineHeightPx,
          lines: [],
          marginAfter: block.marginAfter,
          marginBefore: block.marginBefore,
          top: offsetTop,
        };
      } else {
        const lines = params.textLayoutEngine.layoutLines({
          font,
          fontSizePx,
          lineHeightPx,
          maxWidth,
          text: block.text ?? '',
        });
        const contentHeight = lines.length * lineHeightPx;

        blockMetrics = {
          block,
          contentHeight,
          font,
          fontSizePx,
          fontWeight: block.kind === 'heading' ? 700 : 400,
          height: block.marginBefore + contentHeight + block.marginAfter,
          lineHeightPx,
          lines,
          marginAfter: block.marginAfter,
          marginBefore: block.marginBefore,
          top: offsetTop,
        };
      }
    } else if (block.kind === 'image') {
      const availableWidth = params.richAware
        ? getRichScrollHorizontalTextWidth(block, params.width)
        : params.width;
      const resolvedImageSize = resolveReaderImageSize(
        availableWidth,
        block.imageKey,
        params.imageDimensionsByKey,
        params.imageLayoutConstraints,
      );
      const displayWidth = resolvedImageSize.width;
      const displayHeight = resolvedImageSize.height;
      const captionMetrics = measureCaptionLines({
        captionText: getRichInlinePlainText(block.imageCaption ?? []),
        lineHeightPx: params.typography.bodyLineHeightPx,
        maxWidth: availableWidth,
        textLayoutEngine: params.textLayoutEngine,
        typography: params.typography,
      });
      const contentHeight =
        displayHeight
        + (captionMetrics.captionSpacing ?? 0)
        + (captionMetrics.captionHeight ?? 0);

      blockMetrics = {
        block,
        ...captionMetrics,
        contentHeight,
        displayHeight,
        displayWidth,
        font: params.typography.bodyFont,
        fontSizePx: params.typography.bodyFontSize,
        fontWeight: 400,
        height: block.marginBefore + contentHeight + block.marginAfter,
        lineHeightPx: params.typography.bodyLineHeightPx,
        lines: [],
        marginAfter: block.marginAfter,
        marginBefore: block.marginBefore,
        top: offsetTop,
      };
    } else {
      blockMetrics = {
        block,
        contentHeight: 0,
        font: params.typography.bodyFont,
        fontSizePx: params.typography.bodyFontSize,
        fontWeight: 400,
        height: block.marginAfter,
        lineHeightPx: params.typography.bodyLineHeightPx,
        lines: [],
        marginAfter: block.marginAfter,
        marginBefore: 0,
        top: offsetTop,
      };
    }

    metrics.push(blockMetrics);
    offsetTop += blockMetrics.height;
  }

  return {
    blockCount: params.blocks.length,
    chapterIndex: params.chapterIndex,
    metrics,
    renderMode: params.renderMode,
    textWidth: params.width,
    totalHeight: offsetTop,
  };
}

export function measureReaderChapterLayout(
  chapter: ChapterContent,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  imageLayoutConstraints?: ReaderImageLayoutConstraints,
  textLayoutEngine: ReaderTextLayoutEngine = browserReaderTextLayoutEngine,
): MeasuredChapterLayout {
  return measureReaderBlocks({
    blocks: buildReaderBlocks(chapter, typography.paragraphSpacing),
    chapterIndex: chapter.index,
    imageDimensionsByKey,
    imageLayoutConstraints,
    renderMode: 'legacy-plain',
    richAware: false,
    textLayoutEngine,
    typography,
    width,
  });
}

export function measurePagedReaderChapterLayout(
  chapter: ChapterContent,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  textLayoutEngine: ReaderTextLayoutEngine = browserReaderTextLayoutEngine,
): MeasuredChapterLayout {
  const richAware = shouldUseRichScrollBlocks(chapter);

  return measureReaderBlocks({
    blocks: buildPagedReaderBlocks(chapter, typography.paragraphSpacing),
    chapterIndex: chapter.index,
    imageDimensionsByKey,
    renderMode: richAware ? 'rich' : 'legacy-plain',
    richAware,
    textLayoutEngine,
    typography,
    width,
  });
}

export function measureScrollReaderChapterLayout(
  chapter: ChapterContent,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  imageLayoutConstraints?: ReaderImageLayoutConstraints,
  textLayoutEngine: ReaderTextLayoutEngine = browserReaderTextLayoutEngine,
  preferRichScrollRendering = true,
): MeasuredChapterLayout {
  if (!shouldUseRichScrollBlocks(chapter, preferRichScrollRendering)) {
    return measureReaderChapterLayout(
      chapter,
      width,
      typography,
      imageDimensionsByKey,
      imageLayoutConstraints,
      textLayoutEngine,
    );
  }

  return measureReaderBlocks({
    blocks: buildRichScrollReaderBlocks(chapter, typography.paragraphSpacing),
    chapterIndex: chapter.index,
    imageDimensionsByKey,
    imageLayoutConstraints,
    renderMode: 'rich',
    richAware: true,
    textLayoutEngine,
    typography,
    width,
  });
}

function resolveReaderFontFamily(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    return 'sans-serif';
  }

  const fontFamily = window.getComputedStyle(document.body).fontFamily.trim();
  return fontFamily || 'sans-serif';
}

export function getReaderLayoutPretextCacheSizeForTests(): number {
  return PRETEXT_CACHE.size;
}

export function resetReaderLayoutPretextCacheForTests(): void {
  PRETEXT_CACHE.clear();
}
