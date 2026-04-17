import type { Mark, RichInline } from '@shared/contracts';
import type { ReaderMeasuredLine } from '../layout/readerLayoutTypes';

import { getRichInlinePlainText } from '@shared/text-processing';

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

const graphemeSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

const graphemeCache = new Map<string, string[]>();

function getGraphemes(text: string): string[] {
  const cached = graphemeCache.get(text);
  if (cached) {
    return cached;
  }

  const graphemes = graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment)
    : Array.from(text);

  graphemeCache.set(text, graphemes);
  return graphemes;
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

      compacted.push(inline);
      continue;
    }

    if (inline.type === 'link' && inline.children.length === 0) {
      continue;
    }

    compacted.push(inline);
  }

  return compacted;
}

function sliceRichInline(
  inline: RichInline,
  rangeStart: number,
  rangeEnd: number,
  cursor: number,
): {
    nextCursor: number;
    sliced: RichInline | null;
  } {
  if (inline.type === 'text') {
    const graphemes = getGraphemes(inline.text);
    const nextCursor = cursor + graphemes.length;
    if (rangeStart >= nextCursor || rangeEnd <= cursor) {
      return {
        nextCursor,
        sliced: null,
      };
    }

    const startOffset = Math.max(rangeStart, cursor) - cursor;
    const endOffset = Math.min(rangeEnd, nextCursor) - cursor;
    return {
      nextCursor,
      sliced: {
        ...inline,
        text: graphemes.slice(startOffset, endOffset).join(''),
      },
    };
  }

  if (inline.type === 'lineBreak') {
    return {
      nextCursor: cursor + 1,
      sliced: rangeStart < cursor + 1 && rangeEnd > cursor ? inline : null,
    };
  }

  const slicedChildren: RichInline[] = [];
  let childCursor = cursor;

  for (const child of inline.children) {
    const { nextCursor, sliced } = sliceRichInline(child, rangeStart, rangeEnd, childCursor);
    childCursor = nextCursor;
    if (sliced) {
      slicedChildren.push(sliced);
    }
  }

  return {
    nextCursor: childCursor,
    sliced: slicedChildren.length > 0
      ? {
        ...inline,
        children: compactRichInlines(slicedChildren),
      }
      : null,
  };
}

export function sliceRichInlinesByGraphemeRange(
  inlines: RichInline[],
  start: number,
  end: number,
): RichInline[] {
  if (end <= start) {
    return [];
  }

  const sliced: RichInline[] = [];
  let cursor = 0;

  for (const inline of inlines) {
    const fragment = sliceRichInline(inline, start, end, cursor);
    cursor = fragment.nextCursor;
    if (fragment.sliced) {
      sliced.push(fragment.sliced);
    }

    if (cursor >= end) {
      break;
    }
  }

  return compactRichInlines(sliced);
}

function findGraphemeSequenceRange(
  source: string[],
  target: string[],
  startIndex: number,
): { start: number; end: number } | null {
  if (target.length === 0) {
    return {
      start: startIndex,
      end: startIndex,
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
        start: sourceIndex,
        end: sourceIndex + target.length,
      };
    }
  }

  return null;
}

export function createRichLineFragments(
  inlines: RichInline[] | undefined,
  lines: ReaderMeasuredLine[],
): RichInline[][] | undefined {
  if (!inlines || inlines.length === 0 || lines.length === 0) {
    return undefined;
  }

  const fullText = getRichInlinePlainText(inlines);
  const fullTextGraphemes = getGraphemes(fullText);
  let sequentialFallbackCursor = 0;

  return lines.map((line) => {
    const rangeSliced = sliceRichInlinesByGraphemeRange(
      inlines,
      line.start.graphemeIndex,
      line.end.graphemeIndex,
    );
    if (getRichInlinePlainText(rangeSliced) === line.text) {
      sequentialFallbackCursor = Math.max(sequentialFallbackCursor, line.end.graphemeIndex);
      return rangeSliced;
    }

    const lineGraphemes = getGraphemes(line.text);
    const matchedRange = findGraphemeSequenceRange(
      fullTextGraphemes,
      lineGraphemes,
      sequentialFallbackCursor,
    );
    if (!matchedRange) {
      return rangeSliced;
    }

    sequentialFallbackCursor = matchedRange.end;
    return sliceRichInlinesByGraphemeRange(
      inlines,
      matchedRange.start,
      matchedRange.end,
    );
  });
}
