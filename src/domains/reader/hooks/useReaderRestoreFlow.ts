import { useCallback, useEffect, useRef } from 'react';
import type { ChapterContent } from '../api/readerApi';
import type { ChapterChangeSource } from './navigationTypes';
import type { ReaderMode, ReaderRestoreTarget, StoredReaderState } from './useReaderStatePersistence';
import {
  beginRestore,
  completeRestore,
  getStoredReaderStateSnapshot,
  setRestoreStatus,
  setPendingRestoreTarget as setStorePendingRestoreTarget,
  useReaderSessionSelector,
} from './sessionStore';
import {
  canSkipReaderRestore,
  clampProgress,
  getContainerProgress,
  shouldKeepReaderRestoreMask,
} from '../utils/readerPosition';
import { getReaderViewMode } from '../utils/readerMode';
import { useReaderPageContext } from '../pages/reader-page/ReaderPageContext';

interface UseReaderRestoreFlowParams {
  chapterIndex: number;
  setChapterIndex: React.Dispatch<React.SetStateAction<number>>;
  chapterChangeSourceRef?: React.MutableRefObject<ChapterChangeSource>;
  mode: ReaderMode;
  setMode: React.Dispatch<React.SetStateAction<ReaderMode>>;
  pagedStateRef: React.MutableRefObject<{ pageCount: number; pageIndex: number }>;
  currentChapter: ChapterContent | null;
  summaryRestoreSignal: unknown;
  isChapterAnalysisLoading: boolean;
  onRestoreSettled?: (result: 'completed' | 'skipped' | 'failed') => void;
}

