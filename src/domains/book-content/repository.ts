import type { Transaction } from 'dexie';

import type { ReaderImageGalleryEntry } from '@shared/contracts/reader';
import type { BookChapter } from '@shared/contracts';
import type {
  ChapterImageRecord,
  ChapterRecord,
  NovelImageGalleryEntryRecord,
} from '@infra/db/library';

import { db } from '@infra/db';
import { sortChapterImageGalleryEntries } from '@shared/text-processing';

export interface ReplaceNovelContentPayload {
  chapters: BookChapter[];
  imageGalleryEntries: Array<{
    blockIndex: number;
    chapterIndex: number;
    imageKey: string;
    order: number;
  }>;
  images: Array<{
    blob: Blob;
    imageKey: string;
  }>;
}

function getChapterTable(transaction?: Transaction) {
  return transaction
    ? transaction.table<ChapterRecord, number>('chapters') as typeof db.chapters
    : db.chapters;
}

function getChapterImageTable(transaction?: Transaction) {
  return transaction
    ? transaction.table<ChapterImageRecord, number>('chapterImages') as typeof db.chapterImages
    : db.chapterImages;
}

function getNovelImageGalleryEntryTable(transaction?: Transaction) {
  return transaction
    ? transaction.table<NovelImageGalleryEntryRecord, number>(
      'novelImageGalleryEntries',
    ) as typeof db.novelImageGalleryEntries
    : db.novelImageGalleryEntries;
}

async function replaceNovelContentRecords(
  novelId: number,
  payload: ReplaceNovelContentPayload,
  transaction?: Transaction,
): Promise<void> {
  const chapterTable = getChapterTable(transaction);
  const chapterImageTable = getChapterImageTable(transaction);
  const novelImageGalleryEntryTable = getNovelImageGalleryEntryTable(transaction);

  await Promise.all([
    chapterTable.where('novelId').equals(novelId).delete(),
    chapterImageTable.where('novelId').equals(novelId).delete(),
    novelImageGalleryEntryTable.where('novelId').equals(novelId).delete(),
  ]);

  if (payload.chapters.length > 0) {
    await chapterTable.bulkAdd(payload.chapters.map((chapter) => ({
      novelId,
      title: chapter.title,
      content: chapter.content,
      chapterIndex: chapter.chapterIndex,
      wordCount: chapter.wordCount,
    } satisfies Omit<ChapterRecord, 'id'>)));
  }

  if (payload.images.length > 0) {
    await chapterImageTable.bulkAdd(payload.images.map((image) => ({
      novelId,
      imageKey: image.imageKey,
      blob: image.blob,
    } satisfies Omit<ChapterImageRecord, 'id'>)));
  }

  if (payload.imageGalleryEntries.length > 0) {
    await novelImageGalleryEntryTable.bulkAdd(payload.imageGalleryEntries.map((entry) => ({
      novelId,
      chapterIndex: entry.chapterIndex,
      blockIndex: entry.blockIndex,
      imageKey: entry.imageKey,
      order: entry.order,
    } satisfies Omit<NovelImageGalleryEntryRecord, 'id'>)));
  }
}

async function deleteNovelContentRecords(
  novelId: number,
  transaction?: Transaction,
): Promise<void> {
  const chapterTable = getChapterTable(transaction);
  const chapterImageTable = getChapterImageTable(transaction);
  const novelImageGalleryEntryTable = getNovelImageGalleryEntryTable(transaction);

  await Promise.all([
    chapterTable.where('novelId').equals(novelId).delete(),
    chapterImageTable.where('novelId').equals(novelId).delete(),
    novelImageGalleryEntryTable.where('novelId').equals(novelId).delete(),
  ]);
}

export const bookContentRepository = {
  async replaceNovelContent(
    novelId: number,
    payload: ReplaceNovelContentPayload,
    transaction?: Transaction,
  ): Promise<void> {
    if (transaction) {
      await replaceNovelContentRecords(novelId, payload, transaction);
      return;
    }

    await db.transaction(
      'rw',
      [
        db.chapters,
        db.chapterImages,
        db.novelImageGalleryEntries,
      ],
      async () => {
        await replaceNovelContentRecords(novelId, payload);
      },
    );
  },

  async deleteNovelContent(novelId: number, transaction?: Transaction): Promise<void> {
    if (transaction) {
      await deleteNovelContentRecords(novelId, transaction);
      return;
    }

    await db.transaction(
      'rw',
      [
        db.chapters,
        db.chapterImages,
        db.novelImageGalleryEntries,
      ],
      async () => {
        await deleteNovelContentRecords(novelId);
      },
    );
  },

  async listNovelChapters(novelId: number): Promise<BookChapter[]> {
    return (await db.chapters.where('novelId').equals(novelId).sortBy('chapterIndex'))
      .map((chapter) => ({
        chapterIndex: chapter.chapterIndex,
        title: chapter.title,
        content: chapter.content,
        wordCount: chapter.wordCount,
      }));
  },

  async getNovelChapter(novelId: number, chapterIndex: number): Promise<BookChapter | null> {
    const chapter = await db.chapters
      .where('[novelId+chapterIndex]')
      .equals([novelId, chapterIndex])
      .first();

    if (!chapter) {
      return null;
    }

    return {
      chapterIndex: chapter.chapterIndex,
      title: chapter.title,
      content: chapter.content,
      wordCount: chapter.wordCount,
    };
  },

  countNovelChapters(novelId: number): Promise<number> {
    return db.chapters.where('novelId').equals(novelId).count();
  },

  async getChapterImageBlob(novelId: number, imageKey: string): Promise<Blob | null> {
    const image = await db.chapterImages
      .where('[novelId+imageKey]')
      .equals([novelId, imageKey])
      .first();

    return image?.blob ?? null;
  },

  async listNovelImageGalleryEntries(novelId: number): Promise<ReaderImageGalleryEntry[]> {
    const entries = await db.novelImageGalleryEntries
      .where('novelId')
      .equals(novelId)
      .toArray();

    return sortChapterImageGalleryEntries(entries.map((entry) => ({
      blockIndex: entry.blockIndex,
      chapterIndex: entry.chapterIndex,
      imageKey: entry.imageKey,
      order: entry.order,
    })));
  },
};
