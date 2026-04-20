import { useCallback, useEffect, useMemo, useRef } from 'react';

import { debugLog, setDebugSnapshot } from '@shared/debug';
import {
  ensureReaderPreferenceStoreHydrated,
  getReaderPreferenceStoreSnapshot,
  hasConfiguredReaderPageTurnModePreference,
} from '@shared/stores/readerPreferenceStore';
import { useReaderPersistenceRuntime } from '@shared/reader-runtime';
import {
  createReaderStateModeHints,
  resolvePersistedReaderMode,
} from '@shared/utils/readerMode';
import {
  getStoredReaderStateSnapshot,
  hydrateSession,
  markUserInteracted,
  persistStoredReaderState,
  readInitialStoredReaderState,
  setSessionNovelId,
  useReaderSessionSelector,
} from '../store/readerSessionStore';
import type { StoredReaderState } from '@shared/contracts/reader';
import {
  buildStoredReaderState,
  clampChapterProgress,
  clampPageIndex,
  createDefaultStoredReaderState,
  mergeStoredReaderState,
} from '@shared/utils/readerStoredState';
import { flushReaderStateWithCapture } from '../persistence/flushReaderState';

interface PersistReaderStateOptions {
  flush?: boolean;
  persistRemote?: boolean;
}

export type { PageTarget, ReaderMode, ReaderNavigationIntent, ReaderRestoreTarget, StoredReaderState } from '@shared/contracts/reader';

function buildNovelScopedInitialState(
  initialStoredState: StoredReaderState | null,
): StoredReaderState {
  if (!initialStoredState) {
    return createDefaultStoredReaderState();
  }

  return buildStoredReaderState(initialStoredState);
}

