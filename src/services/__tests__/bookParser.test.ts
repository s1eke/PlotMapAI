import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockParseTxt, mockParseEpub } = vi.hoisted(() => ({
  mockParseTxt: vi.fn().mockResolvedValue({
    title: 'MockTxt',
    author: '',
    description: '',
    coverBlob: null,
    chapters: [{ title: 'Ch1', content: 'content' }],
    rawText: 'content',
    encoding: 'utf-8',
    totalWords: 7,
    fileHash: 'hash1',
    tags: [],
    images: [],
  }),
  mockParseEpub: vi.fn().mockResolvedValue({
    title: 'MockEpub',
    author: 'Author',
    description: 'Desc',
    coverBlob: null,
    chapters: [{ title: 'Ch1', content: 'epub content' }],
    rawText: '',
    encoding: 'utf-8',
    totalWords: 11,
    fileHash: 'hash2',
    tags: ['fiction'],
    images: [],
  }),
}));

vi.mock('../txtParser', () => ({ parseTxt: mockParseTxt }));
vi.mock('../epub/parser', () => ({ parseEpub: mockParseEpub }));

import { parseBook, registerParser } from '../bookParser';
import type { BookParser, ParsedBook } from '../bookParser';

describe('parseBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to parseTxt for .txt files', async () => {
    const file = new File(['hello'], 'book.txt', { type: 'text/plain' });
    const result = await parseBook(file, []);
    expect(result.title).toBe('MockTxt');
    expect(result.chapters.length).toBe(1);
    expect(mockParseTxt).toHaveBeenCalledWith(file, []);
  });

  it('delegates to parseEpub for .epub files', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' });
    const result = await parseBook(file, []);
    expect(result.title).toBe('MockEpub');
    expect(result.author).toBe('Author');
    expect(mockParseEpub).toHaveBeenCalledWith(file);
  });

  it('throws for unsupported file types', async () => {
    const file = new File(['data'], 'book.pdf', { type: 'application/pdf' });
    await expect(parseBook(file, [])).rejects.toThrow('Unsupported file type');
  });

  it('passes tocRules context to parseTxt', async () => {
    const rules = [{ rule: '^第\\d+章' }];
    const file = new File(['content'], 'book.txt', { type: 'text/plain' });
    await parseBook(file, rules);
    expect(mockParseTxt).toHaveBeenCalledWith(file, rules);
  });
});

describe('registerParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const customResult: ParsedBook = {
    title: 'Custom',
    author: '',
    description: '',
    coverBlob: null,
    chapters: [{ title: 'C1', content: 'custom' }],
    rawText: '',
    encoding: 'utf-8',
    totalWords: 6,
    fileHash: 'hash3',
    tags: [],
    images: [],
  };

  it('allows custom parsers to handle new file types', async () => {
    const customParser: BookParser = {
      canHandle: (file) => file.name.toLowerCase().endsWith('.mobi'),
      parse: vi.fn().mockResolvedValue(customResult),
    };
    registerParser(customParser);
    const file = new File(['mobi'], 'book.mobi', { type: 'application/octet-stream' });
    const result = await parseBook(file, []);
    expect(result.title).toBe('Custom');
    expect(customParser.parse).toHaveBeenCalledWith(file, { tocRules: [] });
  });

  it('custom parsers take priority over built-in ones', async () => {
    const override: BookParser = {
      canHandle: (file) => file.name.toLowerCase().endsWith('.txt'),
      parse: vi.fn().mockResolvedValue({ ...customResult, title: 'Overridden' }),
    };
    registerParser(override);
    const file = new File(['data'], 'override.txt', { type: 'text/plain' });
    const result = await parseBook(file, []);
    expect(result.title).toBe('Overridden');
    expect(override.parse).toHaveBeenCalled();
    expect(mockParseTxt).not.toHaveBeenCalled();
  });
});
