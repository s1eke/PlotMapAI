import { reportAppError } from '@shared/debug';
import { AppErrorCode } from '@shared/errors';
import type {
  PersistedReadingProgress,
  ReaderMode,
  ReaderPersistenceFailure,
  ReaderRestoreTarget,
  ReaderSessionState,
  StoredReaderState,
} from '@shared/contracts/reader';
import {
  readReaderBootstrapSnapshot,
} from '@infra/storage/readerStateCache';
import { getPersistedReadingProgressFingerprint } from '@shared/utils/readerPersistedProgress';
import { createReaderStateModeHints } from '@shared/utils/readerMode';
import { shouldKeepReaderRestoreMask } from '@shared/utils/readerPosition';

import {
  buildStoredReaderState,
  clampChapterProgress,
  clampPageIndex,
  createDefaultStoredReaderState,
  getStoredChapterIndex,
  toCanonicalPositionFromLocator,
  toReaderLocatorFromCanonical,
} from '@shared/utils/readerStoredState';

export interface ReaderSessionCacheShape {
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

  return buildStoredReaderState(snapshot.progress.state);
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
      ...createReaderStateModeHints(state.mode, state.lastContentMode),
    },
  });
}

export function getReaderSessionProgressFingerprint(
  state: PersistedReadingProgress | ReaderSessionCacheShape | StoredReaderState,
): string {
  return getPersistedReadingProgressFingerprint(
    'novelId' in state ? toStoredReaderState(state) : state,
  );
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
