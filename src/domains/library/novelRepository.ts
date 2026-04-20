import type { Transaction } from 'dexie';

import type { CoverImageRecord, NovelRecord } from '@infra/db/library';

import { db } from '@infra/db';
import { AppErrorCode, createAppError } from '@shared/errors';

import { mapNovelRecordToView } from './mappers';
import type { NovelView } from './types';
import { clearNovelCoverResourcesForNovel } from './utils/novelCoverResourceCache';

export interface CreateImportedNovelInput {
  author: string;
  chapterCount: number;
  coverBlob: Blob | null;
  description: string;
  fileHash: string;
  fileType: string;
  originalEncoding: string;
  originalFilename: string;
  tags: string[];
  title: string;
  totalWords: number;
}

export interface ReplaceImportedNovelInput extends CreateImportedNovelInput {}

export interface DeleteNovelOptions {
  releaseCoverResources?: boolean;
  transaction?: Transaction;
}

function getNovelTable(transaction?: Transaction) {
  return transaction
    ? transaction.table<NovelRecord, number>('novels') as typeof db.novels
    : db.novels;
}

function getCoverImageTable(transaction?: Transaction) {
  return transaction
    ? transaction.table<CoverImageRecord, number>('coverImages') as typeof db.coverImages
    : db.coverImages;
}

async function createImportedNovelRecord(
  input: CreateImportedNovelInput,
  transaction?: Transaction,
): Promise<number> {
  const novelTable = getNovelTable(transaction);
  const coverImageTable = getCoverImageTable(transaction);
  const createdAt = new Date().toISOString();
  const novelId = await novelTable.add({
    title: input.title,
    author: input.author,
    description: input.description,
    tags: input.tags,
    fileType: input.fileType,
    fileHash: input.fileHash,
    coverPath: input.coverBlob ? 'has_cover' : '',
    originalFilename: input.originalFilename,
    originalEncoding: input.originalEncoding,
    totalWords: input.totalWords,
    chapterCount: input.chapterCount,
    createdAt,
  } satisfies Omit<NovelRecord, 'id'>);

  if (input.coverBlob) {
    await coverImageTable.add({
      novelId,
      blob: input.coverBlob,
    } satisfies Omit<CoverImageRecord, 'id'>);
  }

  return novelId;
}

async function replaceImportedNovelRecord(
  id: number,
  input: ReplaceImportedNovelInput,
  transaction?: Transaction,
): Promise<void> {
  const novelTable = getNovelTable(transaction);
  const coverImageTable = getCoverImageTable(transaction);
  const existingNovel = await novelTable.get(id);

  if (!existingNovel) {
    throw createAppError({
      code: AppErrorCode.NOVEL_NOT_FOUND,
      kind: 'not-found',
      source: 'library',
      userMessageKey: 'errors.NOVEL_NOT_FOUND',
      debugMessage: 'Novel not found',
      details: { novelId: id },
    });
  }

  await novelTable.put({
    ...existingNovel,
    title: input.title,
    author: input.author,
    description: input.description,
    tags: input.tags,
    fileType: input.fileType,
    fileHash: input.fileHash,
    coverPath: input.coverBlob ? 'has_cover' : '',
    originalFilename: input.originalFilename,
    originalEncoding: input.originalEncoding,
    totalWords: input.totalWords,
    chapterCount: input.chapterCount,
  });

  await coverImageTable.where('novelId').equals(id).delete();

  if (input.coverBlob) {
    await coverImageTable.add({
      novelId: id,
      blob: input.coverBlob,
    } satisfies Omit<CoverImageRecord, 'id'>);
  }
}

async function deleteNovelRecord(
  id: number,
  transaction?: Transaction,
): Promise<void> {
  const novelTable = getNovelTable(transaction);
  const coverImageTable = getCoverImageTable(transaction);

  await Promise.all([
    novelTable.delete(id),
    coverImageTable.where('novelId').equals(id).delete(),
  ]);
}

export const novelRepository = {
  async list(): Promise<NovelView[]> {
    return (await db.novels.orderBy('createdAt').reverse().toArray())
      .map((novel) => mapNovelRecordToView(novel));
  },

  async get(id: number): Promise<NovelView> {
    const novel = await db.novels.get(id);
    if (!novel) {
      throw createAppError({
        code: AppErrorCode.NOVEL_NOT_FOUND,
        kind: 'not-found',
        source: 'library',
        userMessageKey: 'errors.NOVEL_NOT_FOUND',
        debugMessage: 'Novel not found',
        details: { novelId: id },
      });
    }

    return mapNovelRecordToView(novel);
  },

  async getNovelTitle(id: number): Promise<string> {
    const novel = await db.novels.get(id);
    if (!novel) {
      throw createAppError({
        code: AppErrorCode.NOVEL_NOT_FOUND,
        kind: 'not-found',
        source: 'library',
        userMessageKey: 'errors.NOVEL_NOT_FOUND',
        debugMessage: 'Novel not found',
        details: { novelId: id },
      });
    }

    return novel.title;
  },

  async createImportedNovel(
    input: CreateImportedNovelInput,
    transaction?: Transaction,
  ): Promise<number> {
    if (transaction) {
      return createImportedNovelRecord(input, transaction);
    }

    let novelId = 0;
    await db.transaction('rw', [db.novels, db.coverImages], async () => {
      novelId = await createImportedNovelRecord(input);
    });
    return novelId;
  },

  async replaceImportedNovel(
    id: number,
    input: ReplaceImportedNovelInput,
    transaction?: Transaction,
  ): Promise<void> {
    if (transaction) {
      await replaceImportedNovelRecord(id, input, transaction);
      return;
    }

    await db.transaction('rw', [db.novels, db.coverImages], async () => {
      await replaceImportedNovelRecord(id, input);
    });
  },

  async delete(id: number, options: DeleteNovelOptions = {}): Promise<{ message: string }> {
    const {
      releaseCoverResources = options.transaction == null,
      transaction,
    } = options;

    if (transaction) {
      await deleteNovelRecord(id, transaction);
    } else {
      await db.transaction('rw', [db.novels, db.coverImages], async () => {
        await deleteNovelRecord(id);
      });
    }

    if (releaseCoverResources) {
      clearNovelCoverResourcesForNovel(id);
    }

    return { message: 'Novel deleted' };
  },
};
