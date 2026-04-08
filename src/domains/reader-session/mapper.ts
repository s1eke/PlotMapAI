import type { ReadingProgressRecord, ReaderLocatorRecord } from '@infra/db/reader';
import type { ReaderLocator, StoredReaderState } from '@shared/contracts/reader';

import {
  buildStoredReaderState,
  clampChapterProgress,
  sanitizeStoredReaderState,
  shouldUseLocatorAsPrimaryPosition,
} from './state';

export interface ReadingProgress {
  chapterIndex: number;
  mode: 'scroll' | 'paged' | 'summary';
  chapterProgress?: number;
  locator?: ReaderLocator;
}

export function toReaderLocator(record?: ReaderLocatorRecord | null): ReaderLocator | undefined {
  if (!record) {
    return undefined;
  }

  return {
    chapterIndex: record.chapterIndex,
    blockIndex: record.blockIndex,
    pageIndex: record.pageIndex,
    kind: record.kind,
    lineIndex: record.lineIndex,
    startCursor: record.startCursor ? { ...record.startCursor } : undefined,
    endCursor: record.endCursor ? { ...record.endCursor } : undefined,
    edge: record.edge,
  };
}

export function toReaderLocatorRecord(locator?: ReaderLocator): ReaderLocatorRecord | undefined {
  if (!locator) {
    return undefined;
  }

  return {
    chapterIndex: locator.chapterIndex,
    blockIndex: locator.blockIndex,
    pageIndex: locator.pageIndex,
    kind: locator.kind,
    lineIndex: locator.lineIndex,
    startCursor: locator.startCursor ? { ...locator.startCursor } : undefined,
    endCursor: locator.endCursor ? { ...locator.endCursor } : undefined,
    edge: locator.edge,
  };
}

export function toStoredReaderState(record: ReadingProgressRecord): StoredReaderState {
  return sanitizeStoredReaderState({
    chapterIndex: record.chapterIndex,
    mode:
      record.mode === 'scroll' || record.mode === 'paged' || record.mode === 'summary'
        ? record.mode
        : 'scroll',
    chapterProgress: record.chapterProgress,
    locator: toReaderLocator(record.locator),
  }) ?? buildStoredReaderState(undefined);
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

export function toReadingProgressRecord(params: {
  existingId?: number;
  novelId: number;
  state: StoredReaderState;
  updatedAt: string;
}): ReadingProgressRecord {
  const progress = toReadingProgress(params.state);

  return {
    id: params.existingId ?? 0,
    novelId: params.novelId,
    chapterIndex: progress.chapterIndex,
    mode: progress.mode,
    chapterProgress: progress.chapterProgress,
    locator: toReaderLocatorRecord(progress.locator),
    updatedAt: params.updatedAt,
  };
}
