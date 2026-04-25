import type { RichInline } from '@shared/contracts';
import type {
  ReaderLineRange,
  ReaderMeasuredLine,
  ReaderTextLayoutEngine,
} from '../utils/layout/readerLayout';

import { createRichLineFragments } from '../utils/typography/richLineFragments';

interface CreateFakeReaderTextLayoutEngineOptions {
  maxCharsPerLine?: number;
}

export function createFakeReaderTextLayoutEngine(
  options: CreateFakeReaderTextLayoutEngineOptions = {},
): ReaderTextLayoutEngine {
  const layoutLines: ReaderTextLayoutEngine['layoutLines'] = ({
    fontSizePx,
    maxWidth,
    prepareOptions,
    text,
  }) => {
    if (maxWidth <= 0 || !text) {
      return [];
    }

    const maxCharsPerLine = options.maxCharsPerLine
      ?? Math.max(1, Math.floor(maxWidth / Math.max(fontSizePx * 0.55, 1)));
    const lines: ReaderMeasuredLine[] = [];

    const appendWrappedText = (chunkText: string, startOffset: number): void => {
      if (chunkText.length === 0) {
        lines.push({
          end: {
            graphemeIndex: startOffset,
            segmentIndex: 0,
          },
          lineIndex: lines.length,
          start: {
            graphemeIndex: startOffset,
            segmentIndex: 0,
          },
          text: '',
          width: 0,
        });
        return;
      }

      let chunkCursor = 0;
      while (chunkCursor < chunkText.length) {
        const nextCursor = Math.min(chunkCursor + maxCharsPerLine, chunkText.length);
        const chunk = chunkText.slice(chunkCursor, nextCursor);
        lines.push({
          end: {
            graphemeIndex: startOffset + nextCursor,
            segmentIndex: 0,
          },
          lineIndex: lines.length,
          start: {
            graphemeIndex: startOffset + chunkCursor,
            segmentIndex: 0,
          },
          text: chunk,
          width: Math.min(maxWidth, chunk.length * fontSizePx),
        });
        chunkCursor = nextCursor;
      }
    };

    if (prepareOptions?.whiteSpace === 'pre-wrap') {
      let offset = 0;
      for (const lineText of text.split('\n')) {
        appendWrappedText(lineText, offset);
        offset += lineText.length + 1;
      }
      return lines;
    }

    appendWrappedText(text, 0);

    return lines;
  };

  return {
    layoutLines,
    walkLineRanges(params) {
      return layoutLines({
        ...params,
        lineHeightPx: 1,
      }).map((line): ReaderLineRange => ({
        end: { ...line.end },
        lineIndex: line.lineIndex,
        start: { ...line.start },
        width: line.width,
      }));
    },
    layoutNextLineRange(params) {
      const ranges = layoutLines({
        ...params,
        lineHeightPx: 1,
      }).map((line): ReaderLineRange => ({
        end: { ...line.end },
        lineIndex: line.lineIndex,
        start: { ...line.start },
        width: line.width,
      }));
      return ranges.find((range) => (
        range.start.segmentIndex > params.start.segmentIndex
        || (
          range.start.segmentIndex === params.start.segmentIndex
          && range.start.graphemeIndex >= params.start.graphemeIndex
        )
      )) ?? null;
    },
    materializeLineRange(params) {
      return layoutLines(params).find((line) => (
        line.start.segmentIndex === params.range.start.segmentIndex
        && line.start.graphemeIndex === params.range.start.graphemeIndex
        && line.end.segmentIndex === params.range.end.segmentIndex
        && line.end.graphemeIndex === params.range.end.graphemeIndex
      )) ?? null;
    },
    measureLineStats(params) {
      const lines = layoutLines({
        ...params,
        lineHeightPx: 1,
      });
      return {
        lineCount: lines.length,
        maxLineWidth: Math.max(0, ...lines.map((line) => line.width)),
      };
    },
    layoutRichLines({ font, fontSizePx, inlines, lineHeightPx, maxWidth, prepareOptions }) {
      const text = inlinesToPlainText(inlines);
      const lines = layoutLines({
        font,
        fontSizePx,
        lineHeightPx,
        maxWidth,
        prepareOptions,
        text,
      });
      return {
        lines,
        richLineFragments: createRichLineFragments(inlines, lines) ?? [],
      };
    },
  };
}

function inlinesToPlainText(inlines: RichInline[]): string {
  return inlines.map((inline) => {
    if (inline.type === 'lineBreak') {
      return '\n';
    }

    if (inline.type === 'link') {
      return inlinesToPlainText(inline.children);
    }

    return inline.text;
  }).join('');
}
