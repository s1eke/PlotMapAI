import type { ChapterDetectionRule, PurifyRule } from '@shared/text-processing';
import type { BookImportProgress } from './progress';
import type { BookParser, ParseContext, ParsedBook } from './types';

import { parseEpub } from './epub/parser';
import { parseTxt } from './txtParser';

export type { BookParser, ParseContext, ParsedBook, ParsedChapter } from './types';

const parsers: BookParser[] = [
  {
    canHandle: (file) => file.name.toLowerCase().endsWith('.epub'),
    parse: (file, context) => {
      if (!context.signal && !context.onProgress) {
        return parseEpub(file, { purificationRules: context.purificationRules });
      }
      return parseEpub(file, {
        signal: context.signal,
        onProgress: context.onProgress,
        purificationRules: context.purificationRules,
      });
    },
  },
  {
    canHandle: (file) => file.name.toLowerCase().endsWith('.txt'),
    parse: (file, context) => {
      if (!context.signal && !context.onProgress) {
        return parseTxt(file, context.tocRules);
      }
      return parseTxt(file, context.tocRules, {
        signal: context.signal,
        onProgress: context.onProgress,
      });
    },
  },
];

export function registerParser(parser: BookParser): void {
  parsers.unshift(parser);
}

export async function parseBook(
  file: File,
  tocRules: ChapterDetectionRule[],
  options: {
    purificationRules?: PurifyRule[];
    signal?: AbortSignal;
    onProgress?: (progress: BookImportProgress) => void;
  } = {},
): Promise<ParsedBook> {
  const context: ParseContext = { tocRules };
  if (options.signal) {
    context.signal = options.signal;
  }
  if (options.onProgress) {
    context.onProgress = options.onProgress;
  }
  if (options.purificationRules) {
    context.purificationRules = options.purificationRules;
  }
  const parser = parsers.find((p) => p.canHandle(file));
  if (!parser) {
    const ext = file.name.toLowerCase().split('.').pop();
    throw new Error(`Unsupported file type: .${ext}`);
  }
  return parser.parse(file, context);
}
