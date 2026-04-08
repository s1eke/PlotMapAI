import type { LayoutLine, PreparedTextWithSegments } from '@chenglou/pretext';
import type { Mark, RichInline } from '@shared/contracts';
import type { ReaderMeasuredLine } from './readerLayoutTypes';

import {
  layoutNextLine,
  layoutWithLines,
  prepareWithSegments,
} from '@chenglou/pretext';

import { getRichInlinePlainText } from '@shared/text-processing';

import {
  resolveRichInlineTypography,
} from './richInlineTypography';
import { sliceRichInlinesByGraphemeRange } from './richLineFragments';

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

interface FlattenedRichGrapheme {
  href?: string;
  kind: 'lineBreak' | 'text';
  marks?: readonly Mark[];
  text: string;
}

interface RichPreparedText {
  prepared: PreparedTextWithSegments;
  segmentRichFragments: RichInline[][];
}

export interface ReaderRichTextLayoutResult {
  lines: ReaderMeasuredLine[];
  richLineFragments: RichInline[][];
}

function getGraphemes(text: string): string[] {
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment)
    : Array.from(text);
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

function getPreparedText(text: string, font: string): PreparedTextWithSegments | null {
  const cacheKey = `${font}\u0000${text}`;
  const cached = preparedTextCache.get(cacheKey);
  if (cached !== undefined) {
    return setCachedValue(preparedTextCache, cacheKey, cached, MAX_PREPARED_TEXT_CACHE_SIZE);
  }

  try {
    return setCachedValue(
      preparedTextCache,
      cacheKey,
      prepareWithSegments(text, font),
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

function measureRichGraphemeWidth(
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

function flattenRichInlinesToGraphemes(
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

function normalizeRichGraphemes(graphemes: FlattenedRichGrapheme[]): FlattenedRichGrapheme[] {
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

function compactRichInlines(inlines: RichInline[]): RichInline[] {
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

function buildRichInlinesFromFlattenedGraphemes(graphemes: FlattenedRichGrapheme[]): RichInline[] {
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

function findGraphemeSequenceRange(
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

function createSyntheticTextGraphemes(
  text: string,
): FlattenedRichGrapheme[] {
  return getGraphemes(text).map((grapheme) => ({
    kind: grapheme === '\n' ? 'lineBreak' : 'text',
    text: grapheme,
  }));
}

function buildRichPreparedText(params: {
  baseFont: string;
  baseFontSizePx: number;
  inlines: RichInline[];
}): RichPreparedText | null {
  const plainText = getRichInlinePlainText(params.inlines);
  const basePrepared = getPreparedText(plainText, params.baseFont);
  if (!basePrepared) {
    return null;
  }

  const normalizedGraphemes = normalizeRichGraphemes(
    flattenRichInlinesToGraphemes(params.inlines),
  );
  const normalizedText = normalizedGraphemes.map((grapheme) => grapheme.text);
  const segmentRichFragments: RichInline[][] = [];
  const widths: number[] = [];
  const lineEndFitAdvances: number[] = [];
  const lineEndPaintAdvances: number[] = [];
  const breakableWidths: Array<number[] | null> = [];
  const breakablePrefixWidths: Array<number[] | null> = [];
  let searchCursor = 0;

  for (let index = 0; index < basePrepared.segments.length; index += 1) {
    const segmentText = basePrepared.segments[index] ?? '';
    const kind = basePrepared.kinds[index];
    if (!kind) {
      continue;
    }

    if (kind === 'soft-hyphen') {
      segmentRichFragments.push([]);
      widths.push(basePrepared.widths[index] ?? 0);
      lineEndFitAdvances.push(basePrepared.lineEndFitAdvances[index] ?? 0);
      lineEndPaintAdvances.push(basePrepared.lineEndPaintAdvances[index] ?? 0);
      breakableWidths.push(basePrepared.breakableWidths[index] ?? null);
      breakablePrefixWidths.push(basePrepared.breakablePrefixWidths[index] ?? null);
      continue;
    }

    const targetGraphemes = kind === 'hard-break'
      ? ['\n']
      : getGraphemes(segmentText);
    const matchedRange = findGraphemeSequenceRange(
      normalizedText,
      targetGraphemes,
      searchCursor,
    );
    const segmentGraphemes = matchedRange
      ? normalizedGraphemes.slice(matchedRange.start, matchedRange.end)
      : createSyntheticTextGraphemes(kind === 'hard-break' ? '\n' : segmentText);

    if (matchedRange) {
      searchCursor = matchedRange.end;
    }

    const richFragments = buildRichInlinesFromFlattenedGraphemes(segmentGraphemes);
    segmentRichFragments.push(richFragments);

    if (kind === 'hard-break' || kind === 'tab' || kind === 'zero-width-break') {
      widths.push(basePrepared.widths[index] ?? 0);
      lineEndFitAdvances.push(basePrepared.lineEndFitAdvances[index] ?? 0);
      lineEndPaintAdvances.push(basePrepared.lineEndPaintAdvances[index] ?? 0);
      breakableWidths.push(basePrepared.breakableWidths[index] ?? null);
      breakablePrefixWidths.push(basePrepared.breakablePrefixWidths[index] ?? null);
      continue;
    }

    const graphemeWidthsForSegment = segmentGraphemes.map((grapheme) => measureRichGraphemeWidth(
      grapheme,
      params.baseFont,
      params.baseFontSizePx,
    ));
    const segmentWidth = graphemeWidthsForSegment.reduce((total, width) => total + width, 0);
    widths.push(segmentWidth);
    lineEndFitAdvances.push(
      kind === 'space' || kind === 'preserved-space'
        ? 0
        : segmentWidth,
    );
    lineEndPaintAdvances.push(
      kind === 'space'
        ? 0
        : segmentWidth,
    );

    if (basePrepared.breakableWidths[index] !== null) {
      breakableWidths.push(graphemeWidthsForSegment);
      breakablePrefixWidths.push(graphemeWidthsForSegment.reduce<number[]>((prefix, width) => {
        const previousTotal = prefix.at(-1) ?? 0;
        prefix.push(previousTotal + width);
        return prefix;
      }, []));
      continue;
    }

    breakableWidths.push(null);
    breakablePrefixWidths.push(null);
  }

  return {
    prepared: {
      ...basePrepared,
      breakablePrefixWidths,
      breakableWidths,
      lineEndFitAdvances,
      lineEndPaintAdvances,
      widths,
    },
    segmentRichFragments,
  };
}

function sliceRichPreparedLine(params: {
  line: LayoutLine;
  segmentRichFragments: RichInline[][];
}): RichInline[] {
  const { line } = params;
  const { end, start } = line;
  const {
    graphemeIndex: endGraphemeIndex,
    segmentIndex: endSegmentIndex,
  } = end;
  const {
    graphemeIndex: startGraphemeIndex,
    segmentIndex: startSegmentIndex,
  } = start;
  const lineFragments: RichInline[] = [];
  const lastSegmentExclusive = endGraphemeIndex > 0
    ? endSegmentIndex + 1
    : endSegmentIndex;

  for (
    let segmentIndex = startSegmentIndex;
    segmentIndex < lastSegmentExclusive;
    segmentIndex += 1
  ) {
    const segmentFragments = params.segmentRichFragments[segmentIndex] ?? [];
    if (segmentFragments.length === 0) {
      continue;
    }

    const segmentPlainText = getRichInlinePlainText(segmentFragments);
    const segmentLength = getGraphemes(segmentPlainText).length;
    const sliceStart = segmentIndex === startSegmentIndex
      ? startGraphemeIndex
      : 0;
    const sliceEnd = segmentIndex === endSegmentIndex
      && endGraphemeIndex > 0
      ? endGraphemeIndex
      : segmentLength;
    const sliced = sliceStart <= 0 && sliceEnd >= segmentLength
      ? segmentFragments
      : sliceRichInlinesByGraphemeRange(segmentFragments, sliceStart, sliceEnd);

    lineFragments.push(...sliced);
  }

  return compactRichInlines(lineFragments);
}

export function layoutRichTextWithPretext(params: {
  baseFont: string;
  baseFontSizePx: number;
  inlines: RichInline[];
  lineHeightPx: number;
  maxWidth: number;
}): ReaderRichTextLayoutResult | null {
  if (params.maxWidth <= 0 || params.inlines.length === 0) {
    return {
      lines: [],
      richLineFragments: [],
    };
  }

  const richPrepared = buildRichPreparedText(params);
  if (!richPrepared) {
    return null;
  }

  const layout = layoutWithLines(
    richPrepared.prepared,
    params.maxWidth,
    params.lineHeightPx,
  );

  return {
    lines: layout.lines.map((line, index): ReaderMeasuredLine => ({
      ...line,
      lineIndex: index,
    })),
    richLineFragments: layout.lines.map((line) => sliceRichPreparedLine({
      line,
      segmentRichFragments: richPrepared.segmentRichFragments,
    })),
  };
}

export function getRichTextLayoutCacheSizeForTests(): number {
  return preparedTextCache.size + graphemeWidthCache.size + collapsedSpaceWidthCache.size;
}

export function resetRichTextLayoutCacheForTests(): void {
  preparedTextCache.clear();
  graphemeWidthCache.clear();
  collapsedSpaceWidthCache.clear();
}
