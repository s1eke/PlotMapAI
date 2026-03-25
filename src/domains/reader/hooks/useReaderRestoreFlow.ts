import { useCallback, useEffect, useRef } from 'react';
import type { ChapterContent } from '../api/readerApi';
import type { ScrollModeAnchor } from './useScrollModeChapters';
import type { StoredReaderState } from './useReaderStatePersistence';
import {
  beginRestore,
  completeRestore,
  getStoredReaderStateSnapshot,
  setPendingRestoreState as setStorePendingRestoreState,
  useReaderSessionSelector,
} from './sessionStore';
import {
  clampProgress,
  getContainerProgress,
  shouldMaskReaderPositionRestore,
} from '../utils/readerPosition';

type ChapterChangeSource = 'navigation' | 'scroll' | 'restore' | null;

interface UseReaderRestoreFlowParams {
  novelId: number;
  chapterIndex: number;
  setChapterIndex: React.Dispatch<React.SetStateAction<number>>;
  viewMode: 'original' | 'summary';
  setViewMode: React.Dispatch<React.SetStateAction<'original' | 'summary'>>;
  isTwoColumn: boolean;
  setIsTwoColumn: React.Dispatch<React.SetStateAction<boolean>>;
  isPagedMode: boolean;
  pageIndex: number;
  pageCount: number;
  currentChapter: ChapterContent | null;
  isLoading: boolean;
  scrollModeChapters: number[];
  contentRef: React.RefObject<HTMLDivElement | null>;
  scrollChapterElementsRef: React.MutableRefObject<Map<number, HTMLDivElement>>;
  latestReaderStateRef: React.MutableRefObject<StoredReaderState>;
  hasHydratedReaderState: boolean;
  markUserInteracted: () => void;
  persistReaderState: (state: StoredReaderState, options?: { flush?: boolean }) => void;
  getCurrentAnchorRef: React.MutableRefObject<() => ScrollModeAnchor | null>;
  handleScrollModeScrollRef: React.MutableRefObject<() => void>;
  readingAnchorHandlerRef: React.MutableRefObject<(anchor: ScrollModeAnchor) => void>;
  summaryRestoreSignal: unknown;
  isChapterAnalysisLoading: boolean;
}

interface UseReaderRestoreFlowResult {
  chapterChangeSourceRef: React.MutableRefObject<ChapterChangeSource>;
  pendingRestoreStateRef: React.MutableRefObject<StoredReaderState | null>;
  isRestoringPosition: boolean;
  captureCurrentReaderPosition: (options?: { flush?: boolean }) => StoredReaderState;
  clearPendingRestoreState: () => void;
  handleBeforeChapterChange: () => void;
  handleContentScroll: () => void;
  handleSetIsTwoColumn: (twoColumn: boolean) => void;
  handleSetViewMode: (viewMode: 'original' | 'summary') => void;
  setPendingRestoreState: (nextState: StoredReaderState | null, options?: { force?: boolean }) => void;
  startRestoreMaskForState: (state: StoredReaderState | null | undefined) => void;
  stopRestoreMask: () => void;
  suppressScrollSyncTemporarily: () => void;
}

