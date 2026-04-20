import { afterEach, describe, expect, it, vi } from 'vitest';

function parseFontSize(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  return match ? Number.parseFloat(match[1]) : 16;
}

function measureGraphemeWidth(grapheme: string, font: string): number {
  const fontSize = parseFontSize(font);
  const fontScale = fontSize / 16;
  const weightScale = font.includes('700') ? 1.75 : 1;
  const italicScale = font.includes('italic') ? 1.2 : 1;

  if (grapheme === ' ') {
    return 4 * fontScale * weightScale * italicScale;
  }

  return 8 * fontScale * weightScale * italicScale;
}

function createChunks(segments: string[], kinds: string[]) {
  const chunks: Array<{
    consumedEndSegmentIndex: number;
    endSegmentIndex: number;
    startSegmentIndex: number;
  }> = [];
  let chunkStart = 0;

  for (let index = 0; index < segments.length; index += 1) {
    if (kinds[index] !== 'hard-break') {
      continue;
    }

    chunks.push({
      consumedEndSegmentIndex: index + 1,
      endSegmentIndex: index,
      startSegmentIndex: chunkStart,
    });
    chunkStart = index + 1;
  }

  chunks.push({
    consumedEndSegmentIndex: segments.length,
    endSegmentIndex: segments.length,
    startSegmentIndex: chunkStart,
  });

  return chunks;
}

function prepareMockPretext(text: string, font: string) {
  const segments: string[] = [];
  const kinds: string[] = [];
  const widths: number[] = [];
  const lineEndFitAdvances: number[] = [];
  const lineEndPaintAdvances: number[] = [];
  const breakableWidths: Array<number[] | null> = [];
  const breakablePrefixWidths: Array<number[] | null> = [];
  let cursor = 0;

  while (cursor < text.length) {
    const grapheme = text[cursor];
    if (grapheme === '\n') {
      segments.push('\n');
      kinds.push('hard-break');
      widths.push(0);
      lineEndFitAdvances.push(0);
      lineEndPaintAdvances.push(0);
      breakableWidths.push(null);
      breakablePrefixWidths.push(null);
      cursor += 1;
      continue;
    }

    if (grapheme === ' ') {
      const width = measureGraphemeWidth(' ', font);
      segments.push(' ');
      kinds.push('space');
      widths.push(width);
      lineEndFitAdvances.push(0);
      lineEndPaintAdvances.push(0);
      breakableWidths.push(null);
      breakablePrefixWidths.push(null);
      cursor += 1;
      continue;
    }

    let nextCursor = cursor;
    while (nextCursor < text.length && text[nextCursor] !== ' ' && text[nextCursor] !== '\n') {
      nextCursor += 1;
    }

    const segmentText = text.slice(cursor, nextCursor);
    const graphemeWidths = Array.from(segmentText, (value) => measureGraphemeWidth(value, font));
    segments.push(segmentText);
    kinds.push('text');
    widths.push(graphemeWidths.reduce((total, width) => total + width, 0));
    lineEndFitAdvances.push(widths.at(-1) ?? 0);
    lineEndPaintAdvances.push(widths.at(-1) ?? 0);
    breakableWidths.push(segmentText.length > 1 ? graphemeWidths : null);
    breakablePrefixWidths.push(segmentText.length > 1
      ? graphemeWidths.reduce<number[]>((prefix, width) => {
        prefix.push((prefix.at(-1) ?? 0) + width);
        return prefix;
      }, [])
      : null);
    cursor = nextCursor;
  }

  return {
    breakablePrefixWidths,
    breakableWidths,
    chunks: createChunks(segments, kinds),
    discretionaryHyphenWidth: 0,
    kinds,
    lineEndFitAdvances,
    lineEndPaintAdvances,
    segLevels: null,
    segments,
    simpleLineWalkFastPath: false,
    tabStopAdvance: 0,
    widths,
  };
}

