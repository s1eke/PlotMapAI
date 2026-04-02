import { db } from '@infra/db';

import type { StoredReaderState } from '../hooks/readerSessionTypes';

import { toReadingProgressRecord, toStoredReaderState } from './mapper';
export type { ReadingProgress } from './mapper';
export { toReadingProgress } from './mapper';

export async function readReadingProgress(
  novelId: number,
): Promise<StoredReaderState | null> {
  const progress = await db.readingProgress.where('novelId').equals(novelId).first();
  if (!progress) {
    return null;
  }

  return toStoredReaderState(progress);
}

export async function replaceReadingProgress(
  novelId: number,
  state: StoredReaderState,
): Promise<void> {
  const existing = await db.readingProgress.where('novelId').equals(novelId).first();
  const now = new Date().toISOString();
  const progressRecord = toReadingProgressRecord({
    existingId: existing?.id,
    novelId,
    state,
    updatedAt: now,
  });
  const { id: _unusedId, ...record } = progressRecord;

  await db.readingProgress.put(existing ? progressRecord : record);
}
