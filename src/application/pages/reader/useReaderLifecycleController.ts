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
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import { isPagedReaderMode } from '@shared/utils/readerMode';
import { shouldKeepReaderRestoreMask } from '@shared/utils/readerPosition';

import type {
  ReaderLifecycleControllerResult,
  ReaderLifecycleStatus,
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

  const chapterIndex = result.resolvedState.chapterIndex ?? result.storedState.chapterIndex ?? 0;
  const mode = result.resolvedState.mode ?? result.storedState.mode ?? 'scroll';

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
  const [lifecycleStatus, setLifecycleStatus] = useState<ReaderLifecycleStatus>('hydrating');
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
  const isAwaitingPagedLayout = Boolean(
    isPagedMode
    && renderableChapter
    && currentPagedLayoutChapterIndex !== chapterIndex,
  );
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
  ) => {
    const loadKey = createLifecycleLoadKey({
      chapterIndex: params.chapterIndex,
      mode: params.mode,
      novelId,
    });
    lastRequestedLoadKeyRef.current = loadKey;
    awaitingRestoreLoadKeyRef.current = null;
    setControllerError(null);
    setLifecycleStatus('loading-chapter');

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
      const nextRestoreTarget = navigationRestoreTarget ?? initialRestoreTarget;

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
        setLifecycleStatus('restoring-position');
        return;
      }

      clearPendingRestoreTarget();
      stopRestoreMask();
      if (!isPagedReaderMode(params.mode)) {
        setLifecycleStatus('ready');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setControllerError(error as AppError);
      setLifecycleStatus('error');
    }
  }, [
    clearPendingRestoreTarget,
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
    setLifecycleStatus('hydrating');

    if (!novelId) {
      hasInitializedRef.current = true;
      setLifecycleStatus('ready');
      return;
    }

    let cancelled = false;

    Promise.resolve().then(async () => {
      if (cancelled) {
        return;
      }

      setLifecycleStatus('loading-chapters');

      try {
        const hydrateResult = await hydrateReaderDataRef.current();
        if (cancelled) {
          return;
        }

        if (!hydrateResult.hasChapters) {
          hasInitializedRef.current = true;
          setLifecycleStatus('ready');
          return;
        }

        const initialLoadParams = buildLoadParamsFromHydratedState(hydrateResult);
        hasInitializedRef.current = true;
        if (!initialLoadParams) {
          setLifecycleStatus('ready');
          return;
        }

        queuedInitialLoadParamsRef.current = initialLoadParams;
        queuedInitialRestoreTargetRef.current = hydrateResult.initialRestoreTarget;
        setLifecycleStatus('loading-chapter');
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setControllerError(error as AppError);
        setLifecycleStatus('error');
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

    runChapterLoad(nextLoadParams, initialRestoreTarget);
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
    runChapterLoad,
  ]);

  useEffect(() => {
    if (!renderableChapter || !isPagedMode || currentPagedLayoutChapterIndex !== chapterIndex) {
      return;
    }

    if (lifecycleStatus === 'loading-chapter') {
      setLifecycleStatus('ready');
      return;
    }

    if (
      lifecycleStatus === 'restoring-position'
      && awaitingRestoreLoadKeyRef.current === currentLoadKey
      && pendingRestoreTarget === null
    ) {
      awaitingRestoreLoadKeyRef.current = null;
      setLifecycleStatus('ready');
    }
  }, [
    chapterIndex,
    currentLoadKey,
    currentPagedLayoutChapterIndex,
    isPagedMode,
    lifecycleStatus,
    pendingRestoreTarget,
    renderableChapter,
  ]);

  const handleRestoreSettled = useCallback((result: 'completed' | 'failed' | 'skipped') => {
    if (awaitingRestoreLoadKeyRef.current !== currentLoadKey) {
      return;
    }

    awaitingRestoreLoadKeyRef.current = null;
    if (result === 'failed') {
      setLifecycleStatus('error');
      return;
    }

    if (isPagedMode && currentPagedLayoutChapterIndex !== chapterIndex) {
      return;
    }

    setLifecycleStatus('ready');
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
