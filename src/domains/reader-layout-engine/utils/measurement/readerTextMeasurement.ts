import type {
  LayoutCursor as PretextLayoutCursor,
  LayoutLineRange as PretextLayoutLineRange,
} from '@chenglou/pretext';
import type { RichInline } from '@shared/contracts';
import type {
  ReaderLineRange,
  ReaderMeasuredLine,
  ReaderTypographyMetrics,
} from '../layout/readerLayoutTypes';
import type { ReaderTextPrepareOptions } from '../layout/readerTextPolicy';

import {
  layoutWithLines,
  layoutNextLineRange as layoutNextPretextLineRange,
  materializeLineRange as materializePretextLineRange,
  measureLineStats as measurePretextLineStats,
  setLocale as setPretextLocale,
  walkLineRanges as walkPretextLineRanges,
} from '@chenglou/pretext';

import { getApproximateMaxCharsPerLine } from '../layout/readerLayoutShared';
import {
  DEFAULT_READER_TEXT_PREPARE_OPTIONS,
  normalizeReaderTextPrepareOptions,
} from '../layout/readerTextPolicy';
import {
  createPreparedTextBlock,
  getPreparedTextCacheSizeForTests,
  resetPreparedTextCache,
} from './readerPreparedTextCache';
import {
  getRichTextLayoutCacheSizeForTests,
  layoutRichTextWithPretext,
  resetRichTextLayoutCacheForTests,
} from '../typography/richTextLayout';
import {
  createReaderContentMeasuredTokenValues,
  READER_CONTENT_MEASURED_TOKEN_NAMES,
} from '@shared/reader-rendering';

let browserTextMeasureRoot: HTMLDivElement | null = null;

export interface ReaderRichTextLayoutResult {
  lines: ReaderMeasuredLine[];
  richLineFragments: RichInline[][];
}

export interface ReaderTextLineStats {
  lineCount: number;
  maxLineWidth: number;
}

export interface ReaderTextLayoutEngine {
  layoutLines: (params: {
    font: string;
    fontSizePx: number;
    lineHeightPx: number;
    maxWidth: number;
    prepareOptions?: ReaderTextPrepareOptions;
    text: string;
  }) => ReaderMeasuredLine[];
  measureLineStats?: (params: {
    font: string;
    fontSizePx: number;
    maxWidth: number;
    prepareOptions?: ReaderTextPrepareOptions;
    text: string;
  }) => ReaderTextLineStats | null;
  walkLineRanges?: (params: {
    font: string;
    fontSizePx: number;
    maxWidth: number;
    prepareOptions?: ReaderTextPrepareOptions;
    text: string;
  }) => ReaderLineRange[] | null;
  layoutNextLineRange?: (params: {
    font: string;
    fontSizePx: number;
    maxWidth: number;
    prepareOptions?: ReaderTextPrepareOptions;
    start: ReaderLineRange['end'];
    text: string;
  }) => ReaderLineRange | null;
  materializeLineRange?: (params: {
    font: string;
    fontSizePx: number;
    lineHeightPx: number;
    maxWidth: number;
    prepareOptions?: ReaderTextPrepareOptions;
    range: ReaderLineRange;
    text: string;
  }) => ReaderMeasuredLine | null;
  layoutRichLines?: (params: {
    font: string;
    fontSizePx: number;
    inlines: RichInline[];
    lineHeightPx: number;
    maxWidth: number;
    prepareOptions?: ReaderTextPrepareOptions;
  }) => ReaderRichTextLayoutResult | null;
}

export type {
  ReaderTextPrepareOptions,
  ReaderTextWhiteSpace,
  ReaderTextWordBreak,
} from '../layout/readerTextPolicy';

function createFallbackMeasuredLine(params: {
  fontSizePx: number;
  index: number;
  maxWidth: number;
  startOffset: number;
  text: string;
}): ReaderMeasuredLine {
  return {
    end: {
      graphemeIndex: params.startOffset + params.text.length,
      segmentIndex: 0,
    },
    lineIndex: params.index,
    start: {
      graphemeIndex: params.startOffset,
      segmentIndex: 0,
    },
    text: params.text,
    width: Math.min(params.maxWidth, params.text.length * params.fontSizePx * 0.55),
  };
}