interface UseReaderRestoreFlowResult {
  chapterChangeSourceRef: React.MutableRefObject<ChapterChangeSource>;
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
  chapterIndex,
  setChapterIndex,
  chapterChangeSourceRef: externalChapterChangeSourceRef,
  mode,
  setMode,
  pagedStateRef,
  currentChapter,
  summaryRestoreSignal,
  isChapterAnalysisLoading,
  onRestoreSettled,
}: UseReaderRestoreFlowParams): UseReaderRestoreFlowResult {
  const {
    latestReaderStateRef,
    markUserInteracted,
    persistReaderState,
    contentRef,
    getCurrentAnchorRef,
    getCurrentOriginalLocatorRef,
    getCurrentPagedLocatorRef,
  } = useReaderPageContext();
  const internalChapterChangeSourceRef = useRef<ChapterChangeSource>(null);
  const chapterChangeSourceRef = externalChapterChangeSourceRef ?? internalChapterChangeSourceRef;
  const pendingRestoreTarget = useReaderSessionSelector((state) => state.pendingRestoreTarget);
  const lastContentMode = useReaderSessionSelector((state) => state.lastContentMode);
  const pendingRestoreTargetRef = useRef<ReaderRestoreTarget | null>(pendingRestoreTarget);
  const modeSnapshotRef = useRef<Record<ReaderMode, ReaderRestoreTarget | null>>({
    paged: null,
    scroll: null,
    summary: null,
  });
  const summaryProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollSyncRef = useRef(false);
  const scrollSyncReleaseFrameRef = useRef<number | null>(null);
  const getOriginalLocator = getCurrentOriginalLocatorRef;
  const getPagedLocator = getCurrentPagedLocatorRef;
  const isActiveChapterResolved = currentChapter?.index === chapterIndex;
  const viewMode = getReaderViewMode(mode);

  useEffect(() => {
    pendingRestoreTargetRef.current = pendingRestoreTarget;
  }, [pendingRestoreTarget]);

  const getPagedProgress = useCallback(() => {
    const { pageCount, pageIndex } = pagedStateRef.current;
    if (pageCount <= 1) return 0;
    return clampProgress(pageIndex / (pageCount - 1));
  }, [pagedStateRef]);

  const toRestoreTarget = useCallback((state: StoredReaderState): ReaderRestoreTarget => {
    return {
      chapterIndex: state.chapterIndex ?? chapterIndex,
      mode: state.mode ?? mode,
      chapterProgress: typeof state.chapterProgress === 'number'
        ? clampProgress(state.chapterProgress)
        : undefined,
      scrollPosition: typeof state.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
        ? state.scrollPosition
        : undefined,
      locatorVersion: state.locator ? 1 : undefined,
      locator: state.locator,
    };
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
      setRestoreStatus('ready');
    },
    [],
  );

  const stopRestoreMask = useCallback(() => {
    completeRestore();
  }, []);

  const suppressScrollSyncTemporarily = useCallback(() => {
    suppressScrollSyncRef.current = true;

    if (scrollSyncReleaseFrameRef.current !== null) {
      cancelAnimationFrame(scrollSyncReleaseFrameRef.current);
      scrollSyncReleaseFrameRef.current = null;
    }

    const releaseAfterLayout = () => {
      scrollSyncReleaseFrameRef.current = requestAnimationFrame(() => {
        suppressScrollSyncRef.current = false;
        scrollSyncReleaseFrameRef.current = null;
      });
    };

    scrollSyncReleaseFrameRef.current = requestAnimationFrame(releaseAfterLayout);
  }, []);

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
        nextState.chapterProgress = getPagedProgress();
        const locator = getPagedLocator.current();
        if (locator) {
          nextState.chapterIndex = locator.chapterIndex;
          nextState.locatorVersion = 1;
          nextState.locator = locator;
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
            chapterIndex: anchor.chapterIndex,
            chapterProgress: clampProgress(anchor.chapterProgress),
            locatorVersion: locator ? 1 : undefined,
            locator: locator ?? undefined,
          };
        } else if (shouldPreferLatestReaderState) {
          nextState = {
            ...nextState,
            chapterIndex: preferredReaderState.chapterIndex ?? nextState.chapterIndex,
            chapterProgress:
              typeof preferredReaderState.chapterProgress === 'number'
                ? clampProgress(preferredReaderState.chapterProgress)
                : undefined,
            scrollPosition:
              typeof preferredReaderState.scrollPosition === 'number' &&
              Number.isFinite(preferredReaderState.scrollPosition)
                ? preferredReaderState.scrollPosition
                : undefined,
            locatorVersion: preferredReaderState.locator ? 1 : undefined,
            locator: preferredReaderState.locator,
          };
        } else if (typeof latestReaderStateRef.current.chapterProgress === 'number') {
          nextState.chapterProgress = latestReaderStateRef.current.chapterProgress;
          nextState.locatorVersion = latestReaderStateRef.current.locator ? 1 : undefined;
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
    const targetRestoreTarget: ReaderRestoreTarget = canReuseSnapshot
      ? {
        ...toRestoreTarget(currentReaderState),
        ...matchingSnapshot,
        mode: nextMode,
      }
      : {
        ...toRestoreTarget(currentReaderState),
        mode: nextMode,
        chapterProgress: 0,
        scrollPosition: undefined,
        locatorVersion: undefined,
        locator: undefined,
      };

    markUserInteracted();
    setChapterIndex(targetRestoreTarget.chapterIndex);
    rememberModeState(targetRestoreTarget);
    setPendingRestoreTarget(targetRestoreTarget, { force: true });
    setMode(nextMode);
    persistReaderState({
      ...targetRestoreTarget,
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
    viewMode,
  ]);

  useEffect(() => {
    if (!isActiveChapterResolved || mode !== 'summary') return;

    const pendingTarget = pendingRestoreTargetRef.current;
    if (!pendingTarget || pendingTarget.mode !== 'summary' || !contentRef.current) return;
    if (canSkipReaderRestore(pendingTarget)) {
      clearPendingRestoreTarget();
      stopRestoreMask();
      onRestoreSettled?.('skipped');
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
      onRestoreSettled?.('completed');
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
    onRestoreSettled,
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
    if (suppressScrollSyncRef.current) return;

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
  ]);

  return {
    chapterChangeSourceRef,
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
