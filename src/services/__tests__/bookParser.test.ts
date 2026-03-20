import { describe, it, expect, vi } from 'vitest';
import { parseBook } from '../bookParser';

vi.mock('../txtParser', () => ({
  parseTxt: vi.fn().mockResolvedValue({
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
}));

vi.mock('../epubParser', () => ({
  parseEpub: vi.fn().mockResolvedValue({
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

describe('parseBook', () => {
  it('delegates to parseTxt for .txt files', async () => {
    const file = new File(['hello'], 'book.txt', { type: 'text/plain' });
    const result = await parseBook(file, []);
    expect(result.title).toBe('MockTxt');
    expect(result.chapters.length).toBe(1);
  });

  it('delegates to parseEpub for .epub files', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' });
    const result = await parseBook(file, []);
    expect(result.title).toBe('MockEpub');
    expect(result.author).toBe('Author');
  });

  it('throws for unsupported file types', async () => {
    const file = new File(['data'], 'book.pdf', { type: 'application/pdf' });
    await expect(parseBook(file, [])).rejects.toThrow('Unsupported file type');
  });
});
