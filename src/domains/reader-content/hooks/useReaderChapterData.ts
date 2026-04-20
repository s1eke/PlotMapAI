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

import { debugLog, reportAppError, setDebugSnapshot } from '@shared/debug';
import { AppErrorCode, toAppError, type AppError } from '@shared/errors';
import { useReaderContentRuntime } from '@shared/reader-runtime';
import { resolvePersistedReaderMode } from '@shared/utils/readerMode';
import { createRestoreTargetFromNavigationIntent, createRestoreTargetFromPersistedState } from '@shared/utils/readerPosition';
import { getStoredChapterIndex } from '@shared/utils/readerStoredState';
import { extractImageKeysFromChapter } from '@shared/text-processing';
import {
  areReaderImageResourcesReady,
} from '@domains/reader-media';
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
  const readerContentRuntime = useReaderContentRuntime();
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
        canonical: storedState.canonical,
        hints: storedState.hints,
      };
      const resolvedMode = resolvePersistedReaderMode(nextStoredState, {
        fallbackContentMode: 'scroll',
      });
      const nextMode = resolvedMode.mode;
      const nextStoredChapterIndex = getStoredChapterIndex(nextStoredState);
      const modeResolutionSnapshot = {
        source: 'useReaderChapterData.hydrateReaderData',
        novelId: resolvedNovelId,
        resolvedMode: nextMode,
        persistedHintViewMode: nextStoredState.hints?.viewMode ?? null,
        persistedHintContentMode: nextStoredState.hints?.contentMode ?? null,
        resolvedViewMode: resolvedMode.viewMode,
        resolvedContentMode: resolvedMode.contentMode,
        persistedPageIndex: nextStoredState.hints?.pageIndex ?? null,
        persistedChapterIndex: nextStoredChapterIndex,
        fallbackReason: [
          resolvedMode.usedViewModeFallback
            ? 'missing-hints.viewMode -> fallback-to-original'
            : null,
          resolvedMode.usedContentModeFallback
            ? 'missing-hints.contentMode -> fallback-to-scroll'
            : null,
        ].filter(Boolean).join(', ') || null,
      };
      setDebugSnapshot('reader-mode-resolution', modeResolutionSnapshot);
      debugLog('Reader', 'hydrate reader data mode snapshot', modeResolutionSnapshot);
      if (modeResolutionSnapshot.fallbackReason) {
        debugLog(
          'Reader',
          'reader mode fallback to scroll because persisted hints.contentMode is missing',
          modeResolutionSnapshot,
        );
      }

      latestReaderStateRef.current = nextStoredState;
      setMode(nextMode);
      setChapterIndex(nextStoredChapterIndex);

      const toc = await readerContentRuntime.getChapters(resolvedNovelId, {
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
      const nextChapterIndex = nextStoredChapterIndex ?? fallbackIndex;
      const hasChapter = toc.some((chapter) => chapter.index === nextChapterIndex);
      const resolvedChapterIndex = hasChapter ? nextChapterIndex : fallbackIndex;

      const resolvedState: StoredReaderState = {
        canonical: hasChapter
          ? nextStoredState.canonical
          : {
            chapterIndex: resolvedChapterIndex,
            edge: 'start',
          },
        hints: {
          ...nextStoredState.hints,
          chapterProgress: hasChapter ? nextStoredState.hints?.chapterProgress : 0,
          pageIndex: hasChapter ? nextStoredState.hints?.pageIndex : undefined,
          contentMode: resolvedMode.contentMode,
          viewMode: resolvedMode.viewMode,
        },
      };

      latestReaderStateRef.current = resolvedState;
      setMode(nextMode);
      setChapterIndex(resolvedChapterIndex);
      setLoadingMessage(null);

      return {
        hasChapters: true,
        initialRestoreTarget: createRestoreTargetFromPersistedState(resolvedState, nextMode),
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
    readerContentRuntime,
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
      const chapter = await readerContentRuntime.getChapterContent(
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
    readerContentRuntime,
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