function buildLineTextFromPrepared(
  prepared: ReturnType<typeof prepareMockPretext>,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): string {
  let text = '';
  const lastSegmentExclusive = endGraphemeIndex > 0 ? endSegmentIndex + 1 : endSegmentIndex;

  for (let index = startSegmentIndex; index < lastSegmentExclusive; index += 1) {
    const segment = prepared.segments[index] ?? '';
    const sliceStart = index === startSegmentIndex ? startGraphemeIndex : 0;
    const sliceEnd = index === endSegmentIndex && endGraphemeIndex > 0
      ? endGraphemeIndex
      : segment.length;

    text += segment.slice(sliceStart, sliceEnd);
  }

  return text;
}

function normalizeCursor(
  prepared: ReturnType<typeof prepareMockPretext>,
  cursor: { graphemeIndex: number; segmentIndex: number },
): { graphemeIndex: number; segmentIndex: number } | null {
  const { graphemeIndex: startGraphemeIndex, segmentIndex: startSegmentIndex } = cursor;
  let segmentIndex = startSegmentIndex;
  let graphemeIndex = startGraphemeIndex;

  while (segmentIndex < prepared.segments.length) {
    const kind = prepared.kinds[segmentIndex];
    if (kind === 'hard-break' || kind === 'space') {
      segmentIndex += 1;
      graphemeIndex = 0;
      continue;
    }

    return {
      graphemeIndex,
      segmentIndex,
    };
  }

  return null;
}

function layoutNextPreparedLine(
  prepared: ReturnType<typeof prepareMockPretext>,
  cursor: { graphemeIndex: number; segmentIndex: number },
  maxWidth: number,
) {
  const normalizedCursor = normalizeCursor(prepared, cursor);
  if (!normalizedCursor) {
    return null;
  }

  const startSegmentIndex = normalizedCursor.segmentIndex;
  const startGraphemeIndex = normalizedCursor.graphemeIndex;
  let segmentIndex = startSegmentIndex;
  let currentWidth = 0;
  let endSegmentIndex = startSegmentIndex;
  let endGraphemeIndex = startGraphemeIndex;

  while (segmentIndex < prepared.segments.length) {
    const kind = prepared.kinds[segmentIndex];
    if (kind === 'hard-break') {
      break;
    }

    if (kind === 'space') {
      const width = prepared.widths[segmentIndex] ?? 0;
      if (currentWidth + width > maxWidth && currentWidth > 0) {
        break;
      }

      currentWidth += width;
      endSegmentIndex = segmentIndex + 1;
      endGraphemeIndex = 0;
      segmentIndex += 1;
      continue;
    }

    const segmentBreakableWidths = prepared.breakableWidths[segmentIndex];
    if (segmentBreakableWidths && segmentBreakableWidths.length > 0) {
      let graphemeIndex = segmentIndex === startSegmentIndex ? startGraphemeIndex : 0;
      while (graphemeIndex < segmentBreakableWidths.length) {
        const width = segmentBreakableWidths[graphemeIndex] ?? 0;
        if (currentWidth + width > maxWidth && currentWidth > 0) {
          return {
            end: {
              graphemeIndex: endGraphemeIndex,
              segmentIndex: endSegmentIndex,
            },
            start: {
              graphemeIndex: startGraphemeIndex,
              segmentIndex: startSegmentIndex,
            },
            text: buildLineTextFromPrepared(
              prepared,
              startSegmentIndex,
              startGraphemeIndex,
              endSegmentIndex,
              endGraphemeIndex,
            ),
            width: currentWidth,
          };
        }

        currentWidth += width;
        endSegmentIndex = segmentIndex;
        endGraphemeIndex = graphemeIndex + 1;
        graphemeIndex += 1;
      }

      endSegmentIndex = segmentIndex + 1;
      endGraphemeIndex = 0;
      segmentIndex += 1;
      continue;
    }

    const width = prepared.widths[segmentIndex] ?? 0;
    if (currentWidth + width > maxWidth && currentWidth > 0) {
      break;
    }

    currentWidth += width;
    endSegmentIndex = segmentIndex + 1;
    endGraphemeIndex = 0;
    segmentIndex += 1;
  }

  return {
    end: {
      graphemeIndex: endGraphemeIndex,
      segmentIndex: endSegmentIndex,
    },
    start: {
      graphemeIndex: startGraphemeIndex,
      segmentIndex: startSegmentIndex,
    },
    text: buildLineTextFromPrepared(
      prepared,
      startSegmentIndex,
      startGraphemeIndex,
      endSegmentIndex,
      endGraphemeIndex,
    ),
    width: currentWidth,
  };
}

