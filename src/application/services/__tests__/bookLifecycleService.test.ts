import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bookLifecycleService } from '@application/services/bookLifecycleService';
import {
  bookContentRepository,
  chapterRichContentRepository,
} from '@domains/book-content';
import { bookImportService } from '@domains/book-import';
import { novelRepository } from '@domains/library';
import { db } from '@infra/db';
import { CACHE_KEYS, storage } from '@infra/storage';

import { invalidateNovelTextProjectionCache } from '@application/read-models/novel-text-projection';

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

vi.mock('@application/read-models/novel-text-projection', () => ({
  invalidateNovelTextProjectionCache: vi.fn(),
}));

describe('bookLifecycleService', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    localStorage.clear();
    await db.delete();
    await db.open();
  });

  it('imports a parsed book by coordinating library and book-content owners', async () => {
    await db.readerRenderCache.add({
      novelId: 1,
      chapterIndex: 0,
      variantFamily: 'summary-shell',
      layoutKey: 'stale-layout',
      layoutSignature: {
        textWidth: 320,
        pageHeight: 720,
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        paragraphSpacing: 16,
      },
      contentHash: 'stale-hash',
      queryManifest: {
        blockCount: 1,
      },
      storageKind: 'manifest',
      tree: null,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    storage.cache.set(CACHE_KEYS.readerBootstrap(1), {
      version: 1,
      state: { chapterIndex: 0, mode: 'summary' },
    });

    vi.mocked(bookImportService.parseBookImport).mockResolvedValue({
      title: 'Imported Novel',
      author: 'Author',
      description: 'Description',
      tags: ['fiction'],
      fileType: 'epub',
      fileHash: 'import-hash',
      coverBlob: new Blob(['cover']),
      originalFilename: 'novel.epub',
      originalEncoding: 'utf-8',
      totalWords: 17,
      chapterCount: 1,
      chapters: [
        {
          chapterIndex: 0,
          title: 'Chapter 1',
          content: 'World map',
          wordCount: 9,
        },
      ],
      chapterRichContents: [
        {
          chapterIndex: 0,
          richBlocks: [
            {
              type: 'image',
              key: 'map',
              caption: [{
                type: 'text',
                text: 'World map',
              }],
            },
          ],
          plainText: 'World map',
          contentFormat: 'rich',
          contentVersion: 1,
          importFormatVersion: 1,
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
          blockIndex: 1,
          imageKey: 'map',
          order: 0,
        },
      ],
    });

    const novel = await bookLifecycleService.importBook(
      new File(['content'], 'novel.epub', { type: 'application/epub+zip' }),
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
    await expect(db.chapterRichContents.count()).resolves.toBe(1);
    await expect(db.chapterImages.count()).resolves.toBe(1);
    await expect(db.novelImageGalleryEntries.count()).resolves.toBe(1);
    await expect(
      db.chapterRichContents.where('[novelId+chapterIndex]').equals([1, 0]).first(),
    ).resolves.toMatchObject({
      contentRich: [
        {
          type: 'image',
          key: 'map',
          caption: [{
            type: 'text',
            text: 'World map',
          }],
        },
      ],
      contentPlain: 'World map',
      contentFormat: 'rich',
      contentVersion: 1,
      importFormatVersion: 1,
    });
    await expect(db.readerRenderCache.count()).resolves.toBe(0);
    expect(storage.cache.getJson(CACHE_KEYS.readerBootstrap(1))).toBeNull();
    expect(invalidateNovelTextProjectionCache).toHaveBeenCalledWith(1);
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
    expect(invalidateNovelTextProjectionCache).toHaveBeenCalledWith(novelId);
  });

  it('reparses a novel by overwriting content and clearing stale artifacts', async () => {
    const novelId = await novelRepository.createImportedNovel({
      title: 'Original Novel',
      author: 'Author',
      description: 'Old description',
      tags: ['old'],
      fileType: 'txt',
      fileHash: 'old-hash',
      originalFilename: 'original.txt',
      originalEncoding: 'utf-8',
      totalWords: 10,
      chapterCount: 1,
      coverBlob: new Blob(['cover']),
    });
    await bookContentRepository.replaceNovelContent(novelId, {
      chapters: [
        {
          chapterIndex: 0,
          title: 'Old Chapter',
          content: 'Old content',
          wordCount: 10,
        },
      ],
      images: [
        {
          imageKey: 'old-map',
          blob: new Blob(['old-image']),
        },
      ],
      imageGalleryEntries: [
        {
          chapterIndex: 0,
          blockIndex: 0,
          imageKey: 'old-map',
          order: 0,
        },
      ],
    });
    await chapterRichContentRepository.replaceNovelChapterRichContents(novelId, {
      chapters: [
        {
          chapterIndex: 0,
          richBlocks: [],
          plainText: 'Old content',
          contentFormat: 'plain',
          contentVersion: 1,
          importFormatVersion: 1,
        },
      ],
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
      chapterTitle: 'Old Chapter',
      summary: 'Old summary',
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
      layoutKey: 'stale-layout',
      layoutSignature: {
        textWidth: 320,
        pageHeight: 720,
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        paragraphSpacing: 16,
      },
      contentHash: 'stale-hash',
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

    vi.mocked(bookImportService.parseBookImport).mockResolvedValue({
      title: 'Reparsed Novel',
      author: 'New Author',
      description: 'New description',
      tags: ['new'],
      fileType: 'txt',
      fileHash: 'new-hash',
      coverBlob: null,
      originalFilename: 'reparsed.txt',
      originalEncoding: 'utf-8',
      totalWords: 34,
      chapterCount: 2,
      chapters: [
        {
          chapterIndex: 0,
          title: 'Chapter 1',
          content: 'Fresh content',
          wordCount: 12,
        },
        {
          chapterIndex: 1,
          title: 'Chapter 2',
          content: 'Second chapter',
          wordCount: 22,
        },
      ],
      chapterRichContents: [
        {
          chapterIndex: 0,
          richBlocks: [],
          plainText: 'Fresh content',
          contentFormat: 'plain',
          contentVersion: 2,
          importFormatVersion: 3,
        },
        {
          chapterIndex: 1,
          richBlocks: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'Second chapter' }],
            },
          ],
          plainText: 'Second chapter',
          contentFormat: 'rich',
          contentVersion: 4,
          importFormatVersion: 3,
        },
      ],
      images: [
        {
          imageKey: 'new-map',
          blob: new Blob(['new-image']),
        },
      ],
      imageGalleryEntries: [
        {
          chapterIndex: 1,
          blockIndex: 1,
          imageKey: 'new-map',
          order: 0,
        },
      ],
    });

    const novel = await bookLifecycleService.reparseBook(
      novelId,
      new File(['content'], 'reparsed.txt', { type: 'text/plain' }),
      [{ rule: '^Chapter', source: 'default' }],
    );

    expect(novel).toMatchObject({
      id: novelId,
      title: 'Reparsed Novel',
      author: 'New Author',
      chapterCount: 2,
      hasCover: false,
      originalFilename: 'reparsed.txt',
      totalWords: 34,
    });
    await expect(db.analysisJobs.count()).resolves.toBe(0);
    await expect(db.chapterAnalyses.count()).resolves.toBe(0);
    await expect(db.readingProgress.count()).resolves.toBe(0);
    await expect(db.readerRenderCache.count()).resolves.toBe(0);
    await expect(db.coverImages.count()).resolves.toBe(0);
    await expect(db.chapterImages.toArray()).resolves.toEqual([
      expect.objectContaining({
        imageKey: 'new-map',
        novelId,
      }),
    ]);
    await expect(db.novelImageGalleryEntries.toArray()).resolves.toEqual([
      expect.objectContaining({
        chapterIndex: 1,
        imageKey: 'new-map',
        novelId,
      }),
    ]);
    await expect(db.chapters.toArray()).resolves.toEqual([
      expect.objectContaining({
        chapterIndex: 0,
        content: 'Fresh content',
        novelId,
        title: 'Chapter 1',
      }),
      expect.objectContaining({
        chapterIndex: 1,
        content: 'Second chapter',
        novelId,
        title: 'Chapter 2',
      }),
    ]);
    await expect(
      db.chapterRichContents.where('[novelId+chapterIndex]').equals([novelId, 1]).first(),
    ).resolves.toMatchObject({
      contentFormat: 'rich',
      contentPlain: 'Second chapter',
      contentVersion: 4,
      importFormatVersion: 3,
    });
    expect(storage.cache.getJson(CACHE_KEYS.readerBootstrap(novelId))).toBeNull();
    expect(invalidateNovelTextProjectionCache).toHaveBeenCalledWith(novelId);
  });

  it('rejects reparsing when the selected file type does not match the existing book', async () => {
    const novelId = await novelRepository.createImportedNovel({
      title: 'Original Novel',
      author: 'Author',
      description: '',
      tags: [],
      fileType: 'txt',
      fileHash: 'old-hash',
      originalFilename: 'original.txt',
      originalEncoding: 'utf-8',
      totalWords: 10,
      chapterCount: 1,
      coverBlob: null,
    });

    await expect(
      bookLifecycleService.reparseBook(
        novelId,
        new File(['content'], 'reparsed.epub', { type: 'application/epub+zip' }),
        [{ rule: '^Chapter', source: 'default' }],
      ),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
      userMessageKey: 'reader.reparse.fileTypeMismatch',
    });
    expect(bookImportService.parseBookImport).not.toHaveBeenCalled();
    expect(invalidateNovelTextProjectionCache).not.toHaveBeenCalled();
  });

  it('keeps the previous novel data intact when reparsing fails mid-transaction', async () => {
    const novelId = await novelRepository.createImportedNovel({
      title: 'Original Novel',
      author: 'Author',
      description: 'Original description',
      tags: ['old'],
      fileType: 'txt',
      fileHash: 'old-hash',
      originalFilename: 'original.txt',
      originalEncoding: 'utf-8',
      totalWords: 10,
      chapterCount: 1,
      coverBlob: null,
    });
    await bookContentRepository.replaceNovelContent(novelId, {
      chapters: [
        {
          chapterIndex: 0,
          title: 'Old Chapter',
          content: 'Old content',
          wordCount: 10,
        },
      ],
      images: [],
      imageGalleryEntries: [],
    });
    await chapterRichContentRepository.replaceNovelChapterRichContents(novelId, {
      chapters: [
        {
          chapterIndex: 0,
          richBlocks: [],
          plainText: 'Old content',
          contentFormat: 'plain',
          contentVersion: 1,
          importFormatVersion: 1,
        },
      ],
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
    await db.readingProgress.add({
      novelId,
      chapterIndex: 0,
      mode: 'scroll',
      updatedAt: new Date().toISOString(),
    });

    vi.mocked(bookImportService.parseBookImport).mockResolvedValue({
      title: 'Broken Reparse',
      author: 'New Author',
      description: 'Should not persist',
      tags: ['new'],
      fileType: 'txt',
      fileHash: 'new-hash',
      coverBlob: null,
      originalFilename: 'reparsed.txt',
      originalEncoding: 'utf-8',
      totalWords: 20,
      chapterCount: 1,
      chapters: [
        {
          chapterIndex: 0,
          title: 'New Chapter',
          content: 'New content',
          wordCount: 20,
        },
      ],
      chapterRichContents: [
        {
          chapterIndex: 0,
          richBlocks: [],
          plainText: 'New content',
          contentFormat: 'plain',
          contentVersion: 2,
          importFormatVersion: 2,
        },
      ],
      images: [],
      imageGalleryEntries: [],
    });

    vi.spyOn(
      chapterRichContentRepository,
      'replaceNovelChapterRichContents',
    ).mockRejectedValueOnce(new Error('write failed'));

    await expect(
      bookLifecycleService.reparseBook(
        novelId,
        new File(['content'], 'reparsed.txt', { type: 'text/plain' }),
        [{ rule: '^Chapter', source: 'default' }],
      ),
    ).rejects.toThrow('write failed');

    await expect(novelRepository.get(novelId)).resolves.toMatchObject({
      title: 'Original Novel',
      author: 'Author',
      totalWords: 10,
      originalFilename: 'original.txt',
    });
    await expect(db.chapters.toArray()).resolves.toEqual([
      expect.objectContaining({
        chapterIndex: 0,
        content: 'Old content',
        novelId,
        title: 'Old Chapter',
      }),
    ]);
    await expect(
      db.chapterRichContents.where('[novelId+chapterIndex]').equals([novelId, 0]).first(),
    ).resolves.toMatchObject({
      contentPlain: 'Old content',
      contentVersion: 1,
      importFormatVersion: 1,
    });
    await expect(db.analysisJobs.count()).resolves.toBe(1);
    await expect(db.readingProgress.count()).resolves.toBe(1);
  });
});
