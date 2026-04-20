import type { Transaction } from 'dexie';

import { db } from '@infra/db';
import {
  clearReaderBootstrapSnapshot,
  writeReaderBootstrapSnapshot,
} from '@infra/storage/readerStateCache';

import type {
  PersistedReadingProgress,
  StoredReaderState,
} from '@shared/contracts/reader';

import { toReadingProgressRecord, toStoredReaderState } from './mapper';
export type { ReadingProgress } from './mapper';
export { toReadingProgress } from './mapper';

export async function readPersistedReadingProgress(
  novelId: number,
): Promise<PersistedReadingProgress | null> {
  const progress = await db.readingProgress.where('novelId').equals(novelId).first();
  if (!progress) {
    return null;
  }

  const storedState = toStoredReaderState(progress);
  if (!storedState) {
    await db.readingProgress.where('novelId').equals(novelId).delete();
    return null;
  }

  return {
    revision: typeof progress.revision === 'number' ? progress.revision : 0,
    state: storedState,
    updatedAt: progress.updatedAt,
  };
}

export async function readReadingProgress(
  novelId: number,
): Promise<StoredReaderState | null> {
  const progress = await readPersistedReadingProgress(novelId);
  return progress?.state ?? null;
}

export async function replaceReadingProgress(
  novelId: number,
  state: StoredReaderState,
): Promise<PersistedReadingProgress | null> {
  const existing = await db.readingProgress.where('novelId').equals(novelId).first();
  const now = new Date().toISOString();
  const nextRevision = (typeof existing?.revision === 'number' ? existing.revision : 0) + 1;
  const progressRecord = toReadingProgressRecord({
    existingId: existing?.id,
    novelId,
    revision: nextRevision,
    state,
    updatedAt: now,
  });
  if (!progressRecord) {
    if (existing?.id) {
      await db.readingProgress.delete(existing.id);
    }
    clearReaderBootstrapSnapshot(novelId);
    return null;
  }

  const { id: _unusedId, ...record } = progressRecord;

  await db.readingProgress.put(existing ? progressRecord : record);
  const persistedProgress: PersistedReadingProgress = {
    revision: progressRecord.revision ?? nextRevision,
    state: toStoredReaderState(progressRecord) ?? state,
    updatedAt: progressRecord.updatedAt,
  };
  writeReaderBootstrapSnapshot(novelId, persistedProgress);
  return persistedProgress;
}

export async function deleteReadingProgress(
  novelId: number,
  transaction?: Transaction,
): Promise<void> {
  const readingProgressTable = transaction
    ? transaction.table('readingProgress')
    : db.readingProgress;

  await readingProgressTable.where('novelId').equals(novelId).delete();
}
