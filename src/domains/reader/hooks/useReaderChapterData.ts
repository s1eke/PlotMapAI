import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportAppError } from '@app/debug/service';
import { AppErrorCode, toAppError, type AppError } from '@shared/errors';

import { readerApi } from '../api/readerApi';
import type { Chapter, ChapterContent } from '../api/readerApi';
import { extractImageKeysFromText } from '../utils/chapterImages';
import {
  createRestoreTargetFromNavigationIntent,
  createRestoreTargetFromPersistedState,
} from '../utils/readerPosition';
import { isPagedReaderMode } from '../utils/readerMode';
import {
  areReaderImageResourcesReady,
  preloadReaderImageResources,
} from '../utils/readerImageResourceCache';
import type { ChapterChangeSource } from './navigationTypes';
import type {
  ReaderNavigationIntent,
  ReaderMode,
  ReaderRestoreTarget,
  StoredReaderState,
} from './useReaderStatePersistence';
import { useReaderPageContext } from '../pages/reader-page/ReaderPageContext';

export interface ReaderHydrateDataResult {
  hasChapters: boolean;
  initialRestoreTarget: ReaderRestoreTarget | null;
  resolvedState: StoredReaderState | null;
  storedState: StoredReaderState;
}

export interface ReaderLoadActiveChapterParams {
  chapterIndex: number;
  mode: ReaderMode;
}

export interface ReaderLoadActiveChapterResult {
  navigationRestoreTarget: ReaderRestoreTarget | null;
}

interface UseReaderChapterDataParams {
  mode: ReaderMode;
  setChapterIndex: React.Dispatch<React.SetStateAction<number>>;
  setMode: React.Dispatch<React.SetStateAction<ReaderMode>>;
  chapterChangeSourceRef: React.MutableRefObject<ChapterChangeSource>;
  suppressScrollSyncTemporarily: () => void;
  onChapterContentResolved?: (chapterIndex: number) => void;
}

export interface UseReaderChapterDataResult {
  chapters: Chapter[];
  currentChapter: ChapterContent | null;
  loadingMessage: string | null;
  readerError: AppError | null;
  fetchChapterContent: (
    index: number,
    options?: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    },
  ) => Promise<ChapterContent>;
  hydrateReaderData: () => Promise<ReaderHydrateDataResult>;
  loadActiveChapter: (
    params: ReaderLoadActiveChapterParams,
  ) => Promise<ReaderLoadActiveChapterResult>;
  preloadAdjacent: (index: number, prune?: boolean) => void;
  resetReaderContent: () => void;
}