export function useReaderRestoreFlow({
  novelId,
  chapterIndex,
  setChapterIndex,
  viewMode,
  setViewMode,
  isTwoColumn,
  setIsTwoColumn,
  isPagedMode,
  pageIndex,
  pageCount,
  currentChapter,
  isLoading,
  scrollModeChapters,
  contentRef,
  scrollChapterElementsRef,
  latestReaderStateRef,
  hasHydratedReaderState,
  markUserInteracted,
  persistReaderState,
  getCurrentAnchorRef,
  handleScrollModeScrollRef,
  readingAnchorHandlerRef,
  summaryRestoreSignal,
  isChapterAnalysisLoading,
}: UseReaderRestoreFlowParams): UseReaderRestoreFlowResult {
  const chapterChangeSourceRef = useRef<ChapterChangeSource>(null);
  const pendingRestoreState = useReaderSessionSelector(state => state.pendingRestoreState);
  const restoreStatus = useReaderSessionSelector(state => state.restoreStatus);
  const pendingRestoreStateRef = useRef<StoredReaderState | null>(pendingRestoreState);
  const originalViewStateRef = useRef<StoredReaderState | null>(null);
  const summaryViewStateRef = useRef<StoredReaderState | null>(null);
  const summaryProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollSyncRef = useRef(false);
  const scrollSyncReleaseFrameRef = useRef<number | null>(null);

  useEffect(() => {
    pendingRestoreStateRef.current = pendingRestoreState;
  }, [pendingRestoreState]);

  const getPagedProgress = useCallback(() => {
    if (pageCount <= 1) return 0;
    return clampProgress(pageIndex / (pageCount - 1));
  }, [pageCount, pageIndex]);

  const setPendingRestoreState = useCallback((nextState: StoredReaderState | null, options?: { force?: boolean }) => {
    if (!nextState) {
      setStorePendingRestoreState(null);
      return;
    }

    if (options?.force) {
      setStorePendingRestoreState(nextState);
      return;
    }

    const hasChapterProgress = typeof nextState.chapterProgress === 'number' && nextState.chapterProgress > 0;
    const hasLegacyScrollPosition = typeof nextState.scrollPosition === 'number' && nextState.scrollPosition > 0;
    setStorePendingRestoreState(hasChapterProgress || hasLegacyScrollPosition ? nextState : null);
  }, []);

  const clearPendingRestoreState = useCallback(() => {
    setStorePendingRestoreState(null);
  }, []);

  const startRestoreMaskForState = useCallback((state: StoredReaderState | null | undefined) => {
    if (shouldMaskReaderPositionRestore(state)) {
      beginRestore(state);
      return;
    }
    completeRestore();
  }, []);

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

  const rememberViewState = useCallback((state: StoredReaderState) => {
    const normalizedState: StoredReaderState = {
      chapterIndex: state.chapterIndex,
      viewMode: state.viewMode,
      isTwoColumn: state.isTwoColumn,
      chapterProgress: typeof state.chapterProgress === 'number'
        ? clampProgress(state.chapterProgress)
        : undefined,
      scrollPosition: typeof state.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
        ? state.scrollPosition
        : undefined,
    };

    if (normalizedState.viewMode === 'summary') {
      summaryViewStateRef.current = normalizedState;
      return;
    }

    originalViewStateRef.current = normalizedState;
  }, []);

  const handleReadingAnchorChange = useCallback((anchor: ScrollModeAnchor) => {
    if (isPagedMode || viewMode !== 'original') return;
    if (pendingRestoreStateRef.current) return;
    if (suppressScrollSyncRef.current) return;
    if (chapterChangeSourceRef.current === 'navigation' || chapterChangeSourceRef.current === 'restore') return;

    persistReaderState({
      chapterIndex: anchor.chapterIndex,
      chapterProgress: clampProgress(anchor.chapterProgress),
    });

    if (anchor.chapterIndex === chapterIndex) return;
    chapterChangeSourceRef.current = 'scroll';
    setChapterIndex(anchor.chapterIndex);
  }, [chapterIndex, isPagedMode, persistReaderState, setChapterIndex, viewMode]);

  useEffect(() => {
    readingAnchorHandlerRef.current = handleReadingAnchorChange;
    return () => {
      readingAnchorHandlerRef.current = () => {};
    };
  }, [handleReadingAnchorChange, readingAnchorHandlerRef]);

  const captureCurrentReaderPosition = useCallback((options?: { flush?: boolean }): StoredReaderState => {
    const storedReaderState = getStoredReaderStateSnapshot();
    const shouldPreferLatestReaderState = chapterChangeSourceRef.current === 'navigation'
      || latestReaderStateRef.current.chapterIndex !== chapterIndex
      || latestReaderStateRef.current.viewMode !== viewMode
      || latestReaderStateRef.current.isTwoColumn !== isTwoColumn;
    const preferredReaderState = shouldPreferLatestReaderState
      ? latestReaderStateRef.current
      : storedReaderState;
    let nextState: StoredReaderState = {
      chapterIndex: preferredReaderState.chapterIndex ?? storedReaderState.chapterIndex ?? chapterIndex,
      viewMode,
      isTwoColumn,
    };

    if (isPagedMode) {
      nextState.chapterProgress = getPagedProgress();
    } else if (viewMode === 'summary') {
      nextState.chapterProgress = getContainerProgress(contentRef.current);
    } else {
      const anchor = shouldPreferLatestReaderState ? null : getCurrentAnchorRef.current();
      if (anchor) {
        nextState = {
          ...nextState,
          chapterIndex: anchor.chapterIndex,
          chapterProgress: clampProgress(anchor.chapterProgress),
        };
      } else if (shouldPreferLatestReaderState) {
        nextState = {
          ...nextState,
          chapterIndex: preferredReaderState.chapterIndex ?? nextState.chapterIndex,
          chapterProgress: typeof preferredReaderState.chapterProgress === 'number'
            ? clampProgress(preferredReaderState.chapterProgress)
            : undefined,
          scrollPosition: typeof preferredReaderState.scrollPosition === 'number' && Number.isFinite(preferredReaderState.scrollPosition)
            ? preferredReaderState.scrollPosition
            : undefined,
        };
      } else if (typeof latestReaderStateRef.current.chapterProgress === 'number') {
        nextState.chapterProgress = latestReaderStateRef.current.chapterProgress;
      }
    }

    rememberViewState(nextState);
    persistReaderState(nextState, { flush: options?.flush });
    return {
      ...latestReaderStateRef.current,
      ...nextState,
    };
  }, [
    chapterIndex,
    contentRef,
    getCurrentAnchorRef,
    getPagedProgress,
    isPagedMode,
    isTwoColumn,
    latestReaderStateRef,
    persistReaderState,
    rememberViewState,
    viewMode,
  ]);

  const handleSetIsTwoColumn = useCallback((twoColumn: boolean) => {
    if (twoColumn === isTwoColumn) return;

    const currentReaderState = captureCurrentReaderPosition();
    markUserInteracted();
    if (typeof currentReaderState.chapterIndex === 'number') {
      setChapterIndex(currentReaderState.chapterIndex);
    }
    setPendingRestoreState({
      ...currentReaderState,
      isTwoColumn: twoColumn,
    }, { force: true });
    setIsTwoColumn(twoColumn);
    persistReaderState({
      ...currentReaderState,
      isTwoColumn: twoColumn,
    });
  }, [captureCurrentReaderPosition, isTwoColumn, markUserInteracted, persistReaderState, setChapterIndex, setIsTwoColumn, setPendingRestoreState]);

  const handleSetViewMode = useCallback((nextViewMode: 'original' | 'summary') => {
    if (nextViewMode === viewMode) return;

    const currentReaderState = captureCurrentReaderPosition();
    const matchingSnapshot = nextViewMode === 'original'
      ? originalViewStateRef.current
      : summaryViewStateRef.current;
    const canReuseSnapshot = matchingSnapshot
      && matchingSnapshot.chapterIndex === currentReaderState.chapterIndex;
    const targetRestoreState: StoredReaderState = canReuseSnapshot
      ? {
          ...currentReaderState,
          ...matchingSnapshot,
          viewMode: nextViewMode,
          isTwoColumn: currentReaderState.isTwoColumn,
        }
      : {
          ...currentReaderState,
          viewMode: nextViewMode,
          chapterProgress: 0,
          scrollPosition: undefined,
        };

    markUserInteracted();
    if (typeof targetRestoreState.chapterIndex === 'number') {
      setChapterIndex(targetRestoreState.chapterIndex);
    }
    rememberViewState(targetRestoreState);
    setPendingRestoreState(targetRestoreState, { force: true });
    setViewMode(nextViewMode);
    persistReaderState(targetRestoreState);
  }, [captureCurrentReaderPosition, markUserInteracted, persistReaderState, rememberViewState, setChapterIndex, setPendingRestoreState, setViewMode, viewMode]);

  useEffect(() => {
    if (isLoading || viewMode !== 'original' || isPagedMode) return;

    const pendingRestoreState = pendingRestoreStateRef.current;
    if (!pendingRestoreState) return;

    let frameId = 0;
    let cancelled = false;

    const restoreScrollPosition = () => {
      if (cancelled) return;

      const container = contentRef.current;
      const targetIndex = pendingRestoreState.chapterIndex ?? chapterIndex;
      const targetElement = scrollChapterElementsRef.current.get(targetIndex);

        if (!container || !targetElement) {
          frameId = requestAnimationFrame(restoreScrollPosition);
          return;
      }

      chapterChangeSourceRef.current = 'restore';
      suppressScrollSyncTemporarily();
      if (typeof pendingRestoreState.chapterProgress === 'number') {
        container.scrollTop = Math.round(
          targetElement.offsetTop + targetElement.offsetHeight * clampProgress(pendingRestoreState.chapterProgress),
        );
      } else if (typeof pendingRestoreState.scrollPosition === 'number') {
        container.scrollTop = pendingRestoreState.scrollPosition;
      }
      chapterChangeSourceRef.current = null;
      clearPendingRestoreState();
      stopRestoreMask();
    };

    frameId = requestAnimationFrame(restoreScrollPosition);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    chapterIndex,
    clearPendingRestoreState,
    contentRef,
    currentChapter,
    isLoading,
    isPagedMode,
    scrollChapterElementsRef,
    scrollModeChapters,
    stopRestoreMask,
    suppressScrollSyncTemporarily,
    viewMode,
  ]);

  useEffect(() => {
    if (isLoading || viewMode !== 'summary') return;

    const pendingRestoreState = pendingRestoreStateRef.current;
    if (!pendingRestoreState || !contentRef.current) return;

    const container = contentRef.current;
    const frameId = requestAnimationFrame(() => {
      chapterChangeSourceRef.current = 'restore';
      suppressScrollSyncTemporarily();
      if (typeof pendingRestoreState.chapterProgress === 'number') {
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (maxScroll > 0) {
          container.scrollTop = Math.round(maxScroll * clampProgress(pendingRestoreState.chapterProgress));
        }
      } else if (typeof pendingRestoreState.scrollPosition === 'number') {
        container.scrollTop = pendingRestoreState.scrollPosition;
      }
      chapterChangeSourceRef.current = null;
      clearPendingRestoreState();
      stopRestoreMask();
    });

    return () => cancelAnimationFrame(frameId);
  }, [
    chapterIndex,
    clearPendingRestoreState,
    contentRef,
    currentChapter,
    isChapterAnalysisLoading,
    isLoading,
    stopRestoreMask,
    summaryRestoreSignal,
    suppressScrollSyncTemporarily,
    viewMode,
  ]);

  useEffect(() => {
    if (!novelId || !hasHydratedReaderState) return;
    persistReaderState({ chapterIndex, viewMode, isTwoColumn });
  }, [chapterIndex, hasHydratedReaderState, isTwoColumn, novelId, persistReaderState, viewMode]);

  useEffect(() => {
    if (!isPagedMode || isLoading || pendingRestoreStateRef.current) return;
    persistReaderState({
      chapterIndex,
      chapterProgress: getPagedProgress(),
    });
  }, [chapterIndex, getPagedProgress, isLoading, isPagedMode, pageIndex, pageCount, persistReaderState]);

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
  }, [chapterIndex, isPagedMode, viewMode]);

  const handleBeforeChapterChange = useCallback(() => {
    clearPendingRestoreState();
    stopRestoreMask();
    suppressScrollSyncTemporarily();
  }, [clearPendingRestoreState, stopRestoreMask, suppressScrollSyncTemporarily]);

  const handleContentScroll = useCallback(() => {
    if (suppressScrollSyncRef.current) return;

    if (viewMode === 'original' && !isPagedMode) {
      handleScrollModeScrollRef.current();
      return;
    }

    if (isPagedMode || viewMode !== 'summary' || pendingRestoreStateRef.current) return;

    if (summaryProgressTimerRef.current) {
      clearTimeout(summaryProgressTimerRef.current);
    }

    summaryProgressTimerRef.current = setTimeout(() => {
      persistReaderState({
        chapterIndex,
        chapterProgress: getContainerProgress(contentRef.current),
      });
    }, 150);
  }, [chapterIndex, contentRef, handleScrollModeScrollRef, isPagedMode, persistReaderState, viewMode]);

  return {
    chapterChangeSourceRef,
    pendingRestoreStateRef,
    isRestoringPosition: restoreStatus === 'restoring',
    captureCurrentReaderPosition,
    clearPendingRestoreState,
    handleBeforeChapterChange,
    handleContentScroll,
    handleSetIsTwoColumn,
    handleSetViewMode,
    setPendingRestoreState,
    startRestoreMaskForState,
    stopRestoreMask,
    suppressScrollSyncTemporarily,
  };
}
