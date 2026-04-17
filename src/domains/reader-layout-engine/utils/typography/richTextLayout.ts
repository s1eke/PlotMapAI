import type { LayoutLine } from '@chenglou/pretext';
import type { RichInline } from '@shared/contracts';
import type { ReaderMeasuredLine } from '../layout/readerLayoutTypes';

import {
  layoutWithLines,
} from '@chenglou/pretext';

import { getRichInlinePlainText } from '@shared/text-processing';

import { sliceRichInlinesByGraphemeRange } from './richLineFragments';
import {
  buildRichInlinesFromFlattenedGraphemes,
  compactRichInlines,
  createSyntheticTextGraphemes,
  findGraphemeSequenceRange,
  flattenRichInlinesToGraphemes,
  getGraphemes,
  getPreparedText,
  getRichTextLayoutCacheSize,
  measureRichGraphemeWidth,
  normalizeRichGraphemes,
  resetRichTextLayoutCache,
} from './richTextLayoutHelpers';

interface RichPreparedText {
  prepared: NonNullable<ReturnType<typeof getPreparedText>>;
  segmentRichFragments: RichInline[][];
}

function buildLegacyBreakablePrefixWidths(
  breakableFitAdvances: Array<number[] | null>,
): Array<number[] | null> {
  return breakableFitAdvances.map((segmentAdvances) => {
    if (!segmentAdvances) {
      return null;
    }

    return segmentAdvances.reduce<number[]>((prefix, width) => {
      const previousTotal = prefix.at(-1) ?? 0;
      prefix.push(previousTotal + width);
      return prefix;
    }, []);
  });
}

function getSegmentBreakableFitAdvances(
  prepared: NonNullable<ReturnType<typeof getPreparedText>>,
  index: number,
): number[] | null {
  const fitAdvances = prepared.breakableFitAdvances?.[index];
  if (fitAdvances === null || Array.isArray(fitAdvances)) {
    return fitAdvances;
  }

  const legacyPrepared = prepared as {
    breakableWidths?: Array<number[] | null>;
  };
  return legacyPrepared.breakableWidths?.[index] ?? null;
}

export interface ReaderRichTextLayoutResult {
  lines: ReaderMeasuredLine[];
  richLineFragments: RichInline[][];
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
  const breakableFitAdvances: Array<number[] | null> = [];
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
      breakableFitAdvances.push(getSegmentBreakableFitAdvances(basePrepared, index));
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
      breakableFitAdvances.push(getSegmentBreakableFitAdvances(basePrepared, index));
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

    if (getSegmentBreakableFitAdvances(basePrepared, index) !== null) {
      breakableFitAdvances.push(graphemeWidthsForSegment);
      continue;
    }

    breakableFitAdvances.push(null);
  }

  const legacyBreakableFields = {
    breakablePrefixWidths: buildLegacyBreakablePrefixWidths(breakableFitAdvances),
    breakableWidths: breakableFitAdvances,
  };

  return {
    prepared: {
      ...basePrepared,
      ...legacyBreakableFields,
      breakableFitAdvances,
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
  return getRichTextLayoutCacheSize();
}

export function resetRichTextLayoutCacheForTests(): void {
  resetRichTextLayoutCache();
}
