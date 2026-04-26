import type { PreparedTextWithSegments } from '@chenglou/pretext';
import type { Mark, RichInline } from '@shared/contracts';
import type { ReaderTextPrepareOptions } from '../layout/readerTextPolicy';

import {
  layoutNextLine,
  prepareWithSegments,
} from '@chenglou/pretext';

import { resolveRichInlineTypography } from './richInlineTypography';
import {
  serializeReaderTextPrepareOptions,
  toPretextPrepareOptions,
} from '../layout/readerTextPolicy';

const UNBOUNDED_LAYOUT_WIDTH = 100_000;
const MAX_PREPARED_TEXT_CACHE_SIZE = 512;
const MAX_GRAPHEME_WIDTH_CACHE_SIZE = 2_048;
const LINE_START_CURSOR = {
  graphemeIndex: 0,
  segmentIndex: 0,
} as const;

const graphemeSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

const preparedTextCache = new Map<string, PreparedTextWithSegments | null>();
const graphemeWidthCache = new Map<string, number>();
const collapsedSpaceWidthCache = new Map<string, number>();

export interface FlattenedRichGrapheme {
  href?: string;
  kind: 'lineBreak' | 'text';
  marks?: readonly Mark[];
  text: string;
}

function setCachedValue<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  maxSize: number,
): T {
  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, value);
  while (cache.size > maxSize) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }

  return value;
}

export function getGraphemes(text: string): string[] {
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment)
    : Array.from(text);
}

export function getPreparedText(
  text: string,
  font: string,
  prepareOptions?: ReaderTextPrepareOptions,
): PreparedTextWithSegments | null {
  const cacheKey = `${font}\u0000${serializeReaderTextPrepareOptions(prepareOptions)}\u0000${text}`;
  const cached = preparedTextCache.get(cacheKey);
  if (cached !== undefined) {
    return setCachedValue(preparedTextCache, cacheKey, cached, MAX_PREPARED_TEXT_CACHE_SIZE);
  }

  try {
    return setCachedValue(
      preparedTextCache,
      cacheKey,
      prepareWithSegments(text, font, toPretextPrepareOptions(prepareOptions)),
      MAX_PREPARED_TEXT_CACHE_SIZE,
    );
  } catch {
    return setCachedValue(preparedTextCache, cacheKey, null, MAX_PREPARED_TEXT_CACHE_SIZE);
  }
}

function measureSingleLineWidth(text: string, font: string): number {
  if (text.length === 0) {
    return 0;
  }

  const prepared = getPreparedText(text, font);
  if (!prepared) {
    return 0;
  }

  const line = layoutNextLine(prepared, LINE_START_CURSOR, UNBOUNDED_LAYOUT_WIDTH);
  return line?.width ?? 0;
}

function measureCollapsedSpaceWidth(font: string): number {
  const cached = collapsedSpaceWidthCache.get(font);
  if (cached !== undefined) {
    return cached;
  }

  const joinedWidth = measureSingleLineWidth('A A', font);
  const compactWidth = measureSingleLineWidth('AA', font);
  const collapsedWidth = Math.max(0, joinedWidth - compactWidth);
  collapsedSpaceWidthCache.set(font, collapsedWidth);
  return collapsedWidth;
}

export function measureRichGraphemeWidth(
  grapheme: FlattenedRichGrapheme,
  baseFont: string,
  baseFontSizePx: number,
): number {
  if (grapheme.kind === 'lineBreak') {
    return 0;
  }

  const typography = resolveRichInlineTypography({
    baseFont,
    baseFontSizePx,
    marks: grapheme.marks,
  });
  const cacheKey = `${typography.font}\u0000${grapheme.text}`;
  const cached = graphemeWidthCache.get(cacheKey);
  if (cached !== undefined) {
    return setCachedValue(graphemeWidthCache, cacheKey, cached, MAX_GRAPHEME_WIDTH_CACHE_SIZE);
  }

  const width = grapheme.text === ' '
    ? measureCollapsedSpaceWidth(typography.font)
    : measureSingleLineWidth(grapheme.text, typography.font);
  return setCachedValue(graphemeWidthCache, cacheKey, width, MAX_GRAPHEME_WIDTH_CACHE_SIZE);
}

export function flattenRichInlinesToGraphemes(
  inlines: RichInline[],
  href?: string,
): FlattenedRichGrapheme[] {
  const graphemes: FlattenedRichGrapheme[] = [];

  for (const inline of inlines) {
    if (inline.type === 'lineBreak') {
      graphemes.push({
        href,
        kind: 'lineBreak',
        text: '\n',
      });
      continue;
    }

    if (inline.type === 'link') {
      graphemes.push(...flattenRichInlinesToGraphemes(inline.children, inline.href));
      continue;
    }

    for (const grapheme of getGraphemes(inline.text)) {
      if (grapheme === '\n') {
        graphemes.push({
          href,
          kind: 'lineBreak',
          text: grapheme,
        });
        continue;
      }

      graphemes.push({
        href,
        kind: 'text',
        marks: inline.marks,
        text: grapheme,
      });
    }
  }

  return graphemes;
}

