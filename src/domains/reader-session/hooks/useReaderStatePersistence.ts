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
  setSessionNovelId,
  useReaderSessionSelector,
} from '../store/readerSessionStore';
import type { StoredReaderState } from '@shared/contracts/reader';
import {
  clampChapterProgress,
  clampPageIndex,
  buildStoredReaderState,
  createCanonicalPositionFingerprint,
  createDefaultStoredReaderState,
  mergeStoredReaderState,
} from '@shared/utils/readerStoredState';
import { flushReaderStateWithCapture } from '../persistence/flushReaderState';

interface PersistReaderStateOptions {
  flush?: boolean;
  persistRemote?: boolean;
}

export type { PageTarget, ReaderMode, ReaderNavigationIntent, ReaderRestoreTarget, StoredReaderState } from '@shared/contracts/reader';

function enrichHintsWithProjectionMetadata(
  hints: StoredReaderState['hints'],
  params: {
    basisCanonicalFingerprint: string;
    capturedAt: string | undefined;
    sourceMode: 'scroll' | 'paged';
  },
): StoredReaderState['hints'] {
  if (!hints) {
    return hints;
  }

  const nextHints: NonNullable<StoredReaderState['hints']> = { ...hints };
  delete nextHints.globalFlow;
  delete nextHints.pagedProjection;
  delete nextHints.scrollProjection;

  if (hints.globalFlow) {
    nextHints.globalFlow = {
      ...hints.globalFlow,
      basisCanonicalFingerprint:
        hints.globalFlow.basisCanonicalFingerprint ?? params.basisCanonicalFingerprint,
      capturedAt: hints.globalFlow.capturedAt ?? params.capturedAt,
      sourceMode: hints.globalFlow.sourceMode ?? params.sourceMode,
    };
  }

  if (hints.pagedProjection) {
    nextHints.pagedProjection = hints.pagedProjection;
  }
  if (typeof hints.pageIndex === 'number') {
    nextHints.pagedProjection = {
      ...nextHints.pagedProjection,
      basisCanonicalFingerprint: params.basisCanonicalFingerprint,
      capturedAt: params.capturedAt,
      sourceMode: params.sourceMode,
    };
  }

  if (hints.scrollProjection) {
    nextHints.scrollProjection = hints.scrollProjection;
  }
  if (typeof hints.chapterProgress === 'number') {
    nextHints.scrollProjection = {
      ...nextHints.scrollProjection,
      basisCanonicalFingerprint: params.basisCanonicalFingerprint,
      capturedAt: params.capturedAt,
      sourceMode: params.sourceMode,
    };
  }

  return nextHints;
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
  const globalFlow = useReaderSessionSelector((state) => state.globalFlow);
  const locator = useReaderSessionSelector((state) => state.locator);
  const positionMetadata = useReaderSessionSelector((state) => state.positionMetadata);
  const storedState = useMemo<StoredReaderState>(() => buildStoredReaderState({
    canonical,
    hints: enrichHintsWithProjectionMetadata(
      {
        chapterProgress: clampChapterProgress(chapterProgress),
        pageIndex: mode === 'paged' && positionMetadata?.sourceMode !== 'scroll'
          ? clampPageIndex(locator?.pageIndex)
          : undefined,
        globalFlow,
        ...createReaderStateModeHints(mode, lastContentMode),
      },
      {
        basisCanonicalFingerprint: createCanonicalPositionFingerprint(canonical),
        capturedAt: positionMetadata?.capturedAt,
        sourceMode: positionMetadata?.sourceMode
          ?? (mode === 'paged' ? 'paged' : 'scroll'),
      },
    ),
    metadata: positionMetadata,
  }), [
    canonical,
    chapterProgress,
    globalFlow,
    lastContentMode,
    locator,
    mode,
    positionMetadata,
  ]);
  const snapshot = useMemo(() => ({
    novelId: sessionNovelId,
    hasUserInteracted,
    storedState,
  }), [hasUserInteracted, sessionNovelId, storedState]);

  const initialStoredState = null;
  const novelScopedInitialState = useMemo(() => createDefaultStoredReaderState(), []);
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
      const sourceMode = nextState.hints?.contentMode ?? lastContentMode;
      const capturedAt = nextState.metadata?.capturedAt ?? new Date().toISOString();
      const basisCanonicalFingerprint = createCanonicalPositionFingerprint(nextState.canonical);
      const enrichedHints = enrichHintsWithProjectionMetadata(nextState.hints, {
        basisCanonicalFingerprint,
        capturedAt,
        sourceMode,
      });
      const enrichedNextState: StoredReaderState = nextState.metadata
        ? {
          ...nextState,
          hints: enrichedHints,
        }
        : {
          ...nextState,
          hints: enrichedHints,
          metadata: {
            capturedAt,
            captureQuality: typeof nextState.canonical?.blockIndex === 'number'
              ? 'precise'
              : 'approximate',
            resolverVersion: 1,
            sourceMode,
          },
        };
      const mergedState = mergeStoredReaderState(
        latestReaderStateRef.current,
        enrichedNextState,
      );
      latestReaderStateRef.current = mergedState;
      persistStoredReaderState(
        enrichedNextState,
        {
          flush: options?.flush,
          persistRemote: options?.persistRemote,
        },
      );
      latestReaderStateRef.current = getStoredReaderStateSnapshot();
    },
    [canPersistForCurrentNovel, lastContentMode, novelId],
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
