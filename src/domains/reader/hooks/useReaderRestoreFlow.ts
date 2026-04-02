import { useCallback, useEffect, useRef } from 'react';
import type { ChapterContent } from '../readerContentService';
import type { ReaderSessionCommands, ReaderSessionSnapshot } from '../reader-session';
import type { ReaderUiBridgeValue } from '../reader-ui';
import type { ReaderMode, ReaderRestoreTarget, StoredReaderState } from './useReaderStatePersistence';
import {
  beginRestore,
  completeRestore,
  getStoredReaderStateSnapshot,
  setPendingRestoreTarget as setStorePendingRestoreTarget,
  useReaderSessionSelector,
} from './sessionStore';
import {
  canSkipReaderRestore,
  clampProgress,
  getContainerProgress,
  shouldKeepReaderRestoreMask,
} from '../utils/readerPosition';
import { useReaderContext } from '../pages/reader-page/ReaderContext';

interface UseReaderRestoreFlowParams {
  sessionSnapshot?: Pick<
    ReaderSessionSnapshot,
    'chapterIndex' | 'lastContentMode' | 'mode' | 'pendingRestoreTarget' | 'viewMode'
  >;
  sessionCommands?: Pick<
    ReaderSessionCommands,
    | 'latestReaderStateRef'
    | 'markUserInteracted'
    | 'persistReaderState'
    | 'setChapterIndex'
    | 'setMode'
  >;
  uiBridge?: Pick<
    ReaderUiBridgeValue,
    | 'chapterChangeSourceRef'
    | 'contentRef'
    | 'getCurrentAnchorRef'
    | 'getCurrentOriginalLocatorRef'
    | 'getCurrentPagedLocatorRef'
    | 'isScrollSyncSuppressedRef'
    | 'pagedStateRef'
    | 'restoreSettledHandlerRef'
    | 'suppressScrollSyncTemporarilyRef'
  >;
  currentChapter: ChapterContent | null;
  summaryRestoreSignal: unknown;
  isChapterAnalysisLoading: boolean;
}

