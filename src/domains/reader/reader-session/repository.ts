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
  scrollPosition: number;
  mode: ReaderMode;
  chapterProgress?: number;
  locatorVersion?: 1;
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
    scrollPosition: progress.scrollPosition,
    mode:
      progress.mode === 'scroll' || progress.mode === 'paged' || progress.mode === 'summary'
        ? progress.mode
        : 'scroll',
    chapterProgress: progress.chapterProgress,
    locatorVersion: progress.locatorVersion === 1 ? 1 : undefined,
    locator: progress.locatorVersion === 1 ? progress.locator : undefined,
  });
}

export function toReadingProgress(state: StoredReaderState): ReadingProgress {
  const canonicalState = buildStoredReaderState(state);
  const durableMode = canonicalState.mode === 'summary'
    ? canonicalState.lastContentMode ?? 'scroll'
    : canonicalState.mode ?? 'scroll';
  const usesLocator = shouldUseLocatorAsPrimaryPosition(
    durableMode,
    canonicalState.locator,
  );

  return {
    chapterIndex: canonicalState.chapterIndex ?? 0,
    scrollPosition: usesLocator ? 0 : canonicalState.scrollPosition ?? 0,
    mode: durableMode,
    chapterProgress: usesLocator
      ? undefined
      : clampChapterProgress(canonicalState.chapterProgress),
    locatorVersion: usesLocator ? 1 : undefined,
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
    scrollPosition: progress.scrollPosition,
    mode: progress.mode,
    chapterProgress: progress.chapterProgress,
    locatorVersion: progress.locatorVersion,
    locator: progress.locator,
    updatedAt: now,
  });
}
