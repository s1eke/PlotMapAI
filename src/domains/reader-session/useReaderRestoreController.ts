import { useCallback, useEffect, useRef } from 'react';

import type { ChapterContent } from '@shared/contracts/reader';
import type { ReaderSessionSnapshot } from './useReaderSession';
import type {
  ReaderMode,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  ReaderSessionCommands,
  StoredReaderState,
} from '@shared/contracts/reader';

import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import {
  clampProgress,
  getContainerProgress,
  shouldKeepReaderRestoreMask,
} from '@shared/utils/readerPosition';
import {
  buildStoredReaderState,
  getStoredChapterIndex,
  mergeStoredReaderState,
  toCanonicalPositionFromLocator,
  toReaderLocatorFromCanonical,
} from './state';
import {
  beginRestore,
  completeRestore,
  getStoredReaderStateSnapshot,
  setPendingRestoreTarget as setStorePendingRestoreTarget,
} from './readerSessionStore';
import { useReaderRestoreResultTracker } from './readerRestoreResultTracker';
import { useSummaryRestoreRunner } from './useSummaryRestoreRunner';
import { debugLog, setDebugSnapshot } from '@shared/debug';

interface UseReaderRestoreControllerParams {
  sessionSnapshot: Pick<
    ReaderSessionSnapshot,
    'chapterIndex' | 'mode' | 'pendingRestoreTarget'
  >;
  sessionCommands: Pick<
    ReaderSessionCommands,
    | 'latestReaderStateRef'
    | 'markUserInteracted'
    | 'persistReaderState'
    | 'setChapterIndex'
    | 'setMode'
  >;
  currentChapter: ChapterContent | null;
  summaryRestoreSignal: unknown;
  isChapterAnalysisLoading: boolean;
}

export interface UseReaderRestoreControllerResult {
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  captureCurrentReaderPosition: (options?: { flush?: boolean }) => StoredReaderState;
  clearPendingRestoreTarget: () => void;
  handleBeforeChapterChange: () => void;
  handleContentScroll: () => void;
  switchMode: (targetMode: ReaderMode) => void;
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  retryLastFailedRestore: () => boolean;
  setPendingRestoreTarget: (
    nextTarget: ReaderRestoreTarget | null,
    options?: { force?: boolean },
  ) => void;
  startRestoreMaskForTarget: (target: ReaderRestoreTarget | null | undefined) => void;
  stopRestoreMask: () => void;
  suppressScrollSyncTemporarily: () => void;
}