function toReaderLineRange(
  line: Pick<PretextLayoutLineRange, 'end' | 'start' | 'width'>,
  lineIndex: number,
): ReaderLineRange {
  return {
    end: { ...line.end },
    lineIndex,
    start: { ...line.start },
    width: line.width,
  };
}

function toPretextCursor(cursor: ReaderLineRange['end']): PretextLayoutCursor {
  return {
    graphemeIndex: cursor.graphemeIndex,
    segmentIndex: cursor.segmentIndex,
  };
}

function fallbackLayoutLines(
  text: string,
  maxWidth: number,
  fontSizePx: number,
  prepareOptions?: ReaderTextPrepareOptions,
): ReaderMeasuredLine[] {
  if (!text) {
    return [];
  }

  const maxCharsPerLine = getApproximateMaxCharsPerLine(maxWidth, fontSizePx);
  const normalizedOptions = normalizeReaderTextPrepareOptions(prepareOptions);
  const lines: ReaderMeasuredLine[] = [];

  const appendWrappedText = (chunkText: string, startOffset: number) => {
    if (chunkText.length === 0) {
      lines.push(createFallbackMeasuredLine({
        fontSizePx,
        index: lines.length,
        maxWidth,
        startOffset,
        text: '',
      }));
      return;
    }

    let cursor = 0;
    while (cursor < chunkText.length) {
      const chunk = chunkText.slice(cursor, cursor + maxCharsPerLine);
      lines.push(createFallbackMeasuredLine({
        fontSizePx,
        index: lines.length,
        maxWidth,
        startOffset: startOffset + cursor,
        text: chunk,
      }));
      cursor += maxCharsPerLine;
    }
  };

  if (normalizedOptions.whiteSpace === 'pre-wrap') {
    let offset = 0;
    for (const lineText of text.split('\n')) {
      appendWrappedText(lineText, offset);
      offset += lineText.length + 1;
    }
    return lines;
  }

  appendWrappedText(text, 0);
  return lines;
}

function measurePreparedTextBlock(params: {
  font: string;
  fontSizePx: number;
  lineHeightPx: number;
  maxWidth: number;
  prepareOptions?: ReaderTextPrepareOptions;
  text: string;
}): ReaderMeasuredLine[] {
  if (params.maxWidth <= 0) {
    return [];
  }

  const prepareOptions = params.prepareOptions ?? DEFAULT_READER_TEXT_PREPARE_OPTIONS;
  const prepared = createPreparedTextBlock(params.text, params.font, prepareOptions);
  if (prepared.prepared) {
    try {
      return layoutWithLines(prepared.prepared, params.maxWidth, params.lineHeightPx)
        .lines.map((line, index) => ({
          ...line,
          lineIndex: index,
        }));
    } catch {
      return fallbackLayoutLines(
        params.text,
        params.maxWidth,
        params.fontSizePx,
        prepareOptions,
      );
    }
  }

  return fallbackLayoutLines(params.text, params.maxWidth, params.fontSizePx, prepareOptions);
}

function measurePreparedTextStats(params: {
  font: string;
  fontSizePx: number;
  maxWidth: number;
  prepareOptions?: ReaderTextPrepareOptions;
  text: string;
}): ReaderTextLineStats | null {
  if (params.maxWidth <= 0 || params.text.length === 0) {
    return {
      lineCount: 0,
      maxLineWidth: 0,
    };
  }

  const prepareOptions = params.prepareOptions ?? DEFAULT_READER_TEXT_PREPARE_OPTIONS;
  const prepared = createPreparedTextBlock(params.text, params.font, prepareOptions);
  if (!prepared.prepared) {
    return null;
  }

  try {
    return measurePretextLineStats(prepared.prepared, params.maxWidth);
  } catch {
    return null;
  }
}

