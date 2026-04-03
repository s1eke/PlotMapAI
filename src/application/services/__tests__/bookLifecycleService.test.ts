import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bookLifecycleService } from '@application/services/bookLifecycleService';
import { bookContentRepository } from '@domains/book-content';
import { bookImportService } from '@domains/book-import';
import { novelRepository } from '@domains/library';
import { db } from '@infra/db';
import { CACHE_KEYS, storage } from '@infra/storage';

vi.mock('@domains/book-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@domains/book-import')>();
  return {
    ...actual,
    bookImportService: {
      ...actual.bookImportService,
      parseBookImport: vi.fn(),
    },
  };
});

describe('bookLifecycleService', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    localStorage.clear();
    await db.delete();
    await db.open();
  });

  it('imports a parsed book by coordinating library and book-content owners', async () => {
    vi.mocked(bookImportService.parseBookImport).mockResolvedValue({
      title: 'Imported Novel',
      author: 'Author',
      description: 'Description',
      tags: ['fiction'],
      fileType: 'txt',
      fileHash: 'import-hash',
      coverBlob: new Blob(['cover']),
      originalFilename: 'novel.txt',
      originalEncoding: 'utf-8',
      totalWords: 9,
      chapterCount: 1,
      chapters: [
        {
          chapterIndex: 0,
          title: 'Chapter 1',
          content: 'Content 1',
          wordCount: 9,
        },
      ],
      images: [
        {
          imageKey: 'map',
          blob: new Blob(['image']),
        },
      ],
      imageGalleryEntries: [
        {
          chapterIndex: 0,
          blockIndex: 2,
          imageKey: 'map',
          order: 0,
        },
      ],
    });

    const novel = await bookLifecycleService.importBook(
      new File(['content'], 'novel.txt', { type: 'text/plain' }),
      [{ rule: '^Chapter', source: 'default' }],
    );

    expect(novel).toMatchObject({
      title: 'Imported Novel',
      chapterCount: 1,
      hasCover: true,
    });
    await expect(db.novels.count()).resolves.toBe(1);
    await expect(db.coverImages.count()).resolves.toBe(1);
    await expect(db.chapters.count()).resolves.toBe(1);
    await expect(db.chapterImages.count()).resolves.toBe(1);
    await expect(db.novelImageGalleryEntries.count()).resolves.toBe(1);
  });

  it('deletes all persisted artifacts for a novel through coordinated owner APIs', async () => {
    const novelId = await novelRepository.createImportedNovel({
      title: 'Delete Novel',
      author: 'Author',
      description: '',
      tags: [],
      fileType: 'txt',
      fileHash: 'delete-hash',
      originalFilename: 'delete.txt',
      originalEncoding: 'utf-8',
      totalWords: 10,
      chapterCount: 1,
      coverBlob: new Blob(['cover']),
    });
    await bookContentRepository.replaceNovelContent(novelId, {
      chapters: [
        {
          chapterIndex: 0,
          title: 'Chapter 1',
          content: 'Content',
          wordCount: 7,
        },
      ],
      images: [
        {
          imageKey: 'map',
          blob: new Blob(['image']),
        },
      ],
      imageGalleryEntries: [
        {
          chapterIndex: 0,
          blockIndex: 2,
          imageKey: 'map',
          order: 0,
        },
      ],
    });
    await db.chapterRichContents.add({
      novelId,
      chapterIndex: 0,
      contentRich: [
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Rich content',
          }],
        },
      ],
      contentPlain: 'Rich content',
      contentFormat: 'rich',
      contentVersion: 1,
      importFormatVersion: 1,
      updatedAt: new Date().toISOString(),
    });
    await db.analysisJobs.add({
      novelId,
      status: 'completed',
      totalChapters: 1,
      analyzedChapters: 1,
      totalChunks: 1,
      completedChunks: 1,
      currentChunkIndex: 0,
      pauseRequested: false,
      lastError: '',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      lastHeartbeat: null,
      updatedAt: new Date().toISOString(),
    });
    await db.chapterAnalyses.add({
      novelId,
      chapterIndex: 0,
      chapterTitle: 'Chapter 1',
      summary: 'Summary',
      keyPoints: [],
      characters: [],
      relationships: [],
      tags: [],
      chunkIndex: 0,
      updatedAt: new Date().toISOString(),
    });
    await db.readingProgress.add({
      novelId,
      chapterIndex: 0,
      mode: 'scroll',
      updatedAt: new Date().toISOString(),
    });
    await db.readerRenderCache.add({
      novelId,
      chapterIndex: 0,
      variantFamily: 'summary-shell',
      layoutKey: 'layout',
      layoutSignature: {
        textWidth: 320,
        pageHeight: 720,
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        paragraphSpacing: 16,
      },
      contentHash: 'hash',
      queryManifest: {
        blockCount: 1,
      },
      storageKind: 'manifest',
      tree: null,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    storage.cache.set(CACHE_KEYS.readerBootstrap(novelId), {
      version: 1,
      state: { chapterIndex: 0, mode: 'summary' },
    });

    expect(await db.chapterRichContents.count()).toBe(1);

    await bookLifecycleService.deleteNovel(novelId);

    expect(await db.novels.count()).toBe(0);
    expect(await db.coverImages.count()).toBe(0);
    expect(await db.chapters.count()).toBe(0);
    expect(await db.chapterRichContents.count()).toBe(0);
    expect(await db.chapterImages.count()).toBe(0);
    expect(await db.novelImageGalleryEntries.count()).toBe(0);
    expect(await db.analysisJobs.count()).toBe(0);
    expect(await db.chapterAnalyses.count()).toBe(0);
    expect(await db.readingProgress.count()).toBe(0);
    expect(await db.readerRenderCache.count()).toBe(0);
    expect(storage.cache.getJson(CACHE_KEYS.readerBootstrap(novelId))).toBeNull();
  });
});
