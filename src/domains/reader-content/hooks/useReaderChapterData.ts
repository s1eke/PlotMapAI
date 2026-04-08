import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  Chapter,
  ChapterChangeSource,
  ChapterContent,
  PageTarget,
  ReaderNavigationIntent,
  ReaderMode,
  ReaderChapterCacheApi,
  ReaderRestoreTarget,
  ReaderSessionCommands,
  ReaderSessionSnapshot,
  StoredReaderState,
} from '@shared/contracts/reader';

import { reportAppError } from '@shared/debug';
import { AppErrorCode, toAppError, type AppError } from '@shared/errors';
import {
  createRestoreTargetFromNavigationIntent,
  createRestoreTargetFromPersistedState,
} from '@shared/utils/readerPosition';
import {
  areReaderImageResourcesReady,
} from '@domains/reader-media';
import { readerContentService } from '@domains/reader-content';
import { useReaderChapterDataCache } from './useReaderChapterDataCache';

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
  shouldClearNavigationSource: boolean;
  shouldResetViewport: boolean;
}
export interface ReaderLoadActiveChapterRuntime {
  navigationSource?: ChapterChangeSource;
  pendingPageTarget?: PageTarget | null;
}

interface UseReaderChapterDataParams {
  novelId: number;
  sessionSnapshot: Pick<ReaderSessionSnapshot, 'mode'>;
  sessionCommands: Pick<
    ReaderSessionCommands,
    | 'hasUserInteractedRef'
    | 'latestReaderStateRef'
    | 'loadPersistedReaderState'
    | 'setChapterIndex'
    | 'setMode'
  >;
  onChapterContentResolved?: (chapterIndex: number) => void;
  resetInteractionState?: () => void;
}

export interface UseReaderChapterDataResult {
  cache: ReaderChapterCacheApi;
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
    runtime?: ReaderLoadActiveChapterRuntime,
  ) => Promise<ReaderLoadActiveChapterResult>;
  preloadAdjacent: (index: number, prune?: boolean) => void;
  resetReaderContent: () => void;
}

export function useReaderChapterData({
  novelId,
  sessionSnapshot,
  sessionCommands,
  onChapterContentResolved,
  resetInteractionState,
}: UseReaderChapterDataParams): UseReaderChapterDataResult {
  const { t } = useTranslation();
  const resolvedNovelId = novelId;
  const { mode } = sessionSnapshot;
  const {
    hasUserInteractedRef,
    latestReaderStateRef,
    loadPersistedReaderState,
    setChapterIndex,
    setMode,
  } = sessionCommands;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<ChapterContent | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [readerError, setReaderError] = useState<AppError | null>(null);
  const hydrateControllerRef = useRef<AbortController | null>(null);
  const activeChapterControllerRef = useRef<AbortController | null>(null);
  const {
    cache,
    clearScheduledPreloads,
    fetchChapterContent,
    preloadAdjacent,
    resetCachedChapterState,
    warmChapterImages,
  } = useReaderChapterDataCache({
    chaptersLength: chapters.length,
    mode,
    novelId: resolvedNovelId,
    onChapterContentResolved,
    t,
  });

  const abortHydrationRequest = useCallback(() => {
    hydrateControllerRef.current?.abort();
    hydrateControllerRef.current = null;
  }, []);

  const abortActiveChapterRequest = useCallback(() => {
    activeChapterControllerRef.current?.abort();
    activeChapterControllerRef.current = null;
  }, []);

  const resetReaderContent = useCallback(() => {
    abortHydrationRequest();
    abortActiveChapterRequest();
    clearScheduledPreloads();
    hasUserInteractedRef.current = false;
    resetCachedChapterState();
    setChapters([]);
    setCurrentChapter(null);
    setReaderError(null);
    setLoadingMessage(null);
    resetInteractionState?.();
  }, [
    abortActiveChapterRequest,
    abortHydrationRequest,
    clearScheduledPreloads,
    hasUserInteractedRef,
    resetCachedChapterState,
    resetInteractionState,
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
        locator: storedState.locator,
      };

      latestReaderStateRef.current = nextStoredState;
      setMode(nextStoredState.mode ?? 'scroll');
      setChapterIndex(nextStoredState.chapterIndex ?? 0);

      const toc = await readerContentService.getChapters(resolvedNovelId, {
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

      if (hasUserInteractedRef.current) {
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
        locator: hasChapter ? nextStoredState.locator : undefined,
      };

      latestReaderStateRef.current = resolvedState;
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
    hasUserInteractedRef,
    latestReaderStateRef,
    loadPersistedReaderState,
    resolvedNovelId,
    setChapterIndex,
    setMode,
    t,
  ]);

  const loadActiveChapter = useCallback(async (
    params: ReaderLoadActiveChapterParams,
    runtime: ReaderLoadActiveChapterRuntime = {},
  ): Promise<ReaderLoadActiveChapterResult> => {
    if (!resolvedNovelId || chapters.length === 0) {
      setLoadingMessage(null);
      return {
        navigationRestoreTarget: null,
        shouldClearNavigationSource: false,
        shouldResetViewport: false,
      };
    }

    if (params.mode === 'scroll' && runtime.navigationSource === 'scroll') {
      setLoadingMessage(null);
      return {
        navigationRestoreTarget: null,
        shouldClearNavigationSource: true,
        shouldResetViewport: false,
      };
    }

    abortActiveChapterRequest();
    const controller = new AbortController();
    activeChapterControllerRef.current = controller;

    const shouldRestoreNavigatedChapter =
      runtime.navigationSource === 'navigation' && params.mode !== 'summary';

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
      resetInteractionState?.();

      const navigationRestoreTarget = shouldRestoreNavigatedChapter
        ? createRestoreTargetFromNavigationIntent({
          chapterIndex: params.chapterIndex,
          pageTarget: runtime.pendingPageTarget === 'end' ? 'end' : 'start',
        } satisfies ReaderNavigationIntent, params.mode)
        : null;
      const shouldHoldNavigationSourceUntilRestore =
        shouldRestoreNavigatedChapter && params.mode === 'scroll';

      preloadAdjacent(params.chapterIndex);
      setLoadingMessage(null);

      return {
        navigationRestoreTarget,
        shouldClearNavigationSource: !shouldHoldNavigationSourceUntilRestore,
        shouldResetViewport: true,
      };
    };

    try {
      const cached = cache.getCachedChapter(params.chapterIndex);
      if (cached) {
        const cachedImageKeys = extractImageKeysFromChapter(cached);
        if (
          params.mode === 'paged'
          && cachedImageKeys.length > 0
          && !areReaderImageResourcesReady(resolvedNovelId, cachedImageKeys)
        ) {
          setLoadingMessage(t('reader.processingChapter', { percent: 100 }));
        }

        return await applyCurrentChapter(cached);
      }

      setReaderError(null);
      setLoadingMessage(t('reader.processingChapter', { percent: 0 }));
      const chapter = await readerContentService.getChapterContent(
        resolvedNovelId,
        params.chapterIndex,
        {
          signal: controller.signal,
          onProgress: (progress) => {
            setLoadingMessage(t('reader.processingChapter', { percent: progress.progress }));
          },
        },
      );
      if (controller.signal.aborted) {
        throw new DOMException('Chapter load aborted', 'AbortError');
      }

      cache.setCachedChapter(chapter);
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
    cache,
    chapters.length,
    onChapterContentResolved,
    preloadAdjacent,
    resetInteractionState,
    resolvedNovelId,
    t,
    warmChapterImages,
  ]);

  return {
    cache,
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
