import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ChapterContent, ReaderMode, ReaderRestoreTarget } from '@shared/contracts/reader';
import type { AppError } from '@shared/errors';
import type {
  ReaderHydrateDataResult,
  ReaderLoadActiveChapterParams,
  ReaderLoadActiveChapterRuntime,
  UseReaderChapterDataResult,
} from '@domains/reader-content';
import type { UseReaderRestoreControllerResult } from '@domains/reader-session';
import {
  dispatchReaderLifecycleEvent,
  useReaderSessionSelector,
} from '@domains/reader-session';

import {
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import { getStoredChapterIndex } from '@shared/utils/readerStoredState';
import { isPagedReaderMode } from '@shared/utils/readerMode';
import { shouldKeepReaderRestoreMask } from '@shared/utils/readerPosition';

import type {
  ReaderLifecycleControllerResult,
} from './types';

interface ReaderLifecycleControllerChapterData {
  chapters: UseReaderChapterDataResult['chapters'];
  currentChapter: UseReaderChapterDataResult['currentChapter'];
  hydrateReaderData: UseReaderChapterDataResult['hydrateReaderData'];
  loadActiveChapter: UseReaderChapterDataResult['loadActiveChapter'];
  loadingMessage: UseReaderChapterDataResult['loadingMessage'];
  readerError: UseReaderChapterDataResult['readerError'];
  resetReaderContent: UseReaderChapterDataResult['resetReaderContent'];
}

interface ReaderLifecycleControllerRestoreFlow {
  clearPendingRestoreTarget: UseReaderRestoreControllerResult['clearPendingRestoreTarget'];
  pendingRestoreTarget: UseReaderRestoreControllerResult['pendingRestoreTarget'];
  setPendingRestoreTarget: UseReaderRestoreControllerResult['setPendingRestoreTarget'];
  startRestoreMaskForTarget: UseReaderRestoreControllerResult['startRestoreMaskForTarget'];
  stopRestoreMask: UseReaderRestoreControllerResult['stopRestoreMask'];
}

interface UseReaderLifecycleControllerParams {
  chapterData: ReaderLifecycleControllerChapterData;
  chapterIndex: number;
  currentPagedLayoutChapterIndex: number | null;
  mode: ReaderMode;
  novelId: number;
  restoreFlow: ReaderLifecycleControllerRestoreFlow;
}

function createLifecycleLoadKey(params: {
  chapterIndex: number;
  mode: ReaderMode;
  novelId: number;
}): string {
  return [
    params.novelId,
    params.chapterIndex,
    params.mode,
  ].join(':');
}

function buildLoadParamsFromHydratedState(
  result: ReaderHydrateDataResult,
): ReaderLoadActiveChapterParams | null {
  if (!result.resolvedState) {
    return null;
  }

  const resolvedLegacy = result.resolvedState as Record<string, unknown>;
  const storedLegacy = result.storedState as Record<string, unknown>;
  const chapterIndex = getStoredChapterIndex(result.resolvedState);
  const mode = result.resolvedState.hints?.contentMode
    ?? result.storedState.hints?.contentMode
    ?? (resolvedLegacy.mode === 'scroll' || resolvedLegacy.mode === 'paged'
      ? resolvedLegacy.mode
      : undefined)
    ?? (storedLegacy.mode === 'scroll' || storedLegacy.mode === 'paged'
      ? storedLegacy.mode
      : undefined)
    ?? 'scroll';

  return {
    chapterIndex,
    mode,
  };
}

export function useReaderLifecycleController({
  chapterData,
  chapterIndex,
  currentPagedLayoutChapterIndex,
  mode,
  novelId,
  restoreFlow,
}: UseReaderLifecycleControllerParams): ReaderLifecycleControllerResult {
  const { t } = useTranslation();
  const navigation = useReaderNavigationRuntime();
  const persistence = useReaderPersistenceRuntime();
  const viewport = useReaderViewportContext();
  const lifecycleStatus = useReaderSessionSelector((state) => state.restoreStatus);
  const {
    chapters,
    currentChapter,
    hydrateReaderData,
    loadActiveChapter,
    loadingMessage,
    readerError: chapterDataError,
    resetReaderContent,
  } = chapterData;
  const {
    clearPendingRestoreTarget,
    pendingRestoreTarget,
    setPendingRestoreTarget,
    startRestoreMaskForTarget,
    stopRestoreMask,
  } = restoreFlow;
  const [controllerError, setControllerError] = useState<AppError | null>(null);
  const hasInitializedRef = useRef(false);
  const lastRequestedLoadKeyRef = useRef<string | null>(null);
  const awaitingRestoreLoadKeyRef = useRef<string | null>(null);
  const queuedInitialLoadParamsRef = useRef<ReaderLoadActiveChapterParams | null>(null);
  const queuedInitialRestoreTargetRef = useRef<ReaderRestoreTarget | null>(null);
  const hydrateReaderDataRef = useRef(hydrateReaderData);
  const resetReaderContentRef = useRef(resetReaderContent);
  const clearPendingRestoreTargetRef = useRef(clearPendingRestoreTarget);
  const stopRestoreMaskRef = useRef(stopRestoreMask);
  const currentLoadKey = createLifecycleLoadKey({
    chapterIndex,
    mode,
    novelId,
  });
  const isPagedMode = isPagedReaderMode(mode);
  const isLoadingLifecyclePhase =
    lifecycleStatus === 'hydrating'
    || lifecycleStatus === 'loading-chapters'
    || lifecycleStatus === 'loading-chapter';
  const isActiveChapterResolved = currentChapter?.index === chapterIndex;
  const renderableChapter = useMemo<ChapterContent | null>(() => {
    if (lifecycleStatus === 'hydrating' || lifecycleStatus === 'loading-chapters') {
      return null;
    }

    return isActiveChapterResolved ? currentChapter : null;
  }, [currentChapter, isActiveChapterResolved, lifecycleStatus]);
  const isAwaitingPagedLayout = lifecycleStatus === 'awaiting-paged-layout';
  const shouldKeepRestoreMask = shouldKeepReaderRestoreMask(pendingRestoreTarget);
  const isRestoringPosition = lifecycleStatus === 'restoring-position' && shouldKeepRestoreMask;
  const showLoadingOverlay =
    isLoadingLifecyclePhase
    || isAwaitingPagedLayout
    || isRestoringPosition;
  const loadingLabel = isRestoringPosition
    ? t('reader.restoringPosition')
    : loadingMessage;
  const readerError = controllerError ?? chapterDataError;
  const isChapterNavigationReady =
    !isLoadingLifecyclePhase
    && Boolean(renderableChapter)
    && (!isPagedMode || currentPagedLayoutChapterIndex === chapterIndex);

  const resetViewportPosition = useCallback((): void => {
    persistence.suppressScrollSyncTemporarily();
    const contentElement = viewport.contentRef.current;
    if (contentElement) {
      contentElement.scrollTop = 0;
      contentElement.scrollLeft = 0;
    }

    const pagedViewportElement = viewport.pagedViewportRef.current;
    if (pagedViewportElement) {
      pagedViewportElement.scrollLeft = 0;
    }
  }, [persistence, viewport.contentRef, viewport.pagedViewportRef]);

  const runChapterLoad = useCallback(async (
    params: ReaderLoadActiveChapterParams,
    initialRestoreTarget: ReaderRestoreTarget | null,
    persistedRestoreTarget: ReaderRestoreTarget | null,
  ) => {
    const loadKey = createLifecycleLoadKey({
      chapterIndex: params.chapterIndex,
      mode: params.mode,
      novelId,
    });
    lastRequestedLoadKeyRef.current = loadKey;
    awaitingRestoreLoadKeyRef.current = null;
    setControllerError(null);
    dispatchReaderLifecycleEvent({
      type: 'CHAPTER_LOAD_STARTED',
      loadKey,
    });

    try {
      const runtime: ReaderLoadActiveChapterRuntime = {
        navigationSource: navigation.getChapterChangeSource(),
        pendingPageTarget: navigation.getPendingPageTarget(),
      };
      const {
        navigationRestoreTarget,
        shouldClearNavigationSource,
        shouldResetViewport,
      } = await loadActiveChapter(params, runtime);
      const shouldReusePersistedRestoreTarget =
        persistedRestoreTarget?.chapterIndex === params.chapterIndex
        && persistedRestoreTarget.mode === params.mode;
      const nextRestoreTarget = navigationRestoreTarget
        ?? initialRestoreTarget
        ?? (shouldReusePersistedRestoreTarget ? persistedRestoreTarget : null);

      if (shouldResetViewport) {
        resetViewportPosition();
      }
      if (shouldClearNavigationSource) {
        navigation.setChapterChangeSource(null);
      }

      if (nextRestoreTarget) {
        setPendingRestoreTarget(nextRestoreTarget, { force: true });
        startRestoreMaskForTarget(nextRestoreTarget);
        awaitingRestoreLoadKeyRef.current = loadKey;
        dispatchReaderLifecycleEvent({
          type: 'CHAPTER_LOAD_COMPLETED_NEEDS_RESTORE',
          loadKey,
        });
        return;
      }

      clearPendingRestoreTarget();
      stopRestoreMask();
      dispatchReaderLifecycleEvent({
        type: 'CHAPTER_LOAD_COMPLETED_NO_RESTORE',
        awaitingPagedLayout:
          isPagedReaderMode(params.mode)
          && currentPagedLayoutChapterIndex !== params.chapterIndex,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setControllerError(error as AppError);
      dispatchReaderLifecycleEvent({ type: 'CHAPTER_LOAD_FAILED' });
    }
  }, [
    clearPendingRestoreTarget,
    currentPagedLayoutChapterIndex,
    loadActiveChapter,
    navigation,
    novelId,
    resetViewportPosition,
    setPendingRestoreTarget,
    startRestoreMaskForTarget,
    stopRestoreMask,
  ]);

  useEffect(() => {
    hydrateReaderDataRef.current = hydrateReaderData;
    resetReaderContentRef.current = resetReaderContent;
    clearPendingRestoreTargetRef.current = clearPendingRestoreTarget;
    stopRestoreMaskRef.current = stopRestoreMask;
  }, [
    clearPendingRestoreTarget,
    hydrateReaderData,
    resetReaderContent,
    stopRestoreMask,
  ]);

  useEffect(() => {
    hasInitializedRef.current = false;
    lastRequestedLoadKeyRef.current = null;
    awaitingRestoreLoadKeyRef.current = null;
    queuedInitialLoadParamsRef.current = null;
    queuedInitialRestoreTargetRef.current = null;
    setControllerError(null);
    clearPendingRestoreTargetRef.current();
    stopRestoreMaskRef.current();
    resetReaderContentRef.current();
    navigation.setChapterChangeSource(null);
    dispatchReaderLifecycleEvent({ type: 'RESET' });

    if (!novelId) {
      hasInitializedRef.current = true;
      dispatchReaderLifecycleEvent({ type: 'HYDRATE_SUCCEEDED_NO_CHAPTERS' });
      return;
    }

    dispatchReaderLifecycleEvent({ type: 'NOVEL_OPEN_STARTED' });
    let cancelled = false;

    Promise.resolve().then(async () => {
      if (cancelled) {
        return;
      }

      try {
        const hydrateResult = await hydrateReaderDataRef.current();
        if (cancelled) {
          return;
        }

        if (!hydrateResult.hasChapters) {
          hasInitializedRef.current = true;
          dispatchReaderLifecycleEvent({ type: 'HYDRATE_SUCCEEDED_NO_CHAPTERS' });
          return;
        }

        dispatchReaderLifecycleEvent({ type: 'HYDRATE_SUCCEEDED_WITH_CHAPTERS' });
        const initialLoadParams = buildLoadParamsFromHydratedState(hydrateResult);
        hasInitializedRef.current = true;
        if (!initialLoadParams) {
          dispatchReaderLifecycleEvent({
            type: 'CHAPTER_LOAD_COMPLETED_NO_RESTORE',
            awaitingPagedLayout: false,
          });
          return;
        }

        queuedInitialLoadParamsRef.current = initialLoadParams;
        queuedInitialRestoreTargetRef.current = hydrateResult.initialRestoreTarget;
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setControllerError(error as AppError);
        dispatchReaderLifecycleEvent({ type: 'HYDRATE_FAILED' });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigation, novelId]);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      return;
    }
    if (chapters.length === 0) {
      return;
    }

    const queuedInitialLoadParams = queuedInitialLoadParamsRef.current;
    const nextLoadParams = queuedInitialLoadParams ?? {
      chapterIndex,
      mode,
    };
    const nextLoadKey = createLifecycleLoadKey({
      chapterIndex: nextLoadParams.chapterIndex,
      mode: nextLoadParams.mode,
      novelId,
    });

    if (
      queuedInitialLoadParams
      && currentLoadKey === nextLoadKey
      && lastRequestedLoadKeyRef.current === nextLoadKey
    ) {
      queuedInitialLoadParamsRef.current = null;
      queuedInitialRestoreTargetRef.current = null;
      return;
    }

    if (lastRequestedLoadKeyRef.current === nextLoadKey) {
      return;
    }

    const initialRestoreTarget = queuedInitialLoadParams
      ? queuedInitialRestoreTargetRef.current
      : null;
    const persistedRestoreTarget = pendingRestoreTarget;

    runChapterLoad(nextLoadParams, initialRestoreTarget, persistedRestoreTarget);
    if (queuedInitialLoadParams && currentLoadKey === nextLoadKey) {
      queuedInitialLoadParamsRef.current = null;
      queuedInitialRestoreTargetRef.current = null;
    }
  }, [
    chapterIndex,
    chapters.length,
    currentLoadKey,
    lifecycleStatus,
    mode,
    novelId,
    pendingRestoreTarget,
    runChapterLoad,
  ]);

  useEffect(() => {
    if (
      lifecycleStatus !== 'restoring-position'
      || awaitingRestoreLoadKeyRef.current !== currentLoadKey
      || pendingRestoreTarget !== null
    ) {
      return;
    }

    awaitingRestoreLoadKeyRef.current = null;
    dispatchReaderLifecycleEvent({
      type: 'RESTORE_SETTLED',
      result: 'completed',
      awaitingPagedLayout:
        isPagedMode && currentPagedLayoutChapterIndex !== chapterIndex,
    });
  }, [
    chapterIndex,
    currentLoadKey,
    currentPagedLayoutChapterIndex,
    isPagedMode,
    lifecycleStatus,
    pendingRestoreTarget,
  ]);

  useEffect(() => {
    if (
      lifecycleStatus !== 'awaiting-paged-layout'
      || !renderableChapter
      || !isPagedMode
      || currentPagedLayoutChapterIndex !== chapterIndex
    ) {
      return;
    }

    dispatchReaderLifecycleEvent({ type: 'PAGED_LAYOUT_READY' });
  }, [
    chapterIndex,
    currentPagedLayoutChapterIndex,
    isPagedMode,
    lifecycleStatus,
    renderableChapter,
  ]);

  const handleRestoreSettled = useCallback((result: 'completed' | 'failed' | 'skipped') => {
    if (awaitingRestoreLoadKeyRef.current !== currentLoadKey) {
      return;
    }

    awaitingRestoreLoadKeyRef.current = null;
    dispatchReaderLifecycleEvent({
      type: 'RESTORE_SETTLED',
      result,
      awaitingPagedLayout:
        result !== 'failed'
        && isPagedMode
        && currentPagedLayoutChapterIndex !== chapterIndex,
    });
  }, [
    chapterIndex,
    currentLoadKey,
    currentPagedLayoutChapterIndex,
    isPagedMode,
  ]);

  return {
    handleRestoreSettled,
    isChapterNavigationReady,
    isRestoringPosition,
    lifecycleStatus,
    loadingLabel,
    readerError,
    renderableChapter,
    showLoadingOverlay,
  };
}
