import { useCallback, useMemo, useRef } from 'react';

import type {
  ChapterContent,
  ReaderChapterCacheApi,
  ReaderMode,
} from '@shared/contracts/reader';

import { useReaderContentRuntime } from '@shared/reader-runtime';
import { extractImageKeysFromChapter } from '@shared/text-processing';
import { isPagedReaderMode } from '@shared/utils/readerMode';
import {
  areReaderImageResourcesReady,
  preloadReaderImageResources,
} from '@domains/reader-media';

interface UseReaderChapterDataCacheParams {
  chaptersLength: number;
  mode: ReaderMode;
  novelId: number;
  onChapterContentResolved?: (chapterIndex: number) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

interface UseReaderChapterDataCacheResult {
  cache: ReaderChapterCacheApi;
  clearScheduledPreloads: () => void;
  fetchChapterContent: (
    index: number,
    options?: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    },
  ) => Promise<ChapterContent>;
  preloadAdjacent: (index: number, prune?: boolean) => void;
  resetCachedChapterState: () => void;
  warmChapterImages: (chapter: ChapterContent) => Promise<void>;
}

export function useReaderChapterDataCache({
  chaptersLength,
  mode,
  novelId,
  onChapterContentResolved,
  t,
}: UseReaderChapterDataCacheParams): UseReaderChapterDataCacheResult {
  const readerContentRuntime = useReaderContentRuntime();
  const chapterCacheRef = useRef<Map<number, ChapterContent>>(new Map());
  const preloadTimeoutIdsRef = useRef<number[]>([]);
  const preloadControllersRef = useRef<AbortController[]>([]);
  const chapterImageKeysRef = useRef<Map<number, string[]>>(new Map());

  const cache = useMemo<ReaderChapterCacheApi>(() => ({
    clearCachedChapters: () => {
      chapterCacheRef.current.clear();
    },
    getCachedChapter: (index) => chapterCacheRef.current.get(index) ?? null,
    hasCachedChapter: (index) => chapterCacheRef.current.has(index),
    setCachedChapter: (chapter) => {
      chapterCacheRef.current.set(chapter.index, chapter);
    },
    snapshotCachedChapters: () => new Map(chapterCacheRef.current),
  }), []);

  const getChapterImageKeys = useCallback((chapter: ChapterContent): string[] => {
    const cachedKeys = chapterImageKeysRef.current.get(chapter.index);
    if (cachedKeys) {
      return cachedKeys;
    }

    const nextKeys = extractImageKeysFromChapter(chapter);
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

    await preloadReaderImageResources(readerContentRuntime, novelId, imageKeys);
  }, [getChapterImageKeys, mode, novelId, readerContentRuntime]);

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
    if (cached) {
      return cached;
    }

    const data = await readerContentRuntime.getChapterContent(novelId, index, {
      signal: options.signal,
      onProgress: (progress) => {
        const message = t('reader.processingChapter', { percent: progress.progress });
        options.onProgress?.(message);
      },
    });
    cache.setCachedChapter(data);
    onChapterContentResolved?.(index);
    return data;
  }, [cache, novelId, onChapterContentResolved, readerContentRuntime, t]);

  const preloadAdjacent = useCallback((index: number, prune = true) => {
    clearScheduledPreloads();

    const toPreload: number[] = [];
    for (let offset = -3; offset <= 3; offset += 1) {
      if (offset === 0) continue;
      const adjacentIndex = index + offset;
      if (adjacentIndex < 0 || adjacentIndex >= chaptersLength) continue;
      if (cache.hasCachedChapter(adjacentIndex)) continue;
      toPreload.push(adjacentIndex);
    }

    let delay = 50;
    for (const adjacentIndex of toPreload) {
      const timeoutId = window.setTimeout(() => {
        preloadTimeoutIdsRef.current = preloadTimeoutIdsRef.current.filter(
          (id) => id !== timeoutId,
        );
        if (cache.hasCachedChapter(adjacentIndex)) return;
        const controller = new AbortController();
        preloadControllersRef.current.push(controller);
        readerContentRuntime.getChapterContent(novelId, adjacentIndex, {
          signal: controller.signal,
        })
          .then((data) => {
            cache.setCachedChapter(data);
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
    cache,
    chaptersLength,
    clearScheduledPreloads,
    mode,
    novelId,
    onChapterContentResolved,
    readerContentRuntime,
    warmChapterImages,
  ]);

  const resetCachedChapterState = useCallback(() => {
    cache.clearCachedChapters();
    chapterImageKeysRef.current.clear();
  }, [cache]);

  return {
    cache,
    clearScheduledPreloads,
    fetchChapterContent,
    preloadAdjacent,
    resetCachedChapterState,
    warmChapterImages,
  };
}
