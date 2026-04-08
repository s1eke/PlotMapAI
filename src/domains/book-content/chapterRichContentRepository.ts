import type { Transaction } from 'dexie';
import type {
  RichBlock,
  RichContentFormat,
} from '@shared/contracts';
import type { ChapterRichContentRecord } from '@infra/db/library';

import { db } from '@infra/db';

export interface StoredChapterRichContent {
  chapterIndex: number;
  richBlocks: RichBlock[];
  plainText: string;
  contentFormat: RichContentFormat;
  contentVersion: number;
  importFormatVersion: number;
  updatedAt: string;
}

export interface ReplaceNovelChapterRichContentsPayload {
  chapters: Array<{
    chapterIndex: number;
    richBlocks: RichBlock[];
    plainText: string;
    contentFormat: RichContentFormat;
    contentVersion: number;
    importFormatVersion: number;
  }>;
}

function getChapterRichContentTable(transaction?: Transaction) {
  return transaction
    ? transaction.table<ChapterRichContentRecord, number>(
      'chapterRichContents',
    ) as typeof db.chapterRichContents
    : db.chapterRichContents;
}

function mapChapterRichContentRecord(
  record: ChapterRichContentRecord,
): StoredChapterRichContent {
  return {
    chapterIndex: record.chapterIndex,
    richBlocks: record.contentRich,
    plainText: record.contentPlain,
    contentFormat: record.contentFormat,
    contentVersion: record.contentVersion,
    importFormatVersion: record.importFormatVersion,
    updatedAt: record.updatedAt,
  };
}

async function replaceNovelChapterRichContentRecords(
  novelId: number,
  payload: ReplaceNovelChapterRichContentsPayload,
  transaction?: Transaction,
): Promise<void> {
  const chapterRichContentTable = getChapterRichContentTable(transaction);

  await chapterRichContentTable.where('novelId').equals(novelId).delete();

  if (payload.chapters.length === 0) {
    return;
  }

  const updatedAt = new Date().toISOString();
  await chapterRichContentTable.bulkAdd(payload.chapters.map((chapter) => ({
    novelId,
    chapterIndex: chapter.chapterIndex,
    contentRich: chapter.richBlocks,
    contentPlain: chapter.plainText,
    contentFormat: chapter.contentFormat,
    contentVersion: chapter.contentVersion,
    importFormatVersion: chapter.importFormatVersion,
    updatedAt,
  } satisfies Omit<ChapterRichContentRecord, 'id'>)));
}

async function deleteNovelChapterRichContentRecords(
  novelId: number,
  transaction?: Transaction,
): Promise<void> {
  await getChapterRichContentTable(transaction).where('novelId').equals(novelId).delete();
}

export const chapterRichContentRepository = {
  async replaceNovelChapterRichContents(
    novelId: number,
    payload: ReplaceNovelChapterRichContentsPayload,
    transaction?: Transaction,
  ): Promise<void> {
    if (transaction) {
      await replaceNovelChapterRichContentRecords(novelId, payload, transaction);
      return;
    }

    await db.transaction('rw', [db.chapterRichContents], async () => {
      await replaceNovelChapterRichContentRecords(novelId, payload);
    });
  },

  async listNovelChapterRichContents(novelId: number): Promise<StoredChapterRichContent[]> {
    return (await db.chapterRichContents.where('novelId').equals(novelId).sortBy('chapterIndex'))
      .map((record) => mapChapterRichContentRecord(record));
  },

  async getNovelChapterRichContent(
    novelId: number,
    chapterIndex: number,
  ): Promise<StoredChapterRichContent | null> {
    const record = await db.chapterRichContents
      .where('[novelId+chapterIndex]')
      .equals([novelId, chapterIndex])
      .first();

    return record ? mapChapterRichContentRecord(record) : null;
  },

  async deleteNovelChapterRichContents(
    novelId: number,
    transaction?: Transaction,
  ): Promise<void> {
    if (transaction) {
      await deleteNovelChapterRichContentRecords(novelId, transaction);
      return;
    }

    await db.transaction('rw', [db.chapterRichContents], async () => {
      await deleteNovelChapterRichContentRecords(novelId);
    });
  },
};
