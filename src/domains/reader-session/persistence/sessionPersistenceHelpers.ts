import { reportAppError } from '@shared/debug';
import { AppErrorCode } from '@shared/errors';
import type {
  ReaderMode,
  ReaderPersistenceFailure,
  ReaderRestoreTarget,
  ReaderSessionState,
  StoredReaderState,
} from '@shared/contracts/reader';
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
  globalFlow?: ReaderSessionState['globalFlow'];
  locator?: ReaderSessionState['locator'];
  positionMetadata?: ReaderSessionState['positionMetadata'];
  mode: ReaderMode;
  lastContentMode: ReaderSessionState['lastContentMode'];
}

export function shouldMaskRestore(target: ReaderRestoreTarget | null | undefined): boolean {
  return shouldKeepReaderRestoreMask(target);
}

export function toStoredReaderState(state: ReaderSessionCacheShape): StoredReaderState {
  const canonical = state.canonical
    ?? toCanonicalPositionFromLocator(state.locator)
    ?? {
      chapterIndex: state.chapterIndex,
      edge: 'start' as const,
    };
  const canUsePagedPageIndex =
    state.mode === 'paged'
    && state.positionMetadata?.sourceMode !== 'scroll';

  return buildStoredReaderState({
    canonical,
    hints: {
      chapterProgress: clampChapterProgress(state.chapterProgress),
      globalFlow: state.globalFlow,
      pageIndex: canUsePagedPageIndex ? clampPageIndex(state.locator?.pageIndex) : undefined,
      ...createReaderStateModeHints(state.mode, state.lastContentMode),
    },
    metadata: state.positionMetadata,
  });
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
    globalFlow: initialStoredState.hints?.globalFlow,
    positionMetadata: initialStoredState.metadata,
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
