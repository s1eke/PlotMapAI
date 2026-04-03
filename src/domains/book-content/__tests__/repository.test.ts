import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';

import { bookContentRepository } from '../repository';

describe('bookContentRepository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('replaces and reads persisted novel content assets', async () => {
    const imageBlob = new Blob(['image-data']);

    await bookContentRepository.replaceNovelContent(7, {
      chapters: [
        {
          chapterIndex: 0,
          title: 'Chapter 1',
          content: 'Alpha',
          wordCount: 5,
        },
        {
          chapterIndex: 1,
          title: 'Chapter 2',
          content: 'Beta',
          wordCount: 4,
        },
      ],
      images: [
        {
          imageKey: 'map',
          blob: imageBlob,
        },
      ],
      imageGalleryEntries: [
        {
          chapterIndex: 1,
          blockIndex: 4,
          imageKey: 'map',
          order: 0,
        },
      ],
    });

    await expect(bookContentRepository.countNovelChapters(7)).resolves.toBe(2);
    await expect(bookContentRepository.listNovelChapters(7)).resolves.toEqual([
      {
        chapterIndex: 0,
        title: 'Chapter 1',
        content: 'Alpha',
        wordCount: 5,
      },
      {
        chapterIndex: 1,
        title: 'Chapter 2',
        content: 'Beta',
        wordCount: 4,
      },
    ]);
    await expect(bookContentRepository.getNovelChapter(7, 1)).resolves.toEqual({
      chapterIndex: 1,
      title: 'Chapter 2',
      content: 'Beta',
      wordCount: 4,
    });
    await expect(bookContentRepository.getChapterImageBlob(7, 'map')).resolves.toBeTruthy();
    await expect(bookContentRepository.listNovelImageGalleryEntries(7)).resolves.toEqual([
      {
        chapterIndex: 1,
        blockIndex: 4,
        imageKey: 'map',
        order: 0,
      },
    ]);
  });

  it('deletes all owned content rows for a novel', async () => {
    await db.chapters.add({
      chapterIndex: 0,
      content: 'Alpha',
      novelId: 3,
      title: 'Chapter 1',
      wordCount: 5,
    });
    await db.chapterImages.add({
      novelId: 3,
      imageKey: 'map',
      blob: new Blob(['image-data']),
    });
    await db.novelImageGalleryEntries.add({
      novelId: 3,
      chapterIndex: 0,
      blockIndex: 1,
      imageKey: 'map',
      order: 0,
    });

    await bookContentRepository.deleteNovelContent(3);

    await expect(db.chapters.count()).resolves.toBe(0);
    await expect(db.chapterImages.count()).resolves.toBe(0);
    await expect(db.novelImageGalleryEntries.count()).resolves.toBe(0);
  });
});