function layoutPreparedLines(
  prepared: ReturnType<typeof prepareMockPretext>,
  maxWidth: number,
) {
  const lines: Array<{
    end: { graphemeIndex: number; segmentIndex: number };
    start: { graphemeIndex: number; segmentIndex: number };
    text: string;
    width: number;
  }> = [];
  let cursor = { graphemeIndex: 0, segmentIndex: 0 };

  while (true) {
    const line = layoutNextPreparedLine(prepared, cursor, maxWidth);
    if (!line) {
      return lines;
    }

    lines.push(line);
    if (
      line.end.segmentIndex === cursor.segmentIndex
      && line.end.graphemeIndex === cursor.graphemeIndex
    ) {
      return lines;
    }

    cursor = line.end;
  }
}

vi.mock('@chenglou/pretext', () => ({
  layoutNextLine: (
    prepared: ReturnType<typeof prepareMockPretext>,
    start: { graphemeIndex: number; segmentIndex: number },
    maxWidth: number,
  ) => {
    const lines = layoutPreparedLines({
      ...prepared,
      segments: [...prepared.segments],
    }, maxWidth);

    return lines.find((line) => (
      line.start.segmentIndex === start.segmentIndex
      && line.start.graphemeIndex === start.graphemeIndex
    )) ?? null;
  },
  layoutWithLines: (
    prepared: ReturnType<typeof prepareMockPretext>,
    maxWidth: number,
    lineHeight: number,
  ) => {
    const lines = layoutPreparedLines({
      ...prepared,
      segments: [...prepared.segments],
    }, maxWidth);

    return {
      height: lines.length * lineHeight,
      lineCount: lines.length,
      lines,
    };
  },
  prepareWithSegments: prepareMockPretext,
}));

import {
  layoutRichTextWithPretext,
  resetRichTextLayoutCacheForTests,
} from '../richTextLayout';

describe('richTextLayout', () => {
  afterEach(() => {
    resetRichTextLayoutCacheForTests();
  });

  it('uses inline typography widths when paged rich text wraps', () => {
    const mixedLayout = layoutRichTextWithPretext({
      baseFont: '400 16px sans-serif',
      baseFontSizePx: 16,
      inlines: [
        {
          text: 'AB',
          type: 'text',
        },
        {
          marks: ['bold'],
          text: 'CD',
          type: 'text',
        },
      ],
      lineHeightPx: 24,
      maxWidth: 36,
    });
    const plainLayout = layoutRichTextWithPretext({
      baseFont: '400 16px sans-serif',
      baseFontSizePx: 16,
      inlines: [{
        text: 'ABCD',
        type: 'text',
      }],
      lineHeightPx: 24,
      maxWidth: 36,
    });

    expect(plainLayout?.lines).toHaveLength(1);
    expect(mixedLayout?.lines).toHaveLength(2);
    expect(mixedLayout?.richLineFragments).toEqual([
      [
        {
          text: 'AB',
          type: 'text',
        },
        {
          marks: ['bold'],
          text: 'C',
          type: 'text',
        },
      ],
      [
        {
          marks: ['bold'],
          text: 'D',
          type: 'text',
        },
      ],
    ]);
  });

  it('preserves links and italic marks in measured rich line fragments', () => {
    const layout = layoutRichTextWithPretext({
      baseFont: '400 16px sans-serif',
      baseFontSizePx: 16,
      inlines: [
        {
          text: 'Lead ',
          type: 'text',
        },
        {
          children: [{
            marks: ['italic'],
            text: 'Link',
            type: 'text',
          }],
          href: '#note',
          type: 'link',
        },
      ],
      lineHeightPx: 24,
      maxWidth: 120,
    });

    expect(layout?.richLineFragments).toEqual([
      [
        {
          text: 'Lead ',
          type: 'text',
        },
        {
          children: [{
            marks: ['italic'],
            text: 'Link',
            type: 'text',
          }],
          href: '#note',
          type: 'link',
        },
      ],
    ]);
  });
});
