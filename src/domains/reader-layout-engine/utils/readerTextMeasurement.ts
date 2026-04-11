import type { PreparedTextWithSegments } from '@chenglou/pretext';
import type { RichInline } from '@shared/contracts';
import type { ReaderMeasuredLine, ReaderTypographyMetrics } from './readerLayoutTypes';

import {
  layoutWithLines,
  prepareWithSegments,
} from '@chenglou/pretext';

import { getApproximateMaxCharsPerLine } from './readerLayoutShared';
import {
  getRichTextLayoutCacheSizeForTests,
  layoutRichTextWithPretext,
  resetRichTextLayoutCacheForTests,
} from './richTextLayout';
import {
  createReaderContentMeasuredTokenValues,
  READER_CONTENT_MEASURED_TOKEN_NAMES,
} from '@shared/reader-content';

const MAX_PRETEXT_CACHE_SIZE = 256;
const PRETEXT_CACHE = new Map<string, PreparedTextWithSegments | null>();

interface PreparedTextBlock {
  font: string;
  prepared: PreparedTextWithSegments | null;
  text: string;
}

let browserTextMeasureRoot: HTMLDivElement | null = null;

export interface ReaderRichTextLayoutResult {
  lines: ReaderMeasuredLine[];
  richLineFragments: RichInline[][];
}

export interface ReaderTextLayoutEngine {
  layoutLines: (params: {
    font: string;
    fontSizePx: number;
    lineHeightPx: number;
    maxWidth: number;
    text: string;
  }) => ReaderMeasuredLine[];
  layoutRichLines?: (params: {
    font: string;
    fontSizePx: number;
    inlines: RichInline[];
    lineHeightPx: number;
    maxWidth: number;
  }) => ReaderRichTextLayoutResult | null;
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
  text: string;
  whiteSpace?: 'normal' | 'pre-wrap';
}): number | null {
  const root = getBrowserTextMeasureRoot();
  if (!root || params.maxWidth <= 0 || params.text.length === 0) {
    return null;
  }

  const probe = document.createElement('div');
  probe.style.boxSizing = 'border-box';
  probe.style.display = 'block';
  probe.style.font = params.font;
  probe.style.fontSize = `${params.fontSizePx}px`;
  probe.style.lineHeight = `${params.lineHeightPx}px`;
  probe.style.maxWidth = `${params.maxWidth}px`;
  probe.style.width = `${params.maxWidth}px`;
  probe.style.margin = '0';
  probe.style.padding = '0';
  probe.style.whiteSpace = params.whiteSpace ?? 'normal';
  probe.style.overflowWrap = 'break-word';
  probe.style.wordBreak = 'normal';

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
  layoutRichLines(params) {
    return layoutRichTextWithPretext({
      baseFont: params.font,
      baseFontSizePx: params.fontSizePx,
      inlines: params.inlines,
      lineHeightPx: params.lineHeightPx,
      maxWidth: params.maxWidth,
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
  return PRETEXT_CACHE.size + getRichTextLayoutCacheSizeForTests();
}

export function resetReaderLayoutPretextCacheForTests(): void {
  PRETEXT_CACHE.clear();
  resetRichTextLayoutCacheForTests();
  browserTextMeasureRoot?.remove();
  browserTextMeasureRoot = null;
}