export function useReaderRestoreController({
  sessionSnapshot,
  sessionCommands,
  currentChapter,
  summaryRestoreSignal,
  isChapterAnalysisLoading,
}: UseReaderRestoreControllerParams): UseReaderRestoreControllerResult {
  const viewport = useReaderViewportContext();
  const navigation = useReaderNavigationRuntime();
  const layoutQueries = useReaderLayoutQueries();
  const persistence = useReaderPersistenceRuntime();
  const {
    chapterIndex,
    mode,
    pendingRestoreTarget,
  } = sessionSnapshot;
  const {
    latestReaderStateRef,
    markUserInteracted,
    persistReaderState,
    setChapterIndex,
    setMode,
  } = sessionCommands;
  const pendingRestoreTargetRef = useRef<ReaderRestoreTarget | null>(pendingRestoreTarget);
  const captureCurrentReaderPositionRef =
    useRef<(options?: { flush?: boolean }) => StoredReaderState>(() => ({}));
  const modeSnapshotRef = useRef<Record<ReaderMode, ReaderRestoreTarget | null>>({
    paged: null,
    scroll: null,
    summary: null,
  });
  const summaryProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveChapterResolved = currentChapter?.index === chapterIndex;

  useEffect(() => {
    pendingRestoreTargetRef.current = pendingRestoreTarget;
  }, [pendingRestoreTarget]);

  const toRestoreTarget = useCallback((state: StoredReaderState): ReaderRestoreTarget => {
    const normalizedState = buildStoredReaderState(state);
    const locator = toReaderLocatorFromCanonical(
      normalizedState.canonical,
      normalizedState.hints?.pageIndex,
    );
    const canonicalEdge = normalizedState.canonical?.edge;
    const hasCanonicalBoundary =
      canonicalEdge === 'start'
      || canonicalEdge === 'end';
    const locatorBoundary = !locator && hasCanonicalBoundary
      ? canonicalEdge
      : undefined;
    const target: ReaderRestoreTarget = {
      chapterIndex: getStoredChapterIndex(normalizedState) || chapterIndex,
      mode,
      locator,
      locatorBoundary,
    };

    if (target.mode === 'summary') {
      target.chapterProgress = typeof normalizedState.hints?.chapterProgress === 'number'
        ? clampProgress(normalizedState.hints.chapterProgress)
        : undefined;
    }

    return target;
  }, [chapterIndex, mode]);

  const setPendingRestoreTarget = useCallback(
    (nextTarget: ReaderRestoreTarget | null, options?: { force?: boolean }) => {
      if (!nextTarget) {
        pendingRestoreTargetRef.current = null;
        setStorePendingRestoreTarget(null);
        return;
      }

      if (options?.force) {
        pendingRestoreTargetRef.current = nextTarget;
        setStorePendingRestoreTarget(nextTarget);
        return;
      }

      pendingRestoreTargetRef.current = shouldKeepReaderRestoreMask(nextTarget)
        ? nextTarget
        : null;
      setStorePendingRestoreTarget(
        shouldKeepReaderRestoreMask(nextTarget) ? nextTarget : null,
      );
    },
    [],
  );

  const clearPendingRestoreTarget = useCallback(() => {
    pendingRestoreTargetRef.current = null;
    setStorePendingRestoreTarget(null);
  }, []);

  const startRestoreMaskForTarget = useCallback(
    (target: ReaderRestoreTarget | null | undefined) => {
      if (shouldKeepReaderRestoreMask(target)) {
        beginRestore(target);
        return;
      }

      completeRestore();
    },
    [],
  );

  const stopRestoreMask = useCallback(() => {
    completeRestore();
  }, []);

  const suppressScrollSyncTemporarily = useCallback(() => {
    persistence.suppressScrollSyncTemporarily();
  }, [persistence]);
  const {
    getRestoreAttempt,
    recordRestoreResult,
    retryLastFailedRestore,
  } = useReaderRestoreResultTracker({
    setPendingRestoreTarget,
    startRestoreMaskForTarget,
  });

  const rememberModeState = useCallback((target: ReaderRestoreTarget) => {
    modeSnapshotRef.current[target.mode] = target;
  }, []);

  const captureCurrentReaderPosition = useCallback(
    (options?: { flush?: boolean }): StoredReaderState => {
      const storedReaderState = getStoredReaderStateSnapshot();
      const latestChapterIndex = getStoredChapterIndex(latestReaderStateRef.current);
      const shouldPreferLatestReaderState =
        navigation.getChapterChangeSource() === 'navigation'
        || latestChapterIndex !== chapterIndex;
      const preferredReaderState = shouldPreferLatestReaderState
        ? buildStoredReaderState(latestReaderStateRef.current)
        : buildStoredReaderState(storedReaderState);
      let nextState: StoredReaderState = buildStoredReaderState(preferredReaderState);

      if (mode === 'paged') {
        const locator = layoutQueries.getCurrentPagedLocator();
        if (locator) {
          nextState = mergeStoredReaderState(nextState, {
            canonical: toCanonicalPositionFromLocator(locator),
            hints: {
              ...nextState.hints,
              pageIndex: locator.pageIndex,
            },
          });
        }
      } else if (mode === 'summary') {
        nextState = mergeStoredReaderState(nextState, {
          hints: {
            ...nextState.hints,
            chapterProgress: getContainerProgress(viewport.contentRef.current),
          },
        });
      } else {
        const anchor = shouldPreferLatestReaderState ? null : layoutQueries.getCurrentAnchor();
        const locator = shouldPreferLatestReaderState
          ? null
          : layoutQueries.getCurrentOriginalLocator();
        if (locator) {
          nextState = mergeStoredReaderState(nextState, {
            canonical: toCanonicalPositionFromLocator(locator),
            hints: {
              ...nextState.hints,
              pageIndex: undefined,
            },
          });
        } else if (anchor) {
          nextState = mergeStoredReaderState(nextState, {
            canonical: {
              chapterIndex: anchor.chapterIndex,
              edge: 'start',
            },
            hints: {
              ...nextState.hints,
              pageIndex: undefined,
            },
          });
        } else if (shouldPreferLatestReaderState) {
          nextState = mergeStoredReaderState(nextState, {
            canonical: preferredReaderState.canonical,
            hints: preferredReaderState.hints,
          });
        } else if (latestReaderStateRef.current.canonical) {
          nextState = mergeStoredReaderState(nextState, {
            canonical: latestReaderStateRef.current.canonical,
            hints: {
              ...nextState.hints,
              pageIndex: undefined,
            },
          });
        }
      }

      rememberModeState(toRestoreTarget(nextState));
      persistReaderState(nextState, { flush: options?.flush });
      return mergeStoredReaderState(latestReaderStateRef.current, nextState);
    },
    [
      chapterIndex,
      latestReaderStateRef,
      layoutQueries,
      mode,
      navigation,
      persistReaderState,
      rememberModeState,
      toRestoreTarget,
      viewport.contentRef,
    ],
  );

  useEffect(() => {
    captureCurrentReaderPositionRef.current = captureCurrentReaderPosition;
  }, [captureCurrentReaderPosition]);

  useEffect(() => {
    return persistence.registerBeforeFlush(() => {
      captureCurrentReaderPositionRef.current();
    });
  }, [persistence]);

  const buildModeRestoreTarget = useCallback((
    currentReaderState: StoredReaderState,
    targetMode: ReaderMode,
  ): ReaderRestoreTarget => ({
    ...toRestoreTarget(currentReaderState),
    mode: targetMode,
  }), [toRestoreTarget]);

  const solveModeRestoreTarget = useCallback((
    targetMode: ReaderMode,
    currentReaderState: StoredReaderState,
    baseTarget: ReaderRestoreTarget,
  ): ReaderRestoreTarget => {
    const currentChapterIndex = currentReaderState.canonical?.chapterIndex ?? chapterIndex;

    if (targetMode === 'summary') {
      return {
        ...baseTarget,
        chapterProgress: 0,
        locatorBoundary: undefined,
        locator: undefined,
      };
    }

    if (mode !== 'summary') {
      return baseTarget;
    }

    const matchingSnapshot = modeSnapshotRef.current[targetMode];
    const canReuseSnapshot =
      matchingSnapshot && matchingSnapshot.chapterIndex === currentChapterIndex;
    if (canReuseSnapshot) {
      return {
        ...baseTarget,
        ...matchingSnapshot,
        mode: targetMode,
      };
    }

    return {
      chapterIndex: currentChapterIndex || chapterIndex,
      mode: targetMode,
      locatorBoundary: 'start',
    };
  }, [chapterIndex, mode]);

  const switchMode = useCallback((targetMode: ReaderMode) => {
    if (targetMode === mode) return;

    const currentReaderState = captureCurrentReaderPosition();
    const baseTarget = buildModeRestoreTarget(currentReaderState, targetMode);
    const targetRestoreTarget = solveModeRestoreTarget(
      targetMode,
      currentReaderState,
      baseTarget,
    );
    const nextPersistedState = targetMode === 'summary'
      ? mergeStoredReaderState(currentReaderState, {
        hints: {
          ...currentReaderState.hints,
          chapterProgress: targetRestoreTarget.chapterProgress ?? 0,
        },
      })
      : currentReaderState;

    markUserInteracted();
    setChapterIndex(targetRestoreTarget.chapterIndex);
    rememberModeState(targetRestoreTarget);
    setPendingRestoreTarget(targetRestoreTarget, { force: true });
    setMode(targetMode);
    persistReaderState(nextPersistedState, { persistRemote: false });
    const modeSwitchSnapshot = {
      source: 'useReaderRestoreController.switchMode',
      previousMode: mode,
      targetMode,
      chapterIndex: targetRestoreTarget.chapterIndex,
      locatorBoundary: targetRestoreTarget.locatorBoundary ?? null,
      hasLocator: Boolean(targetRestoreTarget.locator),
      chapterProgress: targetRestoreTarget.chapterProgress ?? null,
      persistedHintContentMode: nextPersistedState.hints?.contentMode ?? null,
    };
    setDebugSnapshot('reader-mode-switch', modeSwitchSnapshot);
    debugLog('Reader', 'reader mode switched', modeSwitchSnapshot);
  }, [
    buildModeRestoreTarget,
    captureCurrentReaderPosition,
    markUserInteracted,
    mode,
    persistReaderState,
    rememberModeState,
    setChapterIndex,
    setMode,
    setPendingRestoreTarget,
    solveModeRestoreTarget,
  ]);

  useSummaryRestoreRunner({
    chapterIndex,
    clearPendingRestoreTarget,
    currentChapterIndex: currentChapter?.index,
    enabled: isActiveChapterResolved && !isChapterAnalysisLoading,
    getRestoreAttempt,
    mode,
    notifyRestoreSettled: persistence.notifyRestoreSettled,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    recordRestoreResult,
    setChapterChangeSource: navigation.setChapterChangeSource,
    stopRestoreMask,
    summaryRestoreSignal,
    suppressScrollSyncTemporarily,
    viewportContentRef: viewport.contentRef,
  });

  useEffect(() => {
    return () => {
      captureCurrentReaderPositionRef.current();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (summaryProgressTimerRef.current) {
        clearTimeout(summaryProgressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (summaryProgressTimerRef.current) {
      clearTimeout(summaryProgressTimerRef.current);
      summaryProgressTimerRef.current = null;
    }
  }, [chapterIndex, mode]);

  const handleBeforeChapterChange = useCallback(() => {
    clearPendingRestoreTarget();
    stopRestoreMask();
    suppressScrollSyncTemporarily();
  }, [clearPendingRestoreTarget, stopRestoreMask, suppressScrollSyncTemporarily]);

  const handleContentScroll = useCallback(() => {
    if (persistence.isScrollSyncSuppressed()) {
      return;
    }

    if (mode !== 'summary' || pendingRestoreTargetRef.current) {
      return;
    }

    if (summaryProgressTimerRef.current) {
      clearTimeout(summaryProgressTimerRef.current);
    }

    summaryProgressTimerRef.current = setTimeout(() => {
      persistReaderState({
        hints: {
          chapterProgress: getContainerProgress(viewport.contentRef.current),
        },
      }, {
        persistRemote: false,
      });
    }, 150);
  }, [mode, persistReaderState, persistence, viewport.contentRef]);

  return {
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    captureCurrentReaderPosition,
    clearPendingRestoreTarget,
    handleBeforeChapterChange,
    handleContentScroll,
    getRestoreAttempt,
    recordRestoreResult,
    retryLastFailedRestore,
    setPendingRestoreTarget,
    startRestoreMaskForTarget,
    stopRestoreMask,
    suppressScrollSyncTemporarily,
    switchMode,
  };
}

export const useReaderRestoreFlow = useReaderRestoreController;
export type UseReaderRestoreFlowResult = UseReaderRestoreControllerResult;
