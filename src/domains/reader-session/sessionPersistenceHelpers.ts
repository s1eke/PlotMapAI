import { reportAppError } from '@shared/debug';
import { AppErrorCode } from '@shared/errors';
import type {
  ReaderMode,
  ReaderPersistenceFailure,
  ReaderRestoreTarget,
  ReaderSessionState,
  StoredReaderState,
} from '@shared/contracts/reader';
import {
  readReaderBootstrapSnapshot,
  writeReaderBootstrapSnapshot,
} from '@infra/storage/readerStateCache';
import { shouldKeepReaderRestoreMask } from '@shared/utils/readerPosition';

import {
  buildStoredReaderState,
  clampChapterProgress,
  clampPageIndex,
  createDefaultStoredReaderState,
  getStoredChapterIndex,
  toCanonicalPositionFromLocator,
  toReaderLocatorFromCanonical,
} from './state';
import { toReadingProgress, type ReadingProgress } from './repository';

interface ReaderSessionCacheShape {
  novelId: number;
  canonical?: ReaderSessionState['canonical'];
  chapterIndex: number;
  chapterProgress?: number;
  locator?: ReaderSessionState['locator'];
  mode: ReaderMode;
  lastContentMode: ReaderSessionState['lastContentMode'];
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function shouldMaskRestore(target: ReaderRestoreTarget | null | undefined): boolean {
  return shouldKeepReaderRestoreMask(target);
}

export function readLocalSessionState(novelId: number): StoredReaderState | null {
  if (!isBrowser() || !novelId) {
    return null;
  }

  const snapshot = readReaderBootstrapSnapshot(novelId);
  if (!snapshot) {
    return null;
  }

  return buildStoredReaderState(snapshot.state);
}

export function toStoredReaderState(state: ReaderSessionCacheShape): StoredReaderState {
  const canonical = state.canonical
    ?? toCanonicalPositionFromLocator(state.locator)
    ?? {
      chapterIndex: state.chapterIndex,
      edge: 'start' as const,
    };

  return buildStoredReaderState({
    canonical,
    hints: {
      chapterProgress: clampChapterProgress(state.chapterProgress),
      pageIndex: clampPageIndex(state.locator?.pageIndex),
      contentMode: state.mode === 'summary' ? state.lastContentMode : state.mode,
    },
  });
}

export function writeReaderSessionCache(state: ReaderSessionCacheShape): void {
  if (!isBrowser() || !state.novelId) {
    return;
  }

  writeReaderBootstrapSnapshot(state.novelId, toStoredReaderState(state));
}

export function getRemoteProgressSnapshot(progress: ReadingProgress | null): string {
  if (!progress) {
    return 'null';
  }

  return JSON.stringify({
    canonical: progress.canonical,
  });
}

export function toRemoteProgress(state: ReaderSessionCacheShape): ReadingProgress | null {
  return toReadingProgress(toStoredReaderState(state));
}

export function createInitialReaderSessionState(): ReaderSessionState {
  const initialStoredState = createDefaultStoredReaderState();
  const chapterIndex = getStoredChapterIndex(initialStoredState);

  return {
    novelId: 0,
    canonical: initialStoredState.canonical,
    mode: 'scroll',
    chapterIndex,
    chapterProgress: initialStoredState.hints?.chapterProgress,
    locator: toReaderLocatorFromCanonical(
      initialStoredState.canonical,
      initialStoredState.hints?.pageIndex,
    ),
    restoreStatus: 'hydrating',
    lifecycleLastEvent: null,
    lifecycleLoadKey: null,
    lastRestoreResult: null,
    persistenceStatus: 'healthy',
    lastPersistenceFailure: null,
    lastContentMode: 'scroll',
    pendingRestoreTarget: null,
    hasUserInteracted: false,
  };
}

export function toPersistenceFailure(
  error: unknown,
  context: { message: string; retryable?: boolean },
): ReaderPersistenceFailure {
  const normalized = reportAppError(error, {
    code: AppErrorCode.STORAGE_OPERATION_FAILED,
    kind: 'storage',
    source: 'reader',
    retryable: context.retryable ?? true,
    debugMessage: context.message,
  });

  return {
    code: normalized.code,
    message: normalized.debugMessage,
    retryable: normalized.retryable,
    time: Date.now(),
  };
}