function walkPreparedLineRanges(params: {
  font: string;
  fontSizePx: number;
  maxWidth: number;
  prepareOptions?: ReaderTextPrepareOptions;
  text: string;
}): ReaderLineRange[] | null {
  if (params.maxWidth <= 0 || params.text.length === 0) {
    return [];
  }

  const prepareOptions = params.prepareOptions ?? DEFAULT_READER_TEXT_PREPARE_OPTIONS;
  const prepared = createPreparedTextBlock(params.text, params.font, prepareOptions);
  if (!prepared.prepared) {
    return null;
  }

  try {
    const ranges: ReaderLineRange[] = [];
    walkPretextLineRanges(prepared.prepared, params.maxWidth, (line) => {
      ranges.push(toReaderLineRange(line, ranges.length));
    });
    return ranges;
  } catch {
    return null;
  }
}

function layoutNextPreparedLineRange(params: {
  font: string;
  fontSizePx: number;
  maxWidth: number;
  prepareOptions?: ReaderTextPrepareOptions;
  start: ReaderLineRange['end'];
  text: string;
}): ReaderLineRange | null {
  if (params.maxWidth <= 0 || params.text.length === 0) {
    return null;
  }

  const prepareOptions = params.prepareOptions ?? DEFAULT_READER_TEXT_PREPARE_OPTIONS;
  const prepared = createPreparedTextBlock(params.text, params.font, prepareOptions);
  if (!prepared.prepared) {
    return null;
  }

  try {
    const range = layoutNextPretextLineRange(
      prepared.prepared,
      toPretextCursor(params.start),
      params.maxWidth,
    );
    return range ? toReaderLineRange(range, 0) : null;
  } catch {
    return null;
  }
}

function materializePreparedLineRange(params: {
  font: string;
  fontSizePx: number;
  lineHeightPx: number;
  maxWidth: number;
  prepareOptions?: ReaderTextPrepareOptions;
  range: ReaderLineRange;
  text: string;
}): ReaderMeasuredLine | null {
  if (params.maxWidth <= 0 || params.text.length === 0) {
    return null;
  }

  const prepareOptions = params.prepareOptions ?? DEFAULT_READER_TEXT_PREPARE_OPTIONS;
  const prepared = createPreparedTextBlock(params.text, params.font, prepareOptions);
  if (!prepared.prepared) {
    return null;
  }

  try {
    const line = materializePretextLineRange(prepared.prepared, {
      end: params.range.end,
      start: params.range.start,
      width: params.range.width,
    });
    return {
      ...line,
      lineIndex: params.range.lineIndex,
    };
  } catch {
    return null;
  }
}

function getBrowserTextMeasureRoot(): HTMLDivElement | null {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    return null;
  }

  if (browserTextMeasureRoot && document.body.contains(browserTextMeasureRoot)) {
    return browserTextMeasureRoot;
  }

  const root = document.createElement('div');
  root.setAttribute('aria-hidden', 'true');
  root.style.position = 'absolute';
  root.style.inset = '0 auto auto -99999px';
  root.style.visibility = 'hidden';
  root.style.pointerEvents = 'none';
  root.style.zIndex = '-1';
  root.style.contain = 'layout style';
  document.body.appendChild(root);
  browserTextMeasureRoot = root;
  return root;
}

function writeMeasuredTextContent(target: HTMLElement, text: string): void {
  target.replaceChildren();

  const lines = text.split('\n');
  lines.forEach((line, index) => {
    target.append(document.createTextNode(line));
    if (index < lines.length - 1) {
      target.append(document.createElement('br'));
    }
  });
}

