import { useCallback, useEffect, useRef } from 'react';

import type { ChapterContent } from './readerContentService';
import type { ReaderSessionSnapshot } from './useReaderSession';
import type { ReaderMode, ReaderRestoreTarget, ReaderSessionCommands, StoredReaderState } from '@shared/contracts/reader';

import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import {
  canSkipReaderRestore,
  clampProgress,
  getContainerProgress,
  shouldKeepReaderRestoreMask,
} from '@shared/utils/readerPosition';
import {
  beginRestore,
  completeRestore,
  getStoredReaderStateSnapshot,
  setPendingRestoreTarget as setStorePendingRestoreTarget,
} from './sessionStore';

interface UseReaderRestoreControllerParams {
  sessionSnapshot: Pick<
    ReaderSessionSnapshot,
    'chapterIndex' | 'lastContentMode' | 'mode' | 'pendingRestoreTarget' | 'viewMode'
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
  handleSetContentMode: (nextMode: 'scroll' | 'paged') => void;
  handleSetViewMode: (viewMode: 'original' | 'summary') => void;
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
    lastContentMode,
    mode,
    pendingRestoreTarget,
    viewMode,
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
    const target: ReaderRestoreTarget = {
      chapterIndex: state.chapterIndex ?? chapterIndex,
      mode: state.mode ?? mode,
      locator: state.locator,
    };