interface UseReaderRestoreFlowResult {
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

export function useReaderRestoreFlow({
  sessionSnapshot,
  sessionCommands,
  uiBridge,
  currentChapter,
  summaryRestoreSignal,
  isChapterAnalysisLoading,
}: UseReaderRestoreFlowParams): UseReaderRestoreFlowResult {
  const readerContext = useReaderContext();
  const storeLastContentMode = useReaderSessionSelector((state) => state.lastContentMode);
  const storePendingRestoreTarget = useReaderSessionSelector((state) => state.pendingRestoreTarget);
  const {
    chapterIndex,
    lastContentMode,
    mode,
    pendingRestoreTarget,
    viewMode,
  } = sessionSnapshot ?? {
    chapterIndex: readerContext.chapterIndex ?? 0,
    lastContentMode: readerContext.lastContentMode ?? storeLastContentMode,
    mode: readerContext.mode ?? 'scroll',
    pendingRestoreTarget: readerContext.pendingRestoreTarget ?? storePendingRestoreTarget,
    viewMode: readerContext.viewMode ?? 'original',
  };
  const {
    latestReaderStateRef = readerContext.latestReaderStateRef ?? { current: {} },
    markUserInteracted = () => undefined,
    persistReaderState = () => undefined,
    setChapterIndex = () => undefined,
    setMode = () => undefined,
  } = sessionCommands ?? readerContext;
  const {
    chapterChangeSourceRef,
    contentRef,
    getCurrentAnchorRef,
    getCurrentOriginalLocatorRef,
    getCurrentPagedLocatorRef,
    isScrollSyncSuppressedRef,
    pagedStateRef,
    restoreSettledHandlerRef,
    suppressScrollSyncTemporarilyRef,
  } = uiBridge ?? readerContext;
  const pendingRestoreTargetRef = useRef<ReaderRestoreTarget | null>(pendingRestoreTarget);
  const captureCurrentReaderPositionRef = useRef<
    (options?: { flush?: boolean }) => StoredReaderState
      >(() => ({}));
  const modeSnapshotRef = useRef<Record<ReaderMode, ReaderRestoreTarget | null>>({
    paged: null,
    scroll: null,
    summary: null,
  });
  const summaryProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollSyncReleaseFrameRef = useRef<number | null>(null);
  const getOriginalLocator = getCurrentOriginalLocatorRef;
  const getPagedLocator = getCurrentPagedLocatorRef;
  const isActiveChapterResolved = currentChapter?.index === chapterIndex;

  useEffect(() => {
    pendingRestoreTargetRef.current = pendingRestoreTarget;
  }, [pendingRestoreTarget]);

  const getPagedProgress = useCallback(() => {
    const { pageCount, pageIndex } = pagedStateRef.current;
    if (pageCount <= 1) return 0;
    return clampProgress(pageIndex / (pageCount - 1));
  }, [pagedStateRef]);

  const toRestoreTarget = useCallback((state: StoredReaderState): ReaderRestoreTarget => {
    const target: ReaderRestoreTarget = {
      chapterIndex: state.chapterIndex ?? chapterIndex,
      mode: state.mode ?? mode,
      locatorVersion: state.locator ? 1 : undefined,
      locator: state.locator,
    };

    if (!state.locator || target.mode === 'summary') {
      target.chapterProgress = typeof state.chapterProgress === 'number'
        ? clampProgress(state.chapterProgress)
        : undefined;
      target.scrollPosition =
        typeof state.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
          ? state.scrollPosition
          : undefined;
    }

    return target;
  }, [chapterIndex, mode]);

  const setPendingRestoreTarget = useCallback(
    (nextTarget: ReaderRestoreTarget | null, options?: { force?: boolean }) => {
      if (!nextTarget) {
        setStorePendingRestoreTarget(null);
        return;
      }

      if (options?.force) {
        setStorePendingRestoreTarget(nextTarget);
        return;
      }

      setStorePendingRestoreTarget(
        shouldKeepReaderRestoreMask(nextTarget)
          ? nextTarget
          : null,
      );
    },
    [],
  );

  const clearPendingRestoreTarget = useCallback(() => {
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
    isScrollSyncSuppressedRef.current = true;

    if (scrollSyncReleaseFrameRef.current !== null) {
      cancelAnimationFrame(scrollSyncReleaseFrameRef.current);
      scrollSyncReleaseFrameRef.current = null;
    }

    const releaseAfterLayout = () => {
      scrollSyncReleaseFrameRef.current = requestAnimationFrame(() => {
        isScrollSyncSuppressedRef.current = false;
        scrollSyncReleaseFrameRef.current = null;
      });
    };

    scrollSyncReleaseFrameRef.current = requestAnimationFrame(releaseAfterLayout);
  }, [isScrollSyncSuppressedRef]);

  suppressScrollSyncTemporarilyRef.current = suppressScrollSyncTemporarily;

  const rememberModeState = useCallback((target: ReaderRestoreTarget) => {
    modeSnapshotRef.current[target.mode] = target;
  }, []);

  const captureCurrentReaderPosition = useCallback(
    (options?: { flush?: boolean }): StoredReaderState => {
      const storedReaderState = getStoredReaderStateSnapshot();
      const shouldPreferLatestReaderState =
        chapterChangeSourceRef.current === 'navigation' ||
        latestReaderStateRef.current.chapterIndex !== chapterIndex ||
        latestReaderStateRef.current.mode !== mode;
      const preferredReaderState = shouldPreferLatestReaderState
        ? latestReaderStateRef.current
        : storedReaderState;
      let nextState: StoredReaderState = {
        chapterIndex:
          preferredReaderState.chapterIndex ?? storedReaderState.chapterIndex ?? chapterIndex,
        mode,
      };

      if (mode === 'paged') {
        const locator = getPagedLocator.current();
        if (locator) {
          nextState.chapterIndex = locator.chapterIndex;
          nextState.locatorVersion = 1;
          nextState.locator = locator;
          nextState.chapterProgress = undefined;
          nextState.scrollPosition = undefined;
        } else {
          nextState.chapterProgress = getPagedProgress();
        }
      } else if (mode === 'summary') {
        nextState.chapterProgress = getContainerProgress(contentRef.current);
        nextState.locatorVersion = undefined;
        nextState.locator = undefined;
      } else {
        const anchor = shouldPreferLatestReaderState ? null : getCurrentAnchorRef.current();
        const locator = shouldPreferLatestReaderState ? null : getOriginalLocator.current();
        if (anchor) {
          nextState = {
            ...nextState,
            chapterIndex: locator?.chapterIndex ?? anchor.chapterIndex,
            chapterProgress: locator ? undefined : clampProgress(anchor.chapterProgress),
            locatorVersion: locator ? 1 : undefined,
            locator: locator ?? undefined,
            scrollPosition: undefined,
          };
        } else if (shouldPreferLatestReaderState) {
          let preferredChapterProgress: number | undefined;
          let preferredScrollPosition: number | undefined;
          if (!preferredReaderState.locator) {
            if (typeof preferredReaderState.chapterProgress === 'number') {
              preferredChapterProgress = clampProgress(preferredReaderState.chapterProgress);
            }
            if (
              typeof preferredReaderState.scrollPosition === 'number'
              && Number.isFinite(preferredReaderState.scrollPosition)
            ) {
              preferredScrollPosition = preferredReaderState.scrollPosition;
            }
          }
          nextState = {
            ...nextState,
            chapterIndex:
              preferredReaderState.locator?.chapterIndex
              ?? preferredReaderState.chapterIndex
              ?? nextState.chapterIndex,
            chapterProgress: preferredChapterProgress,
            scrollPosition: preferredScrollPosition,
            locatorVersion: preferredReaderState.locator ? 1 : undefined,
            locator: preferredReaderState.locator,
          };
        } else if (latestReaderStateRef.current.locator) {
          nextState.chapterIndex = latestReaderStateRef.current.locator.chapterIndex;
          nextState.chapterProgress = undefined;
          nextState.scrollPosition = undefined;
          nextState.locatorVersion = 1;
          nextState.locator = latestReaderStateRef.current.locator;
        } else if (typeof latestReaderStateRef.current.chapterProgress === 'number') {
          nextState.chapterProgress = latestReaderStateRef.current.chapterProgress;
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
      chapterChangeSourceRef,
      contentRef,
      getCurrentAnchorRef,
      getOriginalLocator,
      getPagedLocator,
      getPagedProgress,
      latestReaderStateRef,
      mode,
      persistReaderState,
      rememberModeState,
      toRestoreTarget,
    ],
  );

  useEffect(() => {
    captureCurrentReaderPositionRef.current = captureCurrentReaderPosition;
  }, [captureCurrentReaderPosition]);

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
    const nextMode: ReaderMode = nextViewMode === 'summary'
      ? 'summary'
      : lastContentMode;
    const matchingSnapshot = modeSnapshotRef.current[nextMode];
    const canReuseSnapshot = matchingSnapshot
      && matchingSnapshot.chapterIndex === currentReaderState.chapterIndex;
    let nextLastContentMode: ReaderMode;
    if (nextMode === 'summary') {
      nextLastContentMode = mode === 'summary' ? lastContentMode : mode;
    } else {
      nextLastContentMode = nextMode;
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
        scrollPosition: undefined,
        locatorBoundary: undefined,
        locatorVersion: undefined,
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
      scrollPosition: targetRestoreTarget.scrollPosition,
      locatorVersion: targetRestoreTarget.locatorVersion,
      locator: targetRestoreTarget.locator,
      lastContentMode: nextLastContentMode,
    });
  }, [
    captureCurrentReaderPosition,
    lastContentMode,
    markUserInteracted,
    mode,
    persistReaderState,
    rememberModeState,
    setChapterIndex,
    setPendingRestoreTarget,
    setMode,
    toRestoreTarget,
    chapterIndex,
    viewMode,
  ]);

