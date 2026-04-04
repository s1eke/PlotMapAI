import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bookImportService } from '../bookImportService';
import { parseBook } from '../services/bookParser';

vi.mock('../services/bookParser', () => ({
  parseBook: vi.fn(),
}));

const tocRules = [{ rule: '^Chapter', source: 'default' as const }];

describe('bookImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(parseBook).mockResolvedValue({
      author: 'Parsed Author',
      chapters: [
        { content: 'Content 1', title: 'Ch1', contentFormat: 'plain', richBlocks: [] },
        { content: 'Content 2', title: 'Ch2', contentFormat: 'plain', richBlocks: [] },
      ],
      coverBlob: null,
      description: 'Parsed desc',
      encoding: 'utf-8',
      fileHash: 'parsedhash',
      images: [],
      rawText: 'Content 1\nContent 2',
      tags: ['fiction'],
      title: 'Parsed Novel',
      totalWords: 20,
    });
  });

  it('returns prepared book content and metadata for application persistence', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });

    const result = await bookImportService.parseBookImport(file, tocRules);

    expect(result).toMatchObject({
      title: 'Parsed Novel',
      author: 'Parsed Author',
      chapterCount: 2,
      fileHash: 'parsedhash',
      fileType: 'txt',
      originalFilename: 'test.txt',
      originalEncoding: 'utf-8',
      totalWords: 18,
    });
    expect(result.chapters).toEqual([
      {
        chapterIndex: 0,
        title: 'Ch1',
        content: 'Content 1',
        wordCount: 9,
      },
      {
        chapterIndex: 1,
        title: 'Ch2',
        content: 'Content 2',
        wordCount: 9,
      },
    ]);
  });

  it('builds the full-book image index during parsing', async () => {
    vi.mocked(parseBook).mockResolvedValueOnce({
      author: 'Parsed Author',
      chapters: [
        {
          content: 'Ch1\n[IMG:cover]\nBody\n[IMG:map]',
          title: 'Ch1',
          contentFormat: 'plain',
          richBlocks: [],
        },
        {
          content: 'Body\n[IMG:diagram]',
          title: 'Ch2',
          contentFormat: 'plain',
          richBlocks: [],
        },
      ],
      coverBlob: null,
      description: 'Parsed desc',
      encoding: 'utf-8',
      fileHash: 'imagehash',
      images: [],
      rawText: 'raw',
      tags: ['fiction'],
      title: 'Illustrated Novel',
      totalWords: 20,
    });
    const file = new File(['content'], 'illustrated.txt', { type: 'text/plain' });

    const result = await bookImportService.parseBookImport(file, tocRules);

    expect(result.imageGalleryEntries).toEqual([
      { blockIndex: 1, chapterIndex: 0, imageKey: 'cover', order: 0 },
      { blockIndex: 3, chapterIndex: 0, imageKey: 'map', order: 1 },
      { blockIndex: 2, chapterIndex: 1, imageKey: 'diagram', order: 0 },
    ]);
  });

  it('normalizes chapter content without a duplicated leading title line', async () => {
    vi.mocked(parseBook).mockResolvedValueOnce({
      author: 'Parsed Author',
      chapters: [
        { content: 'Ch1\n\nBody 1', title: 'Ch1', contentFormat: 'plain', richBlocks: [] },
        { content: 'Body 2', title: 'Ch2', contentFormat: 'plain', richBlocks: [] },
      ],
      coverBlob: null,
      description: 'Parsed desc',
      encoding: 'utf-8',
      fileHash: 'parsedhash-2',
      images: [],
      rawText: 'raw',
      tags: ['fiction'],
      title: 'Parsed Novel',
      totalWords: 20,
    });
    const file = new File(['content'], 'normalized.txt', { type: 'text/plain' });

    const result = await bookImportService.parseBookImport(file, tocRules);

    expect(result.chapters).toEqual([
      { chapterIndex: 0, content: 'Body 1', title: 'Ch1', wordCount: 6 },
      { chapterIndex: 1, content: 'Body 2', title: 'Ch2', wordCount: 6 },
    ]);
  });

  it('rejects unsupported file types', async () => {
    const file = new File(['data'], 'test.pdf', { type: 'application/pdf' });

    await expect(bookImportService.parseBookImport(file, tocRules)).rejects.toThrow(
      'Only .txt and .epub files are supported',
    );
  });

  it('passes application-selected toc rules to parseBook unchanged', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });

    await bookImportService.parseBookImport(file, [
      { rule: '^第\\d+章', source: 'default' },
      { rule: '^\\d+[.、:：]\\s*.+$', source: 'custom' },
    ]);

    expect(parseBook).toHaveBeenCalledWith(
      file,
      [
        { rule: '^第\\d+章', source: 'default' },
        { rule: '^\\d+[.、:：]\\s*.+$', source: 'custom' },
      ],
      expect.any(Object),
    );
  });
});
