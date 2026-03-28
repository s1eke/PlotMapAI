import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { reportAppError } from '@app/debug/service';
import { AppErrorCode, toAppError, type AppError } from '@shared/errors';
import { readerApi } from '../api/readerApi';
import type { Chapter, ChapterContent } from '../api/readerApi';
import { extractImageKeysFromText } from '../utils/chapterImages';
import {
  areReaderImageResourcesReady,
  preloadReaderImageResources,
} from '../utils/readerImageResourceCache';
import type { ChapterChangeSource } from './navigationTypes';
import type { PageTarget, StoredReaderState } from './useReaderStatePersistence';

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
  setReaderError: React.Dispatch<React.SetStateAction<AppError | null>>;
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
  setLoadingMessage: React.Dispatch<React.SetStateAction<string | null>>;
  onChapterContentResolved?: (chapterIndex: number) => void;
}

interface UseReaderChapterDataResult {
  fetchChapterContent: (
    index: number,
    options?: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    },
  ) => Promise<ChapterContent>;
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
  setReaderError,
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
  setLoadingMessage,
  onChapterContentResolved,
}: UseReaderChapterDataParams): UseReaderChapterDataResult {
  const { t } = useTranslation();
  const preloadTimeoutIdsRef = useRef<number[]>([]);
  const preloadControllersRef = useRef<AbortController[]>([]);
  const chapterImageKeysRef = useRef<Map<number, string[]>>(new Map());

  const getChapterImageKeys = useCallback((chapter: ChapterContent): string[] => {
    const cachedKeys = chapterImageKeysRef.current.get(chapter.index);
    if (cachedKeys) {
      return cachedKeys;
    }

    const nextKeys = extractImageKeysFromText(chapter.content);
    chapterImageKeysRef.current.set(chapter.index, nextKeys);
    return nextKeys;
  }, []);

  const warmChapterImages = useCallback(async (chapter: ChapterContent): Promise<void> => {
    if (!isPagedMode) {
      return;
    }

    const imageKeys = getChapterImageKeys(chapter);
    if (imageKeys.length === 0 || areReaderImageResourcesReady(novelId, imageKeys)) {
      return;
    }

    await preloadReaderImageResources(novelId, imageKeys);
  }, [getChapterImageKeys, isPagedMode, novelId]);

  const clearScheduledPreloads = useCallback(() => {
    preloadTimeoutIdsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    preloadTimeoutIdsRef.current = [];
    preloadControllersRef.current.forEach((controller) => controller.abort());
    preloadControllersRef.current = [];
  }, []);

  const fetchChapterContent = useCallback(async (
    index: number,
    options: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    } = {},
  ) => {
    const cached = chapterCacheRef.current.get(index);
    if (cached) return cached;

    const data = await readerApi.getChapterContent(novelId, index, {
      signal: options.signal,
      onProgress: (progress) => {
        const message = t('reader.processingChapter', { percent: progress.progress });
        options.onProgress?.(message);
      },
    });
    chapterCacheRef.current.set(index, data);
    onChapterContentResolved?.(index);
    return data;
  }, [chapterCacheRef, novelId, onChapterContentResolved, t]);

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
        const controller = new AbortController();
        preloadControllersRef.current.push(controller);
        readerApi.getChapterContent(novelId, adjacentIndex, {
          signal: controller.signal,
        })
          .then((data) => {
            chapterCacheRef.current.set(adjacentIndex, data);
            if (!isPagedMode) {
              onChapterContentResolved?.(adjacentIndex);
              return;
            }

            void warmChapterImages(data)
              .catch(() => undefined)
              .finally(() => {
                onChapterContentResolved?.(adjacentIndex);
              });
          })
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
  }, [
    chapterCacheRef,
    chapters.length,
    clearScheduledPreloads,
    isPagedMode,
    novelId,
    onChapterContentResolved,
    warmChapterImages,
  ]);

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
    const initController = new AbortController();

    const init = async () => {
      clearScheduledPreloads();
      setIsLoading(true);
      setLoadingMessage(t('reader.processingContents', { percent: 0 }));
      stopRestoreMask();
      setHasHydratedReaderState(false);
      hasUserInteractedRef.current = false;
      chapterChangeSourceRef.current = null;
      chapterCacheRef.current.clear();
      chapterImageKeysRef.current.clear();
      setChapters([]);
      setCurrentChapter(null);
      setReaderError(null);
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
        const toc = await readerApi.getChapters(novelId, {
          signal: initController.signal,
          onProgress: (progress) => {
            if (!cancelled) {
              setLoadingMessage(t('reader.processingContents', { percent: progress.progress }));
            }
          },
        });
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
          setLoadingMessage(null);
          stopRestoreMask();
        }
      } catch (error) {
        if (!cancelled) {
          const normalized = toAppError(error, {
            code: AppErrorCode.STORAGE_OPERATION_FAILED,
            kind: 'storage',
            source: 'reader',
            userMessageKey: 'reader.loadError',
          });
          reportAppError(normalized);
          console.error('Failed to load reader init data:', error);
          setReaderError(normalized);
          setIsLoading(false);
          setLoadingMessage(null);
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
      initController.abort();
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
    setReaderError,
    setPendingRestoreState,
    setViewMode,
    setLoadingMessage,
    startRestoreMaskForState,
    stopRestoreMask,
    t,
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
    const chapterController = new AbortController();

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
      const applyCurrentChapter = async (data: ChapterContent) => {
        if (isPagedMode) {
          await warmChapterImages(data).catch(() => undefined);
        }
        if (cancelled) return;

        setCurrentChapter(data);
        onChapterContentResolved?.(chapterIndex);
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
      };

      const cached = chapterCacheRef.current.get(chapterIndex);
      if (cached) {
        if (cancelled) return;
        const cachedImageKeys = getChapterImageKeys(cached);
        if (
          isPagedMode
          && cachedImageKeys.length > 0
          && !areReaderImageResourcesReady(novelId, cachedImageKeys)
        ) {
          setIsLoading(true);
          setLoadingMessage(t('reader.processingChapter', { percent: 100 }));
        }

        await applyCurrentChapter(cached);
        setIsLoading(false);
        setLoadingMessage(null);
        return;
      }

      setIsLoading(true);
      setReaderError(null);

      try {
        setLoadingMessage(t('reader.processingChapter', { percent: 0 }));
        const data = await readerApi.getChapterContent(novelId, chapterIndex, {
          signal: chapterController.signal,
          onProgress: (progress) => {
            if (!cancelled) {
              setLoadingMessage(t('reader.processingChapter', { percent: progress.progress }));
            }
          },
        });
        if (cancelled) return;
        chapterCacheRef.current.set(chapterIndex, data);
        await applyCurrentChapter(data);
      } catch (error) {
        if (!cancelled) {
          const normalized = toAppError(error, {
            code: AppErrorCode.STORAGE_OPERATION_FAILED,
            kind: 'storage',
            source: 'reader',
            userMessageKey: 'reader.loadError',
          });
          reportAppError(normalized);
          console.error('Failed to load chapter content', error);
          setReaderError(normalized);
          setLoadingMessage(null);
          stopRestoreMask();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setLoadingMessage(null);
        }
      }
    };

    void fetchContent();
    return () => {
      cancelled = true;
      chapterController.abort();
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
    getChapterImageKeys,
    isPagedMode,
    isTwoColumn,
    novelId,
    onChapterContentResolved,
    pageTargetRef,
    pagedViewportRef,
    pageTurnLockedRef,
    preloadAdjacent,
    setCurrentChapter,
    setIsLoading,
    setLoadingMessage,
    setPageCount,
    setPageIndex,
    setReaderError,
    setPendingRestoreState,
    stopRestoreMask,
    suppressScrollSyncTemporarily,
    t,
    updateChapterWindow,
    viewMode,
    warmChapterImages,
    wheelDeltaRef,
  ]);

  return {
    fetchChapterContent,
    preloadAdjacent,
  };
}
