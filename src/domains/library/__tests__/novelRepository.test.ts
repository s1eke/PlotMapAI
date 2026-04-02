import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@infra/db';

import { novelRepository } from '../novelRepository';

describe('novelRepository', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.delete();
    await db.open();
  });

  it('lists novels sorted by createdAt descending', async () => {
    await db.novels.add({
      author: '',
      coverPath: '',
      createdAt: '2024-01-01T00:00:00Z',
      description: '',
      fileHash: 'h1',
      fileType: 'txt',
      originalEncoding: 'utf-8',
      originalFilename: 'f.txt',
      tags: [],
      title: 'First',
      totalWords: 100,
    });
    await db.novels.add({
      author: '',
      coverPath: '',
      createdAt: '2024-02-01T00:00:00Z',
      description: '',
      fileHash: 'h2',
      fileType: 'txt',
      originalEncoding: 'utf-8',
      originalFilename: 's.txt',
      tags: [],
      title: 'Second',
      totalWords: 200,
    });

    const result = await novelRepository.list();

    expect(result.map((novel) => novel.title)).toEqual(['Second', 'First']);
  });

  it('gets a novel by id and calculates chapter count', async () => {
    const id = await db.novels.add({
      author: 'Auth',
      coverPath: '',
      createdAt: new Date().toISOString(),
      description: 'Desc',
      fileHash: 'hash',
      fileType: 'txt',
      originalEncoding: 'utf-8',
      originalFilename: 'g.txt',
      tags: ['tag1'],
      title: 'Get Test',
      totalWords: 500,
    });
    await db.chapters.bulkAdd([
      {
        chapterIndex: 0,
        content: 'c1',
        novelId: id,
        title: 'Chapter 1',
        wordCount: 2,
      },
      {
        chapterIndex: 1,
        content: 'c2',
        novelId: id,
        title: 'Chapter 2',
        wordCount: 2,
      },
    ]);

    const novel = await novelRepository.get(id);

    expect(novel).toMatchObject({
      chapterCount: 2,
      tags: ['tag1'],
      title: 'Get Test',
    });
  });

  it('deletes only the library aggregate and leaves reader and analysis state alone', async () => {
    const id = await db.novels.add({
      author: '',
      coverPath: 'has_cover',
      createdAt: new Date().toISOString(),
      description: '',
      fileHash: 'dh',
      fileType: 'txt',
      originalEncoding: 'utf-8',
      originalFilename: 'd.txt',
      tags: [],
      title: 'Delete Me',
      totalWords: 100,
    });
    await db.chapters.add({
      chapterIndex: 0,
      content: 'chapter',
      novelId: id,
      title: 'Ch',
      wordCount: 7,
    });
    await db.coverImages.add({
      blob: new Blob(['cover']),
      novelId: id,
    });
    await db.chapterImages.add({
      blob: new Blob(['image']),
      imageKey: 'hero',
      novelId: id,
    });
    await db.novelImageGalleryEntries.add({
      blockIndex: 1,
      chapterIndex: 0,
      imageKey: 'hero',
      novelId: id,
      order: 0,
    });
    await db.readingProgress.add({
      chapterIndex: 3,
      mode: 'scroll',
      novelId: id,
      updatedAt: new Date().toISOString(),
    });
    await db.readerRenderCache.add({
      chapterIndex: 0,
      contentHash: 'content-hash',
      expiresAt: '2026-04-16T00:00:00.000Z',
      layoutKey: 'summary-shell:base',
      layoutSignature: {
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        pageHeight: 720,
        paragraphSpacing: 16,
        textWidth: 360,
      },
      novelId: id,
      queryManifest: {
        blockCount: 2,
        lineCount: 4,
        totalHeight: 120,
      },
      storageKind: 'manifest',
      tree: null,
      updatedAt: '2026-04-02T00:00:00.000Z',
      variantFamily: 'summary-shell',
    });

    await novelRepository.delete(id);

    await expect(db.novels.count()).resolves.toBe(0);
    await expect(db.chapters.count()).resolves.toBe(0);
    await expect(db.coverImages.count()).resolves.toBe(0);
    await expect(db.chapterImages.count()).resolves.toBe(0);
    await expect(db.novelImageGalleryEntries.count()).resolves.toBe(0);
    await expect(db.readingProgress.count()).resolves.toBe(1);
    await expect(db.readerRenderCache.count()).resolves.toBe(1);
  });

  it('returns a blob url when a cover exists', async () => {
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:cover-url');
    const id = await db.novels.add({
      author: '',
      coverPath: 'has_cover',
      createdAt: new Date().toISOString(),
      description: '',
      fileHash: 'cover-hash',
      fileType: 'txt',
      originalEncoding: 'utf-8',
      originalFilename: 'cover.txt',
      tags: [],
      title: 'Cover Novel',
      totalWords: 100,
    });
    await db.coverImages.add({
      blob: new Blob(['cover']),
      novelId: id,
    });

    const coverUrl = await novelRepository.getCoverUrl(id);

    expect(coverUrl).toBe('blob:cover-url');
    createObjectUrlSpy.mockRestore();
  });
});
