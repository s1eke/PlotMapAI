import type { ChapterDetectionRule } from '@shared/text-processing';
import type { BookImportProgress } from './progress';

import { parseEpub } from './epub/parser';
import { parseTxt } from './txtParser';

export interface ParsedBook {
  title: string;
  author: string;
  description: string;
  coverBlob: Blob | null;
  chapters: Array<{ title: string; content: string }>;
  rawText: string;
  encoding: string;
  totalWords: number;
  fileHash: string;
  tags: string[];
  images: Array<{ imageKey: string; blob: Blob }>;
}

export interface ParseContext {
  tocRules: ChapterDetectionRule[];
  signal?: AbortSignal;
  onProgress?: (progress: BookImportProgress) => void;
}

export interface BookParser {
  canHandle: (file: File) => boolean;
  parse: (file: File, context: ParseContext) => Promise<ParsedBook>;
}

const parsers: BookParser[] = [
  {
    canHandle: (file) => file.name.toLowerCase().endsWith('.epub'),
    parse: (file, context) => {
      if (!context.signal && !context.onProgress) {
        return parseEpub(file);
      }
      return parseEpub(file, {
        signal: context.signal,
        onProgress: context.onProgress,
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
  const parser = parsers.find((p) => p.canHandle(file));
  if (!parser) {
    const ext = file.name.toLowerCase().split('.').pop();
    throw new Error(`Unsupported file type: .${ext}`);
  }
  return parser.parse(file, context);
}
