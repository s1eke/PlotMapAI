import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@infra/db';

import { bookImportService } from '../bookImportService';
import { parseBook } from '../services/bookParser';

vi.mock('../services/bookParser', () => ({
  parseBook: vi.fn(),
}));

const tocRules = [{ rule: '^Chapter', source: 'default' as const }];

describe('bookImportService', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.clearAllMocks();
    vi.mocked(parseBook).mockResolvedValue({
      author: 'Parsed Author',
      chapters: [
        { content: 'Content 1', title: 'Ch1' },
        { content: 'Content 2', title: 'Ch2' },
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

  it('stores imported novels and chapters and returns the created novel id', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });

    const result = await bookImportService.importBook(file, tocRules);

    expect(result).toEqual({ novelId: 1 });
    await expect(db.novels.get(result.novelId)).resolves.toMatchObject({
      title: 'Parsed Novel',
    });
    await expect(db.chapters.where('novelId').equals(result.novelId).count()).resolves.toBe(2);
  });

  it('builds and stores the full-book image index during import', async () => {
    vi.mocked(parseBook).mockResolvedValueOnce({
      author: 'Parsed Author',
      chapters: [
        {
          content: 'Ch1\n[IMG:cover]\nBody\n[IMG:map]',
          title: 'Ch1',
        },
        {
          content: 'Body\n[IMG:diagram]',
          title: 'Ch2',
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

    const result = await bookImportService.importBook(file, tocRules);
    const storedEntries = (await db.novelImageGalleryEntries
      .where('novelId')
      .equals(result.novelId)
      .toArray())
      .sort((left, right) => (
        left.chapterIndex - right.chapterIndex
        || left.order - right.order
        || left.blockIndex - right.blockIndex
      ));

    expect(storedEntries.map((entry) => ({
      blockIndex: entry.blockIndex,
      chapterIndex: entry.chapterIndex,
      imageKey: entry.imageKey,
      order: entry.order,
    }))).toEqual([
      { blockIndex: 1, chapterIndex: 0, imageKey: 'cover', order: 0 },
      { blockIndex: 3, chapterIndex: 0, imageKey: 'map', order: 1 },
      { blockIndex: 2, chapterIndex: 1, imageKey: 'diagram', order: 0 },
    ]);
  });

  it('stores chapter content without a duplicated leading title line', async () => {
    vi.mocked(parseBook).mockResolvedValueOnce({
      author: 'Parsed Author',
      chapters: [
        { content: 'Ch1\n\nBody 1', title: 'Ch1' },
        { content: 'Body 2', title: 'Ch2' },
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

    const result = await bookImportService.importBook(file, tocRules);
    const storedChapters = await db.chapters
      .where('novelId')
      .equals(result.novelId)
      .sortBy('chapterIndex');

    expect(storedChapters.map((chapter) => ({
      content: chapter.content,
      title: chapter.title,
      wordCount: chapter.wordCount,
    }))).toEqual([
      { content: 'Body 1', title: 'Ch1', wordCount: 6 },
      { content: 'Body 2', title: 'Ch2', wordCount: 6 },
    ]);
  });

  it('rejects unsupported file types', async () => {
    const file = new File(['data'], 'test.pdf', { type: 'application/pdf' });

    await expect(bookImportService.importBook(file, tocRules)).rejects.toThrow(
      'Only .txt and .epub files are supported',
    );
  });

  it('passes application-selected toc rules to parseBook unchanged', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });

    await bookImportService.importBook(file, [
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
