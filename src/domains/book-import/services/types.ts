import type {
  RichBlock,
  RichContentFormat,
} from '@shared/contracts';
import type { ChapterDetectionRule, PurifyRule } from '@shared/text-processing';
import type { BookImportProgress } from './progress';

export interface ParsedChapter {
  title: string;
  content: string;
  contentFormat: RichContentFormat;
  richBlocks: RichBlock[];
}

export interface ParsedBook {
  title: string;
  author: string;
  description: string;
  coverBlob: Blob | null;
  chapters: ParsedChapter[];
  rawText: string;
  encoding: string;
  totalWords: number;
  fileHash: string;
  tags: string[];
  images: Array<{ imageKey: string; blob: Blob }>;
}

export interface ParseContext {
  tocRules: ChapterDetectionRule[];
  purificationRules?: PurifyRule[];
  signal?: AbortSignal;
  onProgress?: (progress: BookImportProgress) => void;
}

export interface BookParser {
  canHandle: (file: File) => boolean;
  parse: (file: File, context: ParseContext) => Promise<ParsedBook>;
}