  useEffect(() => {
    if (!isActiveChapterResolved || mode !== 'summary') return;

    const pendingTarget = pendingRestoreTargetRef.current;
    if (!pendingTarget || pendingTarget.mode !== 'summary' || !contentRef.current) return;
    if (canSkipReaderRestore(pendingTarget)) {
      clearPendingRestoreTarget();
      stopRestoreMask();
      restoreSettledHandlerRef.current('skipped');
      return;
    }

    const container = contentRef.current;
    const frameId = requestAnimationFrame(() => {
      chapterChangeSourceRef.current = 'restore';
      suppressScrollSyncTemporarily();
      if (typeof pendingTarget.chapterProgress === 'number') {
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (maxScroll > 0) {
          container.scrollTop = Math.round(
            maxScroll * clampProgress(pendingTarget.chapterProgress),
          );
        }
      } else if (typeof pendingTarget.scrollPosition === 'number') {
        container.scrollTop = pendingTarget.scrollPosition;
      }
      chapterChangeSourceRef.current = null;
      clearPendingRestoreTarget();
      stopRestoreMask();
      restoreSettledHandlerRef.current('completed');
    });

    return () => cancelAnimationFrame(frameId);
  }, [
    chapterIndex,
    chapterChangeSourceRef,
    clearPendingRestoreTarget,
    contentRef,
    currentChapter,
    isChapterAnalysisLoading,
    isActiveChapterResolved,
    mode,
    restoreSettledHandlerRef,
    stopRestoreMask,
    summaryRestoreSignal,
    suppressScrollSyncTemporarily,
  ]);

  useEffect(() => {
    const handlePageHide = () => {
      captureCurrentReaderPosition({ flush: true });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        captureCurrentReaderPosition({ flush: true });
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [captureCurrentReaderPosition]);

  useEffect(() => {
    return () => {
      captureCurrentReaderPositionRef.current({ flush: true });
    };
  }, []);

  useEffect(() => {
    return () => {
      if (summaryProgressTimerRef.current) {
        clearTimeout(summaryProgressTimerRef.current);
      }
      if (scrollSyncReleaseFrameRef.current !== null) {
        cancelAnimationFrame(scrollSyncReleaseFrameRef.current);
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
    if (isScrollSyncSuppressedRef.current) return;

    if (mode !== 'summary' || pendingRestoreTargetRef.current) return;

    if (summaryProgressTimerRef.current) {
      clearTimeout(summaryProgressTimerRef.current);
    }

    summaryProgressTimerRef.current = setTimeout(() => {
      persistReaderState({
        chapterIndex,
        chapterProgress: getContainerProgress(contentRef.current),
      });
    }, 150);
  }, [
    chapterIndex,
    contentRef,
    mode,
    persistReaderState,
    isScrollSyncSuppressedRef,
  ]);

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
