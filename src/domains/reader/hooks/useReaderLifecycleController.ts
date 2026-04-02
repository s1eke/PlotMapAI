import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppError } from '@shared/errors';

import type { ChapterContent } from '../readerContentService';
import { isPagedReaderMode } from '../utils/readerMode';
import { shouldKeepReaderRestoreMask } from '../utils/readerPosition';
import type { ReaderMode, ReaderRestoreTarget } from './useReaderStatePersistence';
import type {
  ReaderHydrateDataResult,
  ReaderLoadActiveChapterParams,
  UseReaderChapterDataResult,
} from './useReaderChapterData';

export type ReaderLifecycleStatus =
  | 'hydrating'
  | 'loading-chapters'
  | 'loading-chapter'
  | 'restoring-position'
  | 'ready'
  | 'error';

interface ReaderLifecycleControllerChapterData {
  chapters: UseReaderChapterDataResult['chapters'];
  currentChapter: UseReaderChapterDataResult['currentChapter'];
  loadingMessage: UseReaderChapterDataResult['loadingMessage'];
  readerError: UseReaderChapterDataResult['readerError'];
  hydrateReaderData: UseReaderChapterDataResult['hydrateReaderData'];
  loadActiveChapter: UseReaderChapterDataResult['loadActiveChapter'];
  resetReaderContent: UseReaderChapterDataResult['resetReaderContent'];
}

interface ReaderLifecycleControllerRestoreFlow {
  pendingRestoreTarget: ReaderRestoreTarget | null;
  clearPendingRestoreTarget: () => void;
  setPendingRestoreTarget: (
    nextTarget: ReaderRestoreTarget | null,
    options?: { force?: boolean },
  ) => void;
  startRestoreMaskForTarget: (target: ReaderRestoreTarget | null | undefined) => void;
  stopRestoreMask: () => void;
}

interface UseReaderLifecycleControllerParams {
  novelId: number;
  chapterIndex: number;
  mode: ReaderMode;
  currentPagedLayoutChapterIndex: number | null;
  chapterData: ReaderLifecycleControllerChapterData;
  restoreFlow: ReaderLifecycleControllerRestoreFlow;
}

export interface UseReaderLifecycleControllerResult {
  lifecycleStatus: ReaderLifecycleStatus;
  loadingLabel: string | null;
  readerError: AppError | null;
  showLoadingOverlay: boolean;
  renderableChapter: ChapterContent | null;
  isRestoringPosition: boolean;
  isChapterNavigationReady: boolean;
  handleRestoreSettled: (result: 'completed' | 'skipped' | 'failed') => void;
}

function createLifecycleLoadKey(params: {
  novelId: number;
  chapterIndex: number;
  mode: ReaderMode;
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
  novelId,
  chapterIndex,
  mode,
  currentPagedLayoutChapterIndex,
  chapterData,
  restoreFlow,
}: UseReaderLifecycleControllerParams): UseReaderLifecycleControllerResult {
  const { t } = useTranslation();
  const {
    chapters,
    currentChapter,
    loadingMessage,
    readerError: chapterDataError,
    hydrateReaderData,
    loadActiveChapter,
    resetReaderContent,
  } = chapterData;
  const {
    pendingRestoreTarget,
    clearPendingRestoreTarget,
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
    novelId,
    chapterIndex,
    mode,
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

  const runChapterLoad = useCallback(async (
    params: ReaderLoadActiveChapterParams,
    initialRestoreTarget: ReaderRestoreTarget | null,
  ) => {
    const loadKey = createLifecycleLoadKey({
      novelId,
      chapterIndex: params.chapterIndex,
      mode: params.mode,
    });
    lastRequestedLoadKeyRef.current = loadKey;
    awaitingRestoreLoadKeyRef.current = null;
    setControllerError(null);
    setLifecycleStatus('loading-chapter');

    try {
      const { navigationRestoreTarget } = await loadActiveChapter(params);
      const nextRestoreTarget = navigationRestoreTarget ?? initialRestoreTarget;

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
    novelId,
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
  }, [
    novelId,
  ]);

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
      novelId,
      chapterIndex: nextLoadParams.chapterIndex,
      mode: nextLoadParams.mode,
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
    chapters.length,
    chapterIndex,
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
    renderableChapter,
    pendingRestoreTarget,
  ]);

  const handleRestoreSettled = useCallback((result: 'completed' | 'skipped' | 'failed') => {
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
    lifecycleStatus,
    loadingLabel,
    readerError,
    showLoadingOverlay,
    renderableChapter,
    isRestoringPosition,
    isChapterNavigationReady,
    handleRestoreSettled,
  };
}
