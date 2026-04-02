import { db } from '@infra/db';

import type { ReaderMode, StoredReaderState } from '../hooks/readerSessionTypes';
import type { ReaderLocator } from '../utils/readerLayout';

import {
  buildStoredReaderState,
  clampChapterProgress,
  sanitizeStoredReaderState,
  shouldUseLocatorAsPrimaryPosition,
} from './state';

export interface ReadingProgress {
  chapterIndex: number;
  mode: ReaderMode;
  chapterProgress?: number;
  locator?: ReaderLocator;
}

export async function readReadingProgress(
  novelId: number,
): Promise<StoredReaderState | null> {
  const progress = await db.readingProgress.where('novelId').equals(novelId).first();
  if (!progress) {
    return null;
  }

  return sanitizeStoredReaderState({
    chapterIndex: progress.chapterIndex,
    mode:
      progress.mode === 'scroll' || progress.mode === 'paged' || progress.mode === 'summary'
        ? progress.mode
        : 'scroll',
    chapterProgress: progress.chapterProgress,
    locator: progress.locator,
  });
}

export function toReadingProgress(state: StoredReaderState): ReadingProgress {
  const canonicalState = buildStoredReaderState(state);
  const durableMode = canonicalState.mode ?? 'scroll';
  const usesLocator = shouldUseLocatorAsPrimaryPosition(
    durableMode,
    canonicalState.locator,
  );

  return {
    chapterIndex: canonicalState.chapterIndex ?? 0,
    mode: durableMode,
    chapterProgress: durableMode === 'summary'
      ? clampChapterProgress(canonicalState.chapterProgress)
      : undefined,
    locator: usesLocator ? canonicalState.locator : undefined,
  };
}

export async function replaceReadingProgress(
  novelId: number,
  state: StoredReaderState,
): Promise<void> {
  const existing = await db.readingProgress.where('novelId').equals(novelId).first();
  const progress = toReadingProgress(state);
  const now = new Date().toISOString();

  await db.readingProgress.put({
    id: existing?.id,
    novelId,
    chapterIndex: progress.chapterIndex,
    mode: progress.mode,
    chapterProgress: progress.chapterProgress,
    locator: progress.locator,
    updatedAt: now,
  });
}