    if (target.mode === 'summary') {
      target.chapterProgress = typeof state.chapterProgress === 'number'
        ? clampProgress(state.chapterProgress)
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

  const rememberModeState = useCallback((target: ReaderRestoreTarget) => {
    modeSnapshotRef.current[target.mode] = target;
  }, []);

  const captureCurrentReaderPosition = useCallback(
    (options?: { flush?: boolean }): StoredReaderState => {
      const storedReaderState = getStoredReaderStateSnapshot();
      const shouldPreferLatestReaderState =
        navigation.getChapterChangeSource() === 'navigation'
        || latestReaderStateRef.current.chapterIndex !== chapterIndex
        || latestReaderStateRef.current.mode !== mode;
      const preferredReaderState = shouldPreferLatestReaderState
        ? latestReaderStateRef.current
        : storedReaderState;
      let nextState: StoredReaderState = {
        chapterIndex:
          preferredReaderState.chapterIndex ?? storedReaderState.chapterIndex ?? chapterIndex,
        mode,
      };

      if (mode === 'paged') {
        const locator = layoutQueries.getCurrentPagedLocator();
        if (locator) {
          nextState.chapterIndex = locator.chapterIndex;
          nextState.locator = locator;
        }
      } else if (mode === 'summary') {
        nextState.chapterProgress = getContainerProgress(viewport.contentRef.current);
        nextState.locator = undefined;
      } else {
        const anchor = shouldPreferLatestReaderState ? null : layoutQueries.getCurrentAnchor();
        const locator = shouldPreferLatestReaderState
          ? null
          : layoutQueries.getCurrentOriginalLocator();
        if (anchor) {
          nextState = {
            ...nextState,
            chapterIndex: locator?.chapterIndex ?? anchor.chapterIndex,
            locator: locator ?? undefined,
          };
        } else if (shouldPreferLatestReaderState) {
          nextState = {
            ...nextState,
            chapterIndex:
              preferredReaderState.locator?.chapterIndex
              ?? preferredReaderState.chapterIndex
              ?? nextState.chapterIndex,
            locator: preferredReaderState.locator,
          };
        } else if (latestReaderStateRef.current.locator) {
          nextState.chapterIndex = latestReaderStateRef.current.locator.chapterIndex;
          nextState.locator = latestReaderStateRef.current.locator;
        }
      }

      rememberModeState(toRestoreTarget(nextState));
      persistReaderState(nextState, { flush: options?.flush });
      return {
        ...latestReaderStateRef.current,
        ...nextState,
      };
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

  const handleSetContentMode = useCallback((nextMode: 'scroll' | 'paged') => {
    if (nextMode === mode) return;

    const currentReaderState = captureCurrentReaderPosition();
    markUserInteracted();
    if (typeof currentReaderState.chapterIndex === 'number') {
      setChapterIndex(currentReaderState.chapterIndex);
    }
    const targetRestoreTarget: ReaderRestoreTarget = {
      ...toRestoreTarget(currentReaderState),
      mode: nextMode,
    };
    rememberModeState(targetRestoreTarget);
    setPendingRestoreTarget(targetRestoreTarget, { force: true });
    setMode(nextMode);
    persistReaderState({
      ...currentReaderState,
      mode: nextMode,
      lastContentMode: nextMode,
    });
  }, [
    captureCurrentReaderPosition,
    markUserInteracted,
    mode,
    persistReaderState,
    rememberModeState,
    setChapterIndex,
    setMode,
    setPendingRestoreTarget,
    toRestoreTarget,
  ]);

  const handleSetViewMode = useCallback((nextViewMode: 'original' | 'summary') => {
    if (nextViewMode === viewMode) return;

    const currentReaderState = captureCurrentReaderPosition();
    const nextMode: ReaderMode = nextViewMode === 'summary' ? 'summary' : lastContentMode;
    const matchingSnapshot = modeSnapshotRef.current[nextMode];
    const canReuseSnapshot =
      matchingSnapshot && matchingSnapshot.chapterIndex === currentReaderState.chapterIndex;
    let nextLastContentMode: 'scroll' | 'paged' = nextMode === 'summary'
      ? lastContentMode
      : nextMode;
    if (nextMode === 'summary') {
      nextLastContentMode = mode === 'summary' ? lastContentMode : mode;
    }
    let targetRestoreTarget: ReaderRestoreTarget;
    if (canReuseSnapshot) {
      targetRestoreTarget = {
        ...toRestoreTarget(currentReaderState),
        ...matchingSnapshot,
        mode: nextMode,
      };
    } else if (nextMode === 'summary') {
      targetRestoreTarget = {
        ...toRestoreTarget(currentReaderState),
        mode: nextMode,
        chapterProgress: 0,
        locatorBoundary: undefined,
        locator: undefined,
      };
    } else {
      targetRestoreTarget = {
        chapterIndex: currentReaderState.chapterIndex ?? chapterIndex,
        mode: nextMode,
        locatorBoundary: 'start',
      };
    }

    markUserInteracted();
    setChapterIndex(targetRestoreTarget.chapterIndex);
    rememberModeState(targetRestoreTarget);
    setPendingRestoreTarget(targetRestoreTarget, { force: true });
    setMode(nextMode);
    persistReaderState({
      chapterIndex: targetRestoreTarget.chapterIndex,
      mode: targetRestoreTarget.mode,
      chapterProgress: targetRestoreTarget.chapterProgress,
      locator: targetRestoreTarget.locator,
      lastContentMode: nextLastContentMode,
    });
  }, [
    captureCurrentReaderPosition,
    chapterIndex,
    lastContentMode,
    markUserInteracted,
    mode,
    persistReaderState,
    rememberModeState,
    setChapterIndex,
    setMode,
    setPendingRestoreTarget,
    toRestoreTarget,
    viewMode,
  ]);

  useEffect(() => {
    if (!isActiveChapterResolved || mode !== 'summary') {
      return;
    }

    const pendingTarget = pendingRestoreTargetRef.current;
    const container = viewport.contentRef.current;
    if (!pendingTarget || pendingTarget.mode !== 'summary' || !container) {
      return;
    }

    if (canSkipReaderRestore(pendingTarget)) {
      clearPendingRestoreTarget();
      stopRestoreMask();
      persistence.notifyRestoreSettled('skipped');
      return;
    }

    const frameId = requestAnimationFrame(() => {
      navigation.setChapterChangeSource('restore');
      suppressScrollSyncTemporarily();
      if (typeof pendingTarget.chapterProgress === 'number') {
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (maxScroll > 0) {
          container.scrollTop = Math.round(
            maxScroll * clampProgress(pendingTarget.chapterProgress),
          );
        }
      }
      navigation.setChapterChangeSource(null);
      clearPendingRestoreTarget();
      stopRestoreMask();
      persistence.notifyRestoreSettled('completed');
    });

    return () => cancelAnimationFrame(frameId);
  }, [
    clearPendingRestoreTarget,
    currentChapter,
    isActiveChapterResolved,
    isChapterAnalysisLoading,
    mode,
    navigation,
    pendingRestoreTarget,
    persistence,
    stopRestoreMask,
    summaryRestoreSignal,
    suppressScrollSyncTemporarily,
    viewport.contentRef,
  ]);

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
        chapterIndex,
        chapterProgress: getContainerProgress(viewport.contentRef.current),
      });
    }, 150);
  }, [chapterIndex, mode, persistReaderState, persistence, viewport.contentRef]);

  return {
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    captureCurrentReaderPosition,
    clearPendingRestoreTarget,
    handleBeforeChapterChange,
    handleContentScroll,
    handleSetContentMode,
    handleSetViewMode,
    setPendingRestoreTarget,
    startRestoreMaskForTarget,
    stopRestoreMask,
    suppressScrollSyncTemporarily,
  };
}

export const useReaderRestoreFlow = useReaderRestoreController;
export type UseReaderRestoreFlowResult = UseReaderRestoreControllerResult;
