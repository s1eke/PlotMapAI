import { describe, it, expect, beforeEach, vi } from 'vitest';
import { libraryApi } from '@domains/library';
import { db } from '@infra/db';
import { CACHE_KEYS } from '@infra/storage';
import { parseBook } from '../../services/bookParser';
import { bookImportApi } from '../bookImportApi';

vi.mock('../../services/bookParser', () => ({
  parseBook: vi.fn().mockResolvedValue({
    title: 'Parsed Novel',
    author: 'Parsed Author',
    description: 'Parsed desc',
    coverBlob: null,
    chapters: [{ title: 'Ch1', content: 'Content 1' }, { title: 'Ch2', content: 'Content 2' }],
    rawText: 'Content 1\nContent 2',
    encoding: 'utf-8',
    totalWords: 20,
    fileHash: 'parsedhash',
    tags: ['fiction'],
    images: [],
  }),
}));

vi.mock('@domains/settings', () => ({
  ensureDefaultTocRules: vi.fn().mockResolvedValue(undefined),
}));

describe('bookImportApi', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  it('upload creates novel and chapters', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    const novel = await bookImportApi.importBook(file);
    expect(novel.title).toBe('Parsed Novel');
    expect(novel.chapterCount).toBe(2);
  });

  it('builds and stores the full-book image index during import', async () => {
    vi.mocked(parseBook).mockResolvedValueOnce({
      title: 'Illustrated Novel',
      author: 'Parsed Author',
      description: 'Parsed desc',
      coverBlob: null,
      chapters: [
        {
          title: 'Ch1',
          content: 'Ch1\n[IMG:cover]\nBody\n[IMG:map]',
        },
        {
          title: 'Ch2',
          content: 'Body\n[IMG:diagram]',
        },
      ],
      rawText: 'raw',
      encoding: 'utf-8',
      totalWords: 20,
      fileHash: 'imagehash',
      tags: ['fiction'],
      images: [],
    });

    const file = new File(['content'], 'illustrated.txt', { type: 'text/plain' });
    const novel = await bookImportApi.importBook(file);
    const storedEntries = (await db.novelImageGalleryEntries
      .where('novelId')
      .equals(novel.id)
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

  it('stores chapter.content without a duplicated leading title line', async () => {
    vi.mocked(parseBook).mockResolvedValueOnce({
      title: 'Parsed Novel',
      author: 'Parsed Author',
      description: 'Parsed desc',
      coverBlob: null,
      chapters: [
        { title: 'Ch1', content: 'Ch1\n\nBody 1' },
        { title: 'Ch2', content: 'Body 2' },
      ],
      rawText: 'raw',
      encoding: 'utf-8',
      totalWords: 20,
      fileHash: 'parsedhash-2',
      tags: ['fiction'],
      images: [],
    });

    const file = new File(['content'], 'normalized.txt', { type: 'text/plain' });
    const novel = await bookImportApi.importBook(file);
    const storedChapters = await db.chapters.where('novelId').equals(novel.id).sortBy('chapterIndex');

    expect(storedChapters.map((chapter) => ({
      content: chapter.content,
      title: chapter.title,
      wordCount: chapter.wordCount,
    }))).toEqual([
      { title: 'Ch1', content: 'Body 1', wordCount: 6 },
      { title: 'Ch2', content: 'Body 2', wordCount: 6 },
    ]);
  });

  it('upload throws for unsupported file type', async () => {
    const file = new File(['data'], 'test.pdf', { type: 'application/pdf' });
    await expect(bookImportApi.importBook(file)).rejects.toThrow('Only .txt and .epub files are supported');
  });

  it('maps enabled toc rules to parseBook with default/custom sources preserved', async () => {
    await db.tocRules.bulkAdd([
      {
        name: 'Default Rule',
        rule: '^第\\d+章',
        example: '第1章 开始',
        serialNumber: 1,
        enable: true,
        isDefault: true,
        createdAt: new Date().toISOString(),
      },
      {
        name: 'Custom Rule',
        rule: '^\\d+[.、:：]\\s*.+$',
        example: '1. 开始',
        serialNumber: 2,
        enable: true,
        isDefault: false,
        createdAt: new Date().toISOString(),
      },
      {
        name: 'Disabled Rule',
        rule: '^Chapter\\s+\\d+',
        example: 'Chapter 1',
        serialNumber: 3,
        enable: false,
        isDefault: false,
        createdAt: new Date().toISOString(),
      },
    ]);

    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    await bookImportApi.importBook(file);

    expect(vi.mocked(parseBook)).toHaveBeenCalledWith(
      file,
      [
        { rule: '^第\\d+章', source: 'default' },
        { rule: '^\\d+[.、:：]\\s*.+$', source: 'custom' },
      ],
      expect.any(Object),
    );
  });

  it('does not reuse a deleted novel id and clears stale reader cache for the new id', async () => {
    const firstFile = new File(['content'], 'first.txt', { type: 'text/plain' });
    const firstNovel = await bookImportApi.importBook(firstFile);
    await libraryApi.delete(firstNovel.id);

    localStorage.setItem(CACHE_KEYS.readerState(firstNovel.id + 1), JSON.stringify({
      chapterIndex: 7,
      chapterProgress: 0.8,
      viewMode: 'original',
    }));

    const secondFile = new File(['content'], 'second.txt', { type: 'text/plain' });
    const secondNovel = await bookImportApi.importBook(secondFile);

    expect(secondNovel.id).toBe(firstNovel.id + 1);
    expect(localStorage.getItem(CACHE_KEYS.readerState(secondNovel.id))).toBeNull();
  });
});