export function useReaderStatePersistence(novelId: number): {
  latestReaderStateRef: React.MutableRefObject<StoredReaderState>;
  hasUserInteractedRef: React.MutableRefObject<boolean>;
  markUserInteracted: () => void;
  persistReaderState: (nextState: StoredReaderState, options?: PersistReaderStateOptions) => void;
  flushReaderState: () => Promise<void>;
  loadPersistedReaderState: () => Promise<StoredReaderState>;
  initialStoredState: StoredReaderState | null;
} {
  const persistence = useReaderPersistenceRuntime();
  const sessionNovelId = useReaderSessionSelector((state) => state.novelId);
  const hasUserInteracted = useReaderSessionSelector((state) => state.hasUserInteracted);
  const canonical = useReaderSessionSelector((state) => state.canonical);
  const mode = useReaderSessionSelector((state) => state.mode);
  const lastContentMode = useReaderSessionSelector((state) => state.lastContentMode);
  const chapterProgress = useReaderSessionSelector((state) => state.chapterProgress);
  const locator = useReaderSessionSelector((state) => state.locator);
  const storedState = useMemo<StoredReaderState>(() => ({
    canonical,
    hints: {
      chapterProgress: clampChapterProgress(chapterProgress),
      pageIndex: clampPageIndex(locator?.pageIndex),
      ...createReaderStateModeHints(mode, lastContentMode),
    },
  }), [
    canonical,
    chapterProgress,
    lastContentMode,
    locator,
    mode,
  ]);
  const snapshot = useMemo(() => ({
    novelId: sessionNovelId,
    hasUserInteracted,
    storedState,
  }), [hasUserInteracted, sessionNovelId, storedState]);

  const initialStoredState = useMemo(
    () => readInitialStoredReaderState(novelId),
    [novelId],
  );
  const novelScopedInitialState = useMemo(
    () => buildNovelScopedInitialState(initialStoredState),
    [initialStoredState],
  );
  const isSessionNovelAligned = !novelId || snapshot.novelId === novelId;
  const canPersistForCurrentNovel =
    !novelId || snapshot.novelId === novelId || snapshot.novelId === 0;
  const latestReaderStateRef = useRef<StoredReaderState>(
    isSessionNovelAligned ? snapshot.storedState : novelScopedInitialState,
  );
  const hasUserInteractedRef = useRef(snapshot.hasUserInteracted);

  useEffect(() => {
    if (!isSessionNovelAligned) {
      latestReaderStateRef.current = novelScopedInitialState;
      return;
    }

    latestReaderStateRef.current = snapshot.storedState;
  }, [isSessionNovelAligned, novelScopedInitialState, snapshot.storedState]);

  useEffect(() => {
    if (!isSessionNovelAligned) return;
    hasUserInteractedRef.current = snapshot.hasUserInteracted;
  }, [isSessionNovelAligned, snapshot.hasUserInteracted]);

  useEffect(() => {
    hasUserInteractedRef.current = false;
  }, [novelId]);

  const persistReaderState = useCallback(
    (nextState: StoredReaderState, options?: PersistReaderStateOptions) => {
      if (!canPersistForCurrentNovel) {
        return;
      }

      if (novelId) {
        setSessionNovelId(novelId);
      }
      const mergedState = mergeStoredReaderState(
        latestReaderStateRef.current,
        nextState,
      );
      persistStoredReaderState(
        mergedState,
        {
          flush: options?.flush,
          persistRemote: options?.persistRemote,
        },
      );
      latestReaderStateRef.current = getStoredReaderStateSnapshot();
    },
    [canPersistForCurrentNovel, novelId],
  );

  const loadPersistedReaderState = useCallback(async (): Promise<StoredReaderState> => {
    await ensureReaderPreferenceStoreHydrated();
    const preferences = getReaderPreferenceStoreSnapshot();
    const hasConfiguredPageTurnMode = hasConfiguredReaderPageTurnModePreference();
    const hydratedStoredState = await hydrateSession(novelId, {
      hasConfiguredPageTurnMode,
      pageTurnMode: preferences.pageTurnMode,
    });
    const resolvedMode = resolvePersistedReaderMode(hydratedStoredState, {
      pageTurnMode: preferences.pageTurnMode,
    });
    const resolvedStoredState = mergeStoredReaderState(hydratedStoredState, {
      hints: {
        contentMode: resolvedMode.contentMode,
        viewMode: resolvedMode.viewMode,
      },
    });
    const modeResolutionSnapshot = {
      source: 'useReaderStatePersistence.loadPersistedReaderState',
      novelId,
      hasConfiguredPageTurnMode,
      pageTurnMode: preferences.pageTurnMode,
      persistedHintViewMode: hydratedStoredState.hints?.viewMode ?? null,
      persistedHintContentMode: hydratedStoredState.hints?.contentMode ?? null,
      resolvedHintViewMode: resolvedStoredState.hints?.viewMode ?? null,
      resolvedHintContentMode: resolvedStoredState.hints?.contentMode ?? null,
      resolvedMode: resolvedMode.mode,
      resolvedHintContentModeSource: resolvedMode.usedContentModeFallback
        ? 'page-turn-preference-fallback'
        : 'persisted',
      resolvedHintViewModeSource: resolvedMode.usedViewModeFallback
        ? 'default-original'
        : 'persisted',
      persistedCanonicalBlockIndex: resolvedStoredState.canonical?.blockIndex ?? null,
      persistedCanonicalKind: resolvedStoredState.canonical?.kind ?? null,
      persistedCanonicalEdge: resolvedStoredState.canonical?.edge ?? null,
      persistedPageIndex: resolvedStoredState.hints?.pageIndex ?? null,
      persistedChapterProgress: resolvedStoredState.hints?.chapterProgress ?? null,
      persistedChapterIndex: resolvedStoredState.canonical?.chapterIndex ?? null,
      fallbackReason: [
        resolvedMode.usedViewModeFallback
          ? 'missing-hints.viewMode -> fallback-to-original'
          : null,
        resolvedMode.usedContentModeFallback
          ? 'missing-hints.contentMode -> fallback-to-page-turn-preference'
          : null,
      ].filter(Boolean).join(', ') || null,
    };
    setDebugSnapshot('reader-mode-resolution', modeResolutionSnapshot);
    debugLog('Reader', 'reader mode resolution snapshot', modeResolutionSnapshot);
    if (modeResolutionSnapshot.fallbackReason) {
      debugLog(
        'Reader',
        'persisted reader state is missing hints.contentMode; using page-turn preference fallback',
        modeResolutionSnapshot,
      );
    }
    return resolvedStoredState;
  }, [novelId]);

  const flushReaderState = useCallback(async (): Promise<void> => {
    await flushReaderStateWithCapture(persistence);
  }, [persistence]);

  const handleMarkUserInteracted = useCallback(() => {
    hasUserInteractedRef.current = true;
    markUserInteracted();
  }, []);

  return {
    latestReaderStateRef,
    hasUserInteractedRef,
    markUserInteracted: handleMarkUserInteracted,
    persistReaderState,
    flushReaderState,
    loadPersistedReaderState,
    initialStoredState,
  };
}