function isCollapsibleWhitespace(grapheme: string): boolean {
  return grapheme === ' ' || grapheme === '\t' || grapheme === '\r' || grapheme === '\f';
}

export function normalizeRichGraphemes(
  graphemes: FlattenedRichGrapheme[],
): FlattenedRichGrapheme[] {
  const normalized: FlattenedRichGrapheme[] = [];
  let pendingSpace: FlattenedRichGrapheme | null = null;
  let atLineStart = true;

  for (const grapheme of graphemes) {
    if (grapheme.kind === 'lineBreak') {
      pendingSpace = null;
      normalized.push(grapheme);
      atLineStart = true;
      continue;
    }

    if (isCollapsibleWhitespace(grapheme.text)) {
      if (!atLineStart && !pendingSpace) {
        pendingSpace = {
          ...grapheme,
          text: ' ',
        };
      }
      continue;
    }

    if (pendingSpace) {
      normalized.push(pendingSpace);
      pendingSpace = null;
    }

    normalized.push(grapheme);
    atLineStart = false;
  }

  return normalized;
}

function areMarksEqual(
  left: readonly Mark[] | undefined,
  right: readonly Mark[] | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((mark, index) => mark === right[index]);
}

export function compactRichInlines(inlines: RichInline[]): RichInline[] {
  const compacted: RichInline[] = [];

  for (const inline of inlines) {
    if (inline.type === 'text') {
      if (inline.text.length === 0) {
        continue;
      }

      const previous = compacted.at(-1);
      if (previous?.type === 'text' && areMarksEqual(previous.marks, inline.marks)) {
        previous.text += inline.text;
        continue;
      }

      compacted.push({
        ...inline,
        marks: inline.marks ? [...inline.marks] : undefined,
      });
      continue;
    }

    if (inline.type === 'link') {
      if (inline.children.length === 0) {
        continue;
      }

      const previous = compacted.at(-1);
      if (previous?.type === 'link' && previous.href === inline.href) {
        previous.children = compactRichInlines([...previous.children, ...inline.children]);
        continue;
      }

      compacted.push({
        ...inline,
        children: compactRichInlines(inline.children),
      });
      continue;
    }

    compacted.push(inline);
  }

  return compacted;
}

function appendRichTextInline(target: RichInline[], text: string, marks?: readonly Mark[]): void {
  if (text.length === 0) {
    return;
  }

  const previous = target.at(-1);
  if (previous?.type === 'text' && areMarksEqual(previous.marks, marks)) {
    previous.text += text;
    return;
  }

  target.push({
    ...(marks && marks.length > 0 ? { marks: [...marks] } : {}),
    text,
    type: 'text',
  });
}

export function buildRichInlinesFromFlattenedGraphemes(
  graphemes: FlattenedRichGrapheme[],
): RichInline[] {
  const inlines: RichInline[] = [];
  let activeHref: string | null = null;
  let activeChildren: RichInline[] = [];

  const flushActiveLink = (): void => {
    if (!activeHref || activeChildren.length === 0) {
      activeHref = null;
      activeChildren = [];
      return;
    }

    inlines.push({
      children: compactRichInlines(activeChildren),
      href: activeHref,
      type: 'link',
    });
    activeHref = null;
    activeChildren = [];
  };

  const ensureTarget = (href: string | undefined): RichInline[] => {
    if (!href) {
      flushActiveLink();
      return inlines;
    }

    if (activeHref !== href) {
      flushActiveLink();
      activeHref = href;
    }

    return activeChildren;
  };

  for (const grapheme of graphemes) {
    const target = ensureTarget(grapheme.href);
    if (grapheme.kind === 'lineBreak') {
      target.push({ type: 'lineBreak' });
      continue;
    }

    appendRichTextInline(target, grapheme.text, grapheme.marks);
  }

  flushActiveLink();

  return compactRichInlines(inlines);
}

export function findGraphemeSequenceRange(
  source: string[],
  target: string[],
  startIndex: number,
): { start: number; end: number } | null {
  if (target.length === 0) {
    return {
      end: startIndex,
      start: startIndex,
    };
  }

  const maxStartIndex = source.length - target.length;
  for (let sourceIndex = Math.max(0, startIndex); sourceIndex <= maxStartIndex; sourceIndex += 1) {
    let matches = true;
    for (let targetIndex = 0; targetIndex < target.length; targetIndex += 1) {
      if (source[sourceIndex + targetIndex] !== target[targetIndex]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return {
        end: sourceIndex + target.length,
        start: sourceIndex,
      };
    }
  }

  return null;
}

export function createSyntheticTextGraphemes(text: string): FlattenedRichGrapheme[] {
  return getGraphemes(text).map((grapheme) => ({
    kind: grapheme === '\n' ? 'lineBreak' : 'text',
    text: grapheme,
  }));
}

export function getRichTextLayoutCacheSize(): number {
  return preparedTextCache.size + graphemeWidthCache.size + collapsedSpaceWidthCache.size;
}

export function resetRichTextLayoutCache(): void {
  preparedTextCache.clear();
  graphemeWidthCache.clear();
  collapsedSpaceWidthCache.clear();
}