export function useReaderChapterData({
  mode,
  setChapterIndex,
  setMode,
  chapterChangeSourceRef,
  suppressScrollSyncTemporarily,
  onChapterContentResolved,
}: UseReaderChapterDataParams): UseReaderChapterDataResult {
  const { t } = useTranslation();
  const {
    novelId,
    latestReaderStateRef,
    hasUserInteractedRef,
    loadPersistedReaderState,
    contentRef,
    pagedViewportRef,
    chapterCacheRef,
    pageTargetRef,
    wheelDeltaRef,
    pageTurnLockedRef,
  } = useReaderPageContext();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<ChapterContent | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [readerError, setReaderError] = useState<AppError | null>(null);
  const preloadTimeoutIdsRef = useRef<number[]>([]);
  const preloadControllersRef = useRef<AbortController[]>([]);
  const chapterImageKeysRef = useRef<Map<number, string[]>>(new Map());
  const hydrateControllerRef = useRef<AbortController | null>(null);
  const activeChapterControllerRef = useRef<AbortController | null>(null);
  const userInteractedRef = hasUserInteractedRef;
  const latestStoredStateRef = latestReaderStateRef;
  const chapterSourceRef = chapterChangeSourceRef;
  const readerContentRef = contentRef;
  const pagedReaderViewportRef = pagedViewportRef;
  const wheelAccumulatorRef = wheelDeltaRef;
  const pageTurnLockRef = pageTurnLockedRef;

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
    if (!isPagedReaderMode(mode)) {
      return;
    }

    const imageKeys = getChapterImageKeys(chapter);
    if (imageKeys.length === 0 || areReaderImageResourcesReady(novelId, imageKeys)) {
      return;
    }

    await preloadReaderImageResources(novelId, imageKeys);
  }, [getChapterImageKeys, mode, novelId]);

  const clearScheduledPreloads = useCallback(() => {
    preloadTimeoutIdsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    preloadTimeoutIdsRef.current = [];
    preloadControllersRef.current.forEach((controller) => controller.abort());
    preloadControllersRef.current = [];
  }, []);

  const abortHydrationRequest = useCallback(() => {
    hydrateControllerRef.current?.abort();
    hydrateControllerRef.current = null;
  }, []);

  const abortActiveChapterRequest = useCallback(() => {
    activeChapterControllerRef.current?.abort();
    activeChapterControllerRef.current = null;
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
        preloadTimeoutIdsRef.current = preloadTimeoutIdsRef.current.filter(
          (id) => id !== timeoutId,
        );
        if (chapterCacheRef.current.has(adjacentIndex)) return;
        const controller = new AbortController();
        preloadControllersRef.current.push(controller);
        readerApi.getChapterContent(novelId, adjacentIndex, {
          signal: controller.signal,
        })
          .then((data) => {
            chapterCacheRef.current.set(adjacentIndex, data);
            if (!isPagedReaderMode(mode)) {
              onChapterContentResolved?.(adjacentIndex);
              return;
            }

            warmChapterImages(data)
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
    mode,
    novelId,
    onChapterContentResolved,
    warmChapterImages,
  ]);

  const resetReaderContent = useCallback(() => {
    abortHydrationRequest();
    abortActiveChapterRequest();
    clearScheduledPreloads();
    userInteractedRef.current = false;
    chapterSourceRef.current = null;
    pageTargetRef.current = null;
    chapterCacheRef.current.clear();
    chapterImageKeysRef.current.clear();
    setChapters([]);
    setCurrentChapter(null);
    setReaderError(null);
    setLoadingMessage(null);
    wheelAccumulatorRef.current = 0;
    pageTurnLockRef.current = false;
  }, [
    abortActiveChapterRequest,
    abortHydrationRequest,
    chapterCacheRef,
    chapterSourceRef,
    clearScheduledPreloads,
    pageTargetRef,
    pageTurnLockRef,
    userInteractedRef,
    wheelAccumulatorRef,
  ]);

  const hydrateReaderData = useCallback(async (): Promise<ReaderHydrateDataResult> => {
    abortHydrationRequest();
    const controller = new AbortController();
    hydrateControllerRef.current = controller;
    setLoadingMessage(t('reader.processingContents', { percent: 0 }));
    setReaderError(null);

    try {
      const storedState = await loadPersistedReaderState();
      if (controller.signal.aborted) {
        throw new DOMException('Hydration aborted', 'AbortError');
      }

      const nextStoredState: StoredReaderState = {
        chapterIndex: storedState.chapterIndex ?? 0,
        mode: storedState.mode ?? 'scroll',
        chapterProgress: storedState.chapterProgress,
        scrollPosition: storedState.scrollPosition,
        locatorVersion: storedState.locator ? 1 : undefined,
        locator: storedState.locator,
      };

      latestStoredStateRef.current = nextStoredState;
      setMode(nextStoredState.mode ?? 'scroll');
      setChapterIndex(nextStoredState.chapterIndex ?? 0);

      const toc = await readerApi.getChapters(novelId, {
        signal: controller.signal,
        onProgress: (progress) => {
          setLoadingMessage(t('reader.processingContents', { percent: progress.progress }));
        },
      });
      if (controller.signal.aborted) {
        throw new DOMException('Hydration aborted', 'AbortError');
      }

      setChapters(toc);
      if (toc.length === 0) {
        setLoadingMessage(null);
        return {
          hasChapters: false,
          initialRestoreTarget: null,
          resolvedState: null,
          storedState: nextStoredState,
        };
      }

      if (userInteractedRef.current) {
        setLoadingMessage(null);
        return {
          hasChapters: true,
          initialRestoreTarget: null,
          resolvedState: nextStoredState,
          storedState: nextStoredState,
        };
      }

      const fallbackIndex = toc[0]?.index ?? 0;
      const nextChapterIndex = nextStoredState.chapterIndex ?? fallbackIndex;
      const nextMode = nextStoredState.mode ?? 'scroll';
      const hasChapter = toc.some((chapter) => chapter.index === nextChapterIndex);
      const resolvedChapterIndex = hasChapter ? nextChapterIndex : fallbackIndex;

      const resolvedState: StoredReaderState = {
        chapterIndex: resolvedChapterIndex,
        mode: nextMode,
        chapterProgress: hasChapter ? nextStoredState.chapterProgress : 0,
        scrollPosition: hasChapter ? nextStoredState.scrollPosition : undefined,
        locatorVersion: hasChapter && nextStoredState.locator ? 1 : undefined,
        locator: hasChapter ? nextStoredState.locator : undefined,
      };

      latestStoredStateRef.current = resolvedState;
      setMode(nextMode);
      setChapterIndex(resolvedChapterIndex);
      setLoadingMessage(null);

      return {
        hasChapters: true,
        initialRestoreTarget: createRestoreTargetFromPersistedState(resolvedState),
        resolvedState,
        storedState: nextStoredState,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      const normalized = toAppError(error, {
        code: AppErrorCode.STORAGE_OPERATION_FAILED,
        kind: 'storage',
        source: 'reader',
        userMessageKey: 'reader.loadError',
      });
      reportAppError(normalized);
      setReaderError(normalized);
      setLoadingMessage(null);
      throw normalized;
    }
  }, [
    abortHydrationRequest,
    latestStoredStateRef,
    loadPersistedReaderState,
    novelId,
    setChapterIndex,
    setMode,
    t,
    userInteractedRef,
  ]);

  const loadActiveChapter = useCallback(async (
    params: ReaderLoadActiveChapterParams,
  ): Promise<ReaderLoadActiveChapterResult> => {
    if (!novelId || chapters.length === 0) {
      setLoadingMessage(null);
      return { navigationRestoreTarget: null };
    }

    if (
      params.mode === 'scroll' &&
      chapterSourceRef.current === 'scroll'
    ) {
      chapterSourceRef.current = null;
      setLoadingMessage(null);
      return { navigationRestoreTarget: null };
    }

    abortActiveChapterRequest();
    const controller = new AbortController();
    activeChapterControllerRef.current = controller;

    const resetViewportPosition = () => {
      suppressScrollSyncTemporarily();
      const contentElement = readerContentRef.current;
      if (contentElement) {
        contentElement.scrollTop = 0;
        contentElement.scrollLeft = 0;
      }
      const pagedViewportElement = pagedReaderViewportRef.current;
      if (pagedViewportElement) {
        pagedViewportElement.scrollLeft = 0;
      }
    };

    const shouldRestoreNavigatedChapter = chapterSourceRef.current === 'navigation'
      && params.mode !== 'summary';

    const applyCurrentChapter = async (
      chapter: ChapterContent,
    ): Promise<ReaderLoadActiveChapterResult> => {
      if (params.mode === 'paged') {
        await warmChapterImages(chapter).catch(() => undefined);
      }
      if (controller.signal.aborted) {
        throw new DOMException('Chapter load aborted', 'AbortError');
      }

      setCurrentChapter(chapter);
      onChapterContentResolved?.(params.chapterIndex);
      wheelAccumulatorRef.current = 0;
      pageTurnLockRef.current = false;

      const navigationRestoreTarget = shouldRestoreNavigatedChapter
        ? createRestoreTargetFromNavigationIntent({
          chapterIndex: params.chapterIndex,
          pageTarget: pageTargetRef.current === 'end' ? 'end' : 'start',
        } satisfies ReaderNavigationIntent, params.mode)
        : null;

      resetViewportPosition();
      preloadAdjacent(params.chapterIndex);
      chapterSourceRef.current = null;
      setLoadingMessage(null);

      return { navigationRestoreTarget };
    };

    try {
      const cached = chapterCacheRef.current.get(params.chapterIndex);
      if (cached) {
        const cachedImageKeys = getChapterImageKeys(cached);
        if (
          params.mode === 'paged' &&
          cachedImageKeys.length > 0 &&
          !areReaderImageResourcesReady(novelId, cachedImageKeys)
        ) {
          setLoadingMessage(t('reader.processingChapter', { percent: 100 }));
        }

        return await applyCurrentChapter(cached);
      }

      setReaderError(null);
      setLoadingMessage(t('reader.processingChapter', { percent: 0 }));
      const chapter = await readerApi.getChapterContent(novelId, params.chapterIndex, {
        signal: controller.signal,
        onProgress: (progress) => {
          setLoadingMessage(t('reader.processingChapter', { percent: progress.progress }));
        },
      });
      if (controller.signal.aborted) {
        throw new DOMException('Chapter load aborted', 'AbortError');
      }

      chapterCacheRef.current.set(params.chapterIndex, chapter);
      return await applyCurrentChapter(chapter);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      const normalized = toAppError(error, {
        code: AppErrorCode.STORAGE_OPERATION_FAILED,
        kind: 'storage',
        source: 'reader',
        userMessageKey: 'reader.loadError',
      });
      reportAppError(normalized);
      setReaderError(normalized);
      setLoadingMessage(null);
      throw normalized;
    }
  }, [
    abortActiveChapterRequest,
    chapterCacheRef,
    chapterSourceRef,
    chapters.length,
    getChapterImageKeys,
    novelId,
    onChapterContentResolved,
    pageTargetRef,
    pagedReaderViewportRef,
    pageTurnLockRef,
    preloadAdjacent,
    readerContentRef,
    suppressScrollSyncTemporarily,
    t,
    warmChapterImages,
    wheelAccumulatorRef,
  ]);

  return {
    chapters,
    currentChapter,
    loadingMessage,
    readerError,
    fetchChapterContent,
    hydrateReaderData,
    loadActiveChapter,
    preloadAdjacent,
    resetReaderContent,
  };
}
