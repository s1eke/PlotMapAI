import { parseTxt } from './txtParser';
import { parseEpub } from './epub/parser';

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
  tocRules: Array<{ rule: string }>;
}

export interface BookParser {
  canHandle(file: File): boolean;
  parse(file: File, context: ParseContext): Promise<ParsedBook>;
}

const parsers: BookParser[] = [
  {
    canHandle: (file) => file.name.toLowerCase().endsWith('.epub'),
    parse: (file) => parseEpub(file),
  },
  {
    canHandle: (file) => file.name.toLowerCase().endsWith('.txt'),
    parse: (file, ctx) => parseTxt(file, ctx.tocRules),
  },
];

export function registerParser(parser: BookParser): void {
  parsers.unshift(parser);
}

export async function parseBook(
  file: File,
  tocRules: Array<{ rule: string }>,
): Promise<ParsedBook> {
  const context: ParseContext = { tocRules };
  const parser = parsers.find(p => p.canHandle(file));
  if (!parser) {
    const ext = file.name.toLowerCase().split('.').pop();
    throw new Error(`Unsupported file type: .${ext}`);
  }
  return parser.parse(file, context);
}
