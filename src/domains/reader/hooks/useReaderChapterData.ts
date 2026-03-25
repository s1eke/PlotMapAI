import { useCallback, useEffect, useRef } from 'react';
import { readerApi } from '../api/readerApi';
import type { Chapter, ChapterContent } from '../api/readerApi';
import type { PageTarget, StoredReaderState } from './useReaderStatePersistence';

type ChapterChangeSource = 'navigation' | 'scroll' | 'restore' | null;

interface UseReaderChapterDataParams {
  novelId: number;
  chapterIndex: number;
  viewMode: 'original' | 'summary';
  isPagedMode: boolean;
  isTwoColumn: boolean;
  chapters: Chapter[];
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
  setCurrentChapter: React.Dispatch<React.SetStateAction<ChapterContent | null>>;
  setCurrentChapterWindow: React.Dispatch<React.SetStateAction<number[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setChapterIndex: React.Dispatch<React.SetStateAction<number>>;
  setViewMode: React.Dispatch<React.SetStateAction<'original' | 'summary'>>;
  setIsTwoColumn: React.Dispatch<React.SetStateAction<boolean>>;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  setPageCount: React.Dispatch<React.SetStateAction<number>>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  pagedViewportRef: React.RefObject<HTMLDivElement | null>;
  chapterCacheRef: React.MutableRefObject<Map<number, ChapterContent>>;
  latestReaderStateRef: React.MutableRefObject<StoredReaderState>;
  hasUserInteractedRef: React.MutableRefObject<boolean>;
  wheelDeltaRef: React.MutableRefObject<number>;
  pageTurnLockedRef: React.MutableRefObject<boolean>;
  pageTargetRef: React.MutableRefObject<PageTarget>;
  chapterChangeSourceRef: React.MutableRefObject<ChapterChangeSource>;
  loadPersistedReaderState: () => Promise<StoredReaderState>;
  setHasHydratedReaderState: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingRestoreState: (nextState: StoredReaderState | null, options?: { force?: boolean }) => void;
  clearPendingRestoreState: () => void;
  suppressScrollSyncTemporarily: () => void;
  startRestoreMaskForState: (state: StoredReaderState | null | undefined) => void;
  stopRestoreMask: () => void;
}

interface UseReaderChapterDataResult {
  fetchChapterContent: (index: number) => Promise<ChapterContent>;
  preloadAdjacent: (index: number, prune?: boolean) => void;
}

export function useReaderChapterData({
  novelId,
  chapterIndex,
  viewMode,
  isPagedMode,
  isTwoColumn,
  chapters,
  setChapters,
  setCurrentChapter,
  setCurrentChapterWindow,
  setIsLoading,
  setChapterIndex,
  setViewMode,
  setIsTwoColumn,
  setPageIndex,
  setPageCount,
  contentRef,
  pagedViewportRef,
  chapterCacheRef,
  latestReaderStateRef,
  hasUserInteractedRef,
  wheelDeltaRef,
  pageTurnLockedRef,
  pageTargetRef,
  chapterChangeSourceRef,
  loadPersistedReaderState,
  setHasHydratedReaderState,
  setPendingRestoreState,
  clearPendingRestoreState,
  suppressScrollSyncTemporarily,
  startRestoreMaskForState,
  stopRestoreMask,
}: UseReaderChapterDataParams): UseReaderChapterDataResult {
  const preloadTimeoutIdsRef = useRef<number[]>([]);

  const clearScheduledPreloads = useCallback(() => {
    preloadTimeoutIdsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    preloadTimeoutIdsRef.current = [];
  }, []);

  const fetchChapterContent = useCallback(async (index: number) => {
    const cached = chapterCacheRef.current.get(index);
    if (cached) return cached;
    const data = await readerApi.getChapterContent(novelId, index);
    chapterCacheRef.current.set(index, data);
    return data;
  }, [chapterCacheRef, novelId]);

  const preloadAdjacent = useCallback((index: number, prune = true) => {
    clearScheduledPreloads();

    const toPreload: number[] = [];
    for (let offset = -3; offset <= 3; offset += 1) {
      if (offset === 0) continue;
      const adjacentIndex = index + offset;
      if (adjacentIndex < 0 || adjacentIndex >= chapters.length) continue;
      if (chapterCacheRef.current.has(adjacentIndex)) continue;
      toPreload.push(adjacentIndex);
    }

    let delay = 50;
    for (const adjacentIndex of toPreload) {
      const timeoutId = window.setTimeout(() => {
        preloadTimeoutIdsRef.current = preloadTimeoutIdsRef.current.filter((id) => id !== timeoutId);
        if (chapterCacheRef.current.has(adjacentIndex)) return;
        readerApi.getChapterContent(novelId, adjacentIndex)
          .then((data) => chapterCacheRef.current.set(adjacentIndex, data))
          .catch(() => {});
      }, delay);
      preloadTimeoutIdsRef.current.push(timeoutId);
      delay += 80;
    }

    if (prune) {
      for (const key of chapterCacheRef.current.keys()) {
        if (Math.abs(key - index) > 3) {
          chapterCacheRef.current.delete(key);
        }
      }
    }
  }, [chapterCacheRef, chapters.length, clearScheduledPreloads, novelId]);

  const updateChapterWindow = useCallback((nextWindow: number[]) => {
    setCurrentChapterWindow((previousWindow) => {
      if (
        previousWindow.length === nextWindow.length
        && previousWindow.every((index, position) => index === nextWindow[position])
      ) {
        return previousWindow;
      }

      return nextWindow;
    });
  }, [setCurrentChapterWindow]);

  useEffect(() => {
    if (!novelId) return;
    let cancelled = false;

    const init = async () => {
      clearScheduledPreloads();
      setIsLoading(true);
      stopRestoreMask();
      setHasHydratedReaderState(false);
      hasUserInteractedRef.current = false;
      chapterChangeSourceRef.current = null;
      chapterCacheRef.current.clear();
      setChapters([]);
      setCurrentChapter(null);
      updateChapterWindow([]);
      setPageIndex(0);
      setPageCount(1);
      clearPendingRestoreState();

      const storedState = await loadPersistedReaderState();
      if (cancelled) return;

      const nextStoredState: StoredReaderState = {
        chapterIndex: storedState.chapterIndex ?? 0,
        viewMode: storedState.viewMode ?? 'original',
        isTwoColumn: storedState.isTwoColumn ?? false,
        chapterProgress: storedState.chapterProgress,
        scrollPosition: storedState.scrollPosition,
      };

      latestReaderStateRef.current = nextStoredState;
      setIsTwoColumn(nextStoredState.isTwoColumn ?? false);
      setViewMode(nextStoredState.viewMode ?? 'original');
      setChapterIndex(nextStoredState.chapterIndex ?? 0);

      try {
        const toc = await readerApi.getChapters(novelId);
        if (cancelled) return;
        setChapters(toc);

        if (!hasUserInteractedRef.current) {
          const fallbackIndex = toc.length > 0 ? toc[0].index : 0;
          const nextChapterIndex = nextStoredState.chapterIndex ?? fallbackIndex;
          const nextViewMode = nextStoredState.viewMode ?? 'original';
          const hasChapter = toc.some((chapter) => chapter.index === nextChapterIndex);
          const resolvedChapterIndex = hasChapter ? nextChapterIndex : fallbackIndex;

          const resolvedState: StoredReaderState = {
            chapterIndex: resolvedChapterIndex,
            viewMode: nextViewMode,
            isTwoColumn: nextStoredState.isTwoColumn,
            chapterProgress: hasChapter ? nextStoredState.chapterProgress : 0,
            scrollPosition: hasChapter ? nextStoredState.scrollPosition : undefined,
          };

          latestReaderStateRef.current = resolvedState;
          setIsTwoColumn(resolvedState.isTwoColumn ?? false);
          setViewMode(nextViewMode);
          setChapterIndex(resolvedChapterIndex);
          setPendingRestoreState(resolvedState, { force: true });
          startRestoreMaskForState(resolvedState);
        }

        if (toc.length === 0) {
          setIsLoading(false);
          stopRestoreMask();
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load reader init data:', error);
          setIsLoading(false);
          stopRestoreMask();
        }
      } finally {
        if (!cancelled) {
          setHasHydratedReaderState(true);
        }
      }
    };

    void init();
    return () => {
      cancelled = true;
      clearScheduledPreloads();
    };
  }, [
    chapterCacheRef,
    chapterChangeSourceRef,
    clearScheduledPreloads,
    clearPendingRestoreState,
    hasUserInteractedRef,
    latestReaderStateRef,
    loadPersistedReaderState,
    novelId,
    setChapterIndex,
    setChapters,
    setCurrentChapter,
    setHasHydratedReaderState,
    setIsLoading,
    setIsTwoColumn,
    setPageCount,
    setPageIndex,
    setPendingRestoreState,
    setViewMode,
    startRestoreMaskForState,
    stopRestoreMask,
    updateChapterWindow,
  ]);

  useEffect(() => {
    if (!novelId || chapterIndex === undefined) return;
    if (chapters.length === 0) {
      stopRestoreMask();
      return;
    }

    if (!isPagedMode && viewMode === 'original' && chapterChangeSourceRef.current === 'scroll') {
      chapterChangeSourceRef.current = null;
      return;
    }

    let cancelled = false;

    const initScrollModeWindow = () => {
      const nextWindow: number[] = [];
      for (let index = chapterIndex - 2; index <= chapterIndex + 2; index += 1) {
        if (index >= 0 && index < chapters.length) {
          nextWindow.push(index);
        }
      }
      updateChapterWindow(nextWindow);
      for (const index of nextWindow) {
        if (!chapterCacheRef.current.has(index)) {
          void fetchChapterContent(index)
            .then((data) => {
              if (!cancelled) {
                chapterCacheRef.current.set(index, data);
              }
            })
            .catch(() => {});
        }
      }
    };

    const resetViewportPosition = () => {
      suppressScrollSyncTemporarily();
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
        contentRef.current.scrollLeft = 0;
      }
      if (pagedViewportRef.current) {
        pagedViewportRef.current.scrollLeft = 0;
      }
    };

    const resetChapterInteractionState = () => {
      setPageIndex(0);
      setPageCount(1);
      wheelDeltaRef.current = 0;
      pageTurnLockedRef.current = false;
    };

    const fetchContent = async () => {
      const shouldRestoreNavigatedChapter = chapterChangeSourceRef.current === 'navigation'
        && viewMode === 'original'
        && !isPagedMode;

      const cached = chapterCacheRef.current.get(chapterIndex);
      if (cached) {
        if (cancelled) return;
        setCurrentChapter(cached);
        resetChapterInteractionState();
        if (viewMode === 'original' && !isPagedMode) {
          initScrollModeWindow();
        }
        if (shouldRestoreNavigatedChapter) {
          setPendingRestoreState({
            chapterIndex,
            viewMode,
            isTwoColumn,
            chapterProgress: pageTargetRef.current === 'end' ? 1 : 0,
          }, { force: true });
        }
        resetViewportPosition();
        preloadAdjacent(chapterIndex);
        chapterChangeSourceRef.current = null;
        setIsLoading(false);
        return;
      }

      if (isPagedMode) {
        setIsLoading(true);
      }

      try {
        const data = await readerApi.getChapterContent(novelId, chapterIndex);
        if (cancelled) return;
        chapterCacheRef.current.set(chapterIndex, data);
        setCurrentChapter(data);
        resetChapterInteractionState();
        if (viewMode === 'original' && !isPagedMode) {
          initScrollModeWindow();
        }
        if (shouldRestoreNavigatedChapter) {
          setPendingRestoreState({
            chapterIndex,
            viewMode,
            isTwoColumn,
            chapterProgress: pageTargetRef.current === 'end' ? 1 : 0,
          }, { force: true });
        }
        resetViewportPosition();
        preloadAdjacent(chapterIndex);
        chapterChangeSourceRef.current = null;
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load chapter content', error);
          stopRestoreMask();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchContent();
    return () => {
      cancelled = true;
      clearScheduledPreloads();
    };
  }, [
    chapterCacheRef,
    chapterChangeSourceRef,
    chapterIndex,
    chapters.length,
    clearScheduledPreloads,
    contentRef,
    fetchChapterContent,
    isPagedMode,
    isTwoColumn,
    novelId,
    pageTargetRef,
    pagedViewportRef,
    pageTurnLockedRef,
    preloadAdjacent,
    setCurrentChapter,
    setIsLoading,
    setPageCount,
    setPageIndex,
    setPendingRestoreState,
    stopRestoreMask,
    suppressScrollSyncTemporarily,
    updateChapterWindow,
    viewMode,
    wheelDeltaRef,
  ]);

  return {
    fetchChapterContent,
    preloadAdjacent,
  };
}
