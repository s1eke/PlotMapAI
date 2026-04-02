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
  buildReaderBlocks,
  getApproximateMaxCharsPerLine,
  resolveReaderImageSize,
} from './readerLayoutShared';

const MAX_PRETEXT_CACHE_SIZE = 256;
const PRETEXT_CACHE = new Map<string, PreparedTextWithSegments | null>();

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

export function measureReaderChapterLayout(
  chapter: ChapterContent,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  imageLayoutConstraints?: ReaderImageLayoutConstraints,
  textLayoutEngine: ReaderTextLayoutEngine = browserReaderTextLayoutEngine,
): MeasuredChapterLayout {
  const blocks = buildReaderBlocks(chapter, typography.paragraphSpacing);
  const metrics: VirtualBlockMetrics[] = [];
  let offsetTop = 0;

  for (const block of blocks) {
    let blockMetrics: VirtualBlockMetrics;
    if (block.kind === 'heading' || block.kind === 'text') {
      const font = block.kind === 'heading' ? typography.headingFont : typography.bodyFont;
      const fontSizePx = block.kind === 'heading'
        ? typography.headingFontSize
        : typography.bodyFontSize;
      const lineHeightPx = block.kind === 'heading'
        ? typography.headingLineHeightPx
        : typography.bodyLineHeightPx;
      const lines = textLayoutEngine.layoutLines({
        font,
        fontSizePx,
        lineHeightPx,
        maxWidth: width,
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
    } else if (block.kind === 'image') {
      const resolvedImageSize = resolveReaderImageSize(
        width,
        block.imageKey,
        imageDimensionsByKey,
        imageLayoutConstraints,
      );
      const displayWidth = resolvedImageSize.width;
      const displayHeight = resolvedImageSize.height;

      blockMetrics = {
        block,
        contentHeight: displayHeight,
        displayHeight,
        displayWidth,
        font: typography.bodyFont,
        fontSizePx: typography.bodyFontSize,
        fontWeight: 400,
        height: block.marginBefore + displayHeight + block.marginAfter,
        lineHeightPx: typography.bodyLineHeightPx,
        lines: [],
        marginAfter: block.marginAfter,
        marginBefore: block.marginBefore,
        top: offsetTop,
      };
    } else {
      blockMetrics = {
        block,
        contentHeight: 0,
        font: typography.bodyFont,
        fontSizePx: typography.bodyFontSize,
        fontWeight: 400,
        height: block.marginAfter,
        lineHeightPx: typography.bodyLineHeightPx,
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
    blockCount: blocks.length,
    chapterIndex: chapter.index,
    metrics,
    textWidth: width,
    totalHeight: offsetTop,
  };
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