export function measureTextHeightWithBrowserLayout(params: {
  font: string;
  fontSizePx: number;
  lineHeightPx: number;
  maxWidth: number;
  prepareOptions?: ReaderTextPrepareOptions;
  text: string;
  whiteSpace?: 'normal' | 'pre-wrap';
  wordBreak?: 'normal' | 'keep-all';
}): number | null {
  const root = getBrowserTextMeasureRoot();
  if (!root || params.maxWidth <= 0 || params.text.length === 0) {
    return null;
  }

  const prepareOptions = normalizeReaderTextPrepareOptions({
    ...params.prepareOptions,
    whiteSpace: params.whiteSpace ?? params.prepareOptions?.whiteSpace,
    wordBreak: params.wordBreak ?? params.prepareOptions?.wordBreak,
  });
  const probe = document.createElement('div');
  probe.style.boxSizing = 'border-box';
  probe.style.display = 'block';
  probe.style.font = params.font;
  probe.style.fontSize = `${params.fontSizePx}px`;
  probe.style.lineHeight = `${params.lineHeightPx}px`;
  probe.style.maxWidth = `${params.maxWidth}px`;
  probe.style.width = `${params.maxWidth}px`;
  probe.style.letterSpacing = `${prepareOptions.letterSpacingPx}px`;
  probe.style.margin = '0';
  probe.style.padding = '0';
  probe.style.whiteSpace = prepareOptions.whiteSpace;
  probe.style.overflowWrap = 'break-word';
  probe.style.wordBreak = prepareOptions.wordBreak;

  writeMeasuredTextContent(probe, params.text);
  root.appendChild(probe);
  const height = Math.ceil(probe.getBoundingClientRect().height);
  probe.remove();

  return height > 0 ? height : null;
}

export const browserReaderTextLayoutEngine: ReaderTextLayoutEngine = {
  layoutLines(params) {
    return measurePreparedTextBlock(params);
  },
  measureLineStats(params) {
    return measurePreparedTextStats(params);
  },
  walkLineRanges(params) {
    return walkPreparedLineRanges(params);
  },
  layoutNextLineRange(params) {
    return layoutNextPreparedLineRange(params);
  },
  materializeLineRange(params) {
    return materializePreparedLineRange(params);
  },
  layoutRichLines(params) {
    return layoutRichTextWithPretext({
      baseFont: params.font,
      baseFontSizePx: params.fontSizePx,
      inlines: params.inlines,
      lineHeightPx: params.lineHeightPx,
      maxWidth: params.maxWidth,
      prepareOptions: params.prepareOptions,
    });
  },
};

function resolveReaderFontFamily(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    return 'sans-serif';
  }

  const fontFamily = window.getComputedStyle(document.body).fontFamily.trim();
  return fontFamily || 'sans-serif';
}

export function createReaderTypographyMetrics(
  fontSize: number,
  lineSpacing: number,
  paragraphSpacing: number,
  viewportWidth: number,
): ReaderTypographyMetrics {
  const fontFamily = resolveReaderFontFamily();
  const measuredTokens = createReaderContentMeasuredTokenValues({
    fontSize,
    lineSpacing,
    paragraphSpacing,
    viewportWidth,
  });
  const bodyFontSize = measuredTokens[READER_CONTENT_MEASURED_TOKEN_NAMES.fontSize];
  const bodyLineHeightPx = measuredTokens[READER_CONTENT_MEASURED_TOKEN_NAMES.lineHeight];
  const headingFontSize = measuredTokens[READER_CONTENT_MEASURED_TOKEN_NAMES.headingFontSize];
  const headingLineHeightPx = measuredTokens[
    READER_CONTENT_MEASURED_TOKEN_NAMES.headingLineHeight
  ];
  const paragraphGap = measuredTokens[READER_CONTENT_MEASURED_TOKEN_NAMES.paragraphGap];

  return {
    bodyFont: `400 ${bodyFontSize}px ${fontFamily}`,
    bodyFontSize,
    bodyLineHeightPx,
    headingFont: `700 ${headingFontSize}px ${fontFamily}`,
    headingFontSize,
    headingLineHeightPx,
    paragraphSpacing: paragraphGap,
  };
}

export function getReaderLayoutPretextCacheSizeForTests(): number {
  return getPreparedTextCacheSizeForTests() + getRichTextLayoutCacheSizeForTests();
}

function resetReaderTextLayoutCaches(): void {
  resetPreparedTextCache();
  resetRichTextLayoutCacheForTests();
}

export function setReaderTextLayoutLocale(locale?: string): void {
  setPretextLocale(locale);
  resetReaderTextLayoutCaches();
}

export function resetReaderLayoutPretextCacheForTests(): void {
  resetReaderTextLayoutCaches();
  browserTextMeasureRoot?.remove();
  browserTextMeasureRoot = null;
}
