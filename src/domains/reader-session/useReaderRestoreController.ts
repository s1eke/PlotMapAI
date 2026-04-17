import { useCallback, useEffect, useRef } from 'react';
import type {
  ReaderMode,
  ReaderRestoreTarget,
  RestoreSettledResult,
  StoredReaderState,
} from '@shared/contracts/reader';
import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import { createReaderStateModeHints } from '@shared/utils/readerMode';
import { mergeStoredReaderState } from './state';
import {
  captureReaderStateSnapshot,
  solveModeRestoreTarget,
  toRestoreTargetFromState,
} from './readerModeState';
import {
  buildReaderModeSwitchDebugSnapshot,
  captureStrictModeSwitchState,
  verifyStrictModeRestoreCompletion,
} from './readerModeSwitchDebug';
import { getStoredReaderStateSnapshot, setLastRestoreResult } from './readerSessionStore';
import { useReaderRestoreResultTracker } from './readerRestoreResultTracker';
import { useReaderModeSwitchRollback } from './useReaderModeSwitchRollback';
import { usePendingRestoreTargetController } from './usePendingRestoreTargetController';
import {
  type StrictModeSwitchContentMode,
  useReaderStrictModeSwitch,
} from './useReaderStrictModeSwitch';
import {
  type UseReaderRestoreControllerParams,
  type UseReaderRestoreControllerResult,
} from './readerRestoreControllerTypes';
import { useSummaryRestoreRunner } from './useSummaryRestoreRunner';
import { useSummaryProgressPersistence } from './useSummaryProgressPersistence';
import { debugLog, setDebugSnapshot } from '@shared/debug';
export type { UseReaderRestoreControllerResult } from './readerRestoreControllerTypes';
export function useReaderRestoreController({
  sessionSnapshot,
  sessionCommands,
  currentChapter,
  summaryRestoreSignal,
  isChapterAnalysisLoading,
}: UseReaderRestoreControllerParams): UseReaderRestoreControllerResult {
  const viewport = useReaderViewportContext();
  const navigation = useReaderNavigationRuntime();
  const layoutQueries = useReaderLayoutQueries();
  const persistence = useReaderPersistenceRuntime();
  const { chapterIndex, mode, pendingRestoreTarget } = sessionSnapshot;
  const { latestReaderStateRef, markUserInteracted, persistReaderState, setChapterIndex, setMode } =
    sessionCommands;
  const captureCurrentReaderPositionRef =
    useRef<(options?: { flush?: boolean }) => StoredReaderState>(() => ({}));
  const modeSnapshotRef = useRef<Record<ReaderMode, ReaderRestoreTarget | null>>({
    paged: null,
    scroll: null,
    summary: null,
  });
  const pendingStrictScrollVerificationFrameRef = useRef<number | null>(null);
  const isActiveChapterResolved = currentChapter?.index === chapterIndex;
  const {
    clearPendingRestoreTarget,
    pendingRestoreTargetRef,
    setPendingRestoreTarget,
    startRestoreMaskForTarget,
    stopRestoreMask,
    suppressScrollSyncTemporarily,
  } = usePendingRestoreTargetController({
    pendingRestoreTarget,
    persistence,
  });
  const {
    bufferStrictModeRestoreSettled,
    beginStrictModeSwitchTransaction,
    clearModeSwitchError,
    completeStrictModeSwitchTransaction,
    consumeBufferedStrictModeRestoreSettled,
    finalizeStrictModeSwitchFailure,
    flushPersistenceForStrictMode,
    getStrictModeSwitchTransaction,
    handleStrictModeRestoreSettled,
    modeSwitchError,
    setStrictModeSwitchTransaction,
    shouldScheduleRestoreRetry,
    strictModeSwitchEnabled,
  } = useReaderStrictModeSwitch();
  const {
    getRestoreAttempt,
    recordRestoreResult,
    retryLastFailedRestore,
  } = useReaderRestoreResultTracker({
    shouldScheduleRetry: shouldScheduleRestoreRetry,
    setPendingRestoreTarget,
    startRestoreMaskForTarget,
  });
  const rememberModeState = useCallback((target: ReaderRestoreTarget) => {
    modeSnapshotRef.current[target.mode] = target;
  }, []);
  const {
    handleRestoreSettled: handleModeSwitchRestoreSettled,
    rememberModeSwitchSource,
  } = useReaderModeSwitchRollback({
    persistReaderState,
    rememberModeState,
    setMode,
    setPendingRestoreTarget,
    suppressScrollSyncTemporarily,
  });
  const captureCurrentReaderPosition = useCallback(
    (options?: { flush?: boolean }): StoredReaderState => {
      const nextState = captureReaderStateSnapshot({
        chapterIndex,
        currentAnchor: layoutQueries.getCurrentAnchor(),
        currentOriginalLocator: layoutQueries.getCurrentOriginalLocator(),
        currentPagedLocator: layoutQueries.getCurrentPagedLocator(),
        latestReaderState: latestReaderStateRef.current,
        mode,
        navigationSource: navigation.getChapterChangeSource(),
        storedReaderState: getStoredReaderStateSnapshot(),
        viewportContentElement: viewport.contentRef.current,
      });
      rememberModeState(toRestoreTargetFromState({
        chapterIndex,
        mode,
        state: nextState,
      }));
      persistReaderState(nextState, { flush: options?.flush });
      return mergeStoredReaderState(latestReaderStateRef.current, nextState);
    },
    [
      chapterIndex,
      latestReaderStateRef,
      layoutQueries,
      mode,
      navigation,
      persistReaderState,
      rememberModeState,
      viewport.contentRef,
    ],
  );

  useEffect(() => { captureCurrentReaderPositionRef.current = captureCurrentReaderPosition; },
    [captureCurrentReaderPosition]);
  useEffect(() =>
    persistence.registerBeforeFlush(() => { captureCurrentReaderPositionRef.current(); }),
  [persistence]);

  const cancelPendingStrictScrollVerification = useCallback(() => {
    if (pendingStrictScrollVerificationFrameRef.current !== null) {
      cancelAnimationFrame(pendingStrictScrollVerificationFrameRef.current);
      pendingStrictScrollVerificationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelPendingStrictScrollVerification();
    };
  }, [cancelPendingStrictScrollVerification]);

  const verifyStrictModeRestoreTarget = useCallback((
    strictTransaction: NonNullable<ReturnType<typeof getStrictModeSwitchTransaction>>,
  ) => {
    const verificationFailure = verifyStrictModeRestoreCompletion({
      chapterIndex: strictTransaction.chapterIndex,
      contentElement: viewport.contentRef.current,
      currentOriginalLocator: layoutQueries.getCurrentOriginalLocator(),
      currentPageIndex: navigation.getPagedState().pageIndex,
      resolvePagedLocatorPageIndex: (locator) => (
        locator ? layoutQueries.resolvePagedLocatorPageIndex(locator) : null
      ),
      resolveScrollLocatorOffset: (locator) => (
        layoutQueries.resolveScrollLocatorOffset(locator)
      ),
      targetMode: strictTransaction.targetMode,
      targetRestoreTarget: strictTransaction.targetRestoreTarget,
    });
    if (verificationFailure) {
      setLastRestoreResult(verificationFailure.restoreResult);
      finalizeStrictModeSwitchFailure({
        chapterIndex: strictTransaction.chapterIndex,
        message: verificationFailure.message,
        restoreResult: verificationFailure.restoreResult,
        sourceMode: strictTransaction.sourceMode,
        stage: 'restore_target',
        targetMode: strictTransaction.targetMode,
      });
      return true;
    }

    completeStrictModeSwitchTransaction();
    return true;
  }, [
    completeStrictModeSwitchTransaction,
    finalizeStrictModeSwitchFailure,
    layoutQueries,
    navigation,
    viewport.contentRef,
  ]);

  const processStrictModeRestoreSettled = useCallback((result: RestoreSettledResult): boolean => {
    const strictTransaction = getStrictModeSwitchTransaction();
    if (!strictTransaction?.strict || strictTransaction.stage !== 'restore_target') {
      return false;
    }

    if (result === 'completed') {
      if (strictTransaction.targetMode === 'scroll') {
        cancelPendingStrictScrollVerification();
        completeStrictModeSwitchTransaction();
        return true;
      }

      cancelPendingStrictScrollVerification();
      return verifyStrictModeRestoreTarget(strictTransaction);
    }

    return handleStrictModeRestoreSettled(result);
  }, [
    cancelPendingStrictScrollVerification,
    completeStrictModeSwitchTransaction,
    getStrictModeSwitchTransaction,
    handleStrictModeRestoreSettled,
    verifyStrictModeRestoreTarget,
  ]);

  const switchMode = useCallback(async (targetMode: ReaderMode): Promise<void> => {
    if (targetMode === mode) return;

    clearModeSwitchError();
    const isStrictModeSwitch =
      strictModeSwitchEnabled
      && mode !== 'summary'
      && targetMode !== 'summary';
    const strictSourceMode = mode as StrictModeSwitchContentMode;
    const strictTargetMode = targetMode as StrictModeSwitchContentMode;
    const strictCapture = isStrictModeSwitch ? captureStrictModeSwitchState({
      chapterIndex,
      currentOriginalLocator: layoutQueries.getCurrentOriginalLocator(),
      currentPagedLocator: layoutQueries.getCurrentPagedLocator(),
      latestReaderState: latestReaderStateRef.current,
      mode: strictSourceMode,
    }) : null;
    if (strictCapture && !strictCapture.ok) {
      throw finalizeStrictModeSwitchFailure({
        chapterIndex,
        message: strictCapture.message,
        sourceMode: strictSourceMode,
        stage: 'capture_source',
        targetMode: strictTargetMode,
      });
    }
    const currentReaderState = strictCapture?.ok
      ? strictCapture.state
      : captureCurrentReaderPosition();
    const sourceRestoreTarget = {
      ...toRestoreTargetFromState({
        chapterIndex,
        mode,
        state: currentReaderState,
      }),
      mode,
    };
    const targetRestoreTarget = solveModeRestoreTarget({
      baseTarget: {
        ...toRestoreTargetFromState({
          chapterIndex,
          mode,
          state: currentReaderState,
        }),
        mode: targetMode,
      },
      chapterIndex,
      currentReaderState,
      mode,
      modeSnapshots: modeSnapshotRef.current,
      targetMode,
    });
    const nextLastContentMode = currentReaderState.hints?.contentMode
      ?? (mode === 'paged' ? 'paged' : 'scroll');
    const nextPersistedState = mergeStoredReaderState(currentReaderState, {
      hints: {
        ...currentReaderState.hints,
        ...createReaderStateModeHints(targetMode, nextLastContentMode),
        chapterProgress: targetMode === 'summary'
          ? targetRestoreTarget.chapterProgress ?? 0
          : currentReaderState.hints?.chapterProgress,
      },
    });

    if (!isStrictModeSwitch) {
      rememberModeSwitchSource({
        previousMode: mode,
        previousRestoreTarget: sourceRestoreTarget,
        previousState: currentReaderState,
      });
    } else {
      rememberModeState(sourceRestoreTarget);
    }

    if (isStrictModeSwitch) {
      persistReaderState(currentReaderState, { flush: true });
      const strictModeSwitchPromise = beginStrictModeSwitchTransaction({
        chapterIndex: targetRestoreTarget.chapterIndex,
        sourceMode: strictSourceMode,
        stage: 'capture_source',
        strict: true,
        targetMode: strictTargetMode,
        targetRestoreTarget,
      });
      const captureFailure = await flushPersistenceForStrictMode();
      if (captureFailure) {
        throw finalizeStrictModeSwitchFailure({
          chapterIndex: targetRestoreTarget.chapterIndex,
          message: captureFailure.message,
          sourceMode: strictSourceMode,
          stage: 'capture_source',
          targetMode: strictTargetMode,
        });
      }
      markUserInteracted();
      setChapterIndex(targetRestoreTarget.chapterIndex);
      rememberModeState(targetRestoreTarget);
      setPendingRestoreTarget(targetRestoreTarget, { force: true });
      startRestoreMaskForTarget(targetRestoreTarget);
      setMode(targetMode);
      setStrictModeSwitchTransaction({
        chapterIndex: targetRestoreTarget.chapterIndex,
        sourceMode: strictSourceMode,
        stage: 'persist_target_state',
        strict: true,
        targetMode: strictTargetMode,
        targetRestoreTarget,
      });
      persistReaderState(nextPersistedState, { flush: true });
      const targetPersistenceFailure = await flushPersistenceForStrictMode();
      if (targetPersistenceFailure) {
        clearPendingRestoreTarget();
        stopRestoreMask();
        throw finalizeStrictModeSwitchFailure({
          chapterIndex: targetRestoreTarget.chapterIndex,
          message: targetPersistenceFailure.message,
          sourceMode: strictSourceMode,
          stage: 'persist_target_state',
          targetMode: strictTargetMode,
        });
      }
      setStrictModeSwitchTransaction({
        chapterIndex: targetRestoreTarget.chapterIndex,
        sourceMode: strictSourceMode,
        stage: 'restore_target',
        strict: true,
        targetMode: strictTargetMode,
        targetRestoreTarget,
      });
      const bufferedRestoreSettledResult = consumeBufferedStrictModeRestoreSettled();
      if (bufferedRestoreSettledResult) {
        processStrictModeRestoreSettled(bufferedRestoreSettledResult);
      }
      try {
        await strictModeSwitchPromise;
      } catch (error) {
        clearPendingRestoreTarget();
        stopRestoreMask();
        throw error;
      }
      const modeSwitchSnapshot = buildReaderModeSwitchDebugSnapshot({
        nextPersistedState,
        previousMode: mode,
        strictModeSwitchEnabled: true,
        targetMode,
        targetRestoreTarget,
      });
      setDebugSnapshot('reader-mode-switch', modeSwitchSnapshot);
      debugLog('Reader', 'reader mode switched', modeSwitchSnapshot);
      return;
    }
    markUserInteracted();
    setChapterIndex(targetRestoreTarget.chapterIndex);
    rememberModeState(targetRestoreTarget);
    setPendingRestoreTarget(targetRestoreTarget, { force: true });
    setMode(targetMode);
    persistReaderState(nextPersistedState);

    const modeSwitchSnapshot = buildReaderModeSwitchDebugSnapshot({
      nextPersistedState,
      previousMode: mode,
      strictModeSwitchEnabled: false,
      targetMode,
      targetRestoreTarget,
    });
    setDebugSnapshot('reader-mode-switch', modeSwitchSnapshot);
    debugLog('Reader', 'reader mode switched', modeSwitchSnapshot);
  }, [
    beginStrictModeSwitchTransaction,
    captureCurrentReaderPosition,
    clearPendingRestoreTarget,
    clearModeSwitchError,
    consumeBufferedStrictModeRestoreSettled,
    finalizeStrictModeSwitchFailure,
    flushPersistenceForStrictMode,
    markUserInteracted,
    mode,
    persistReaderState,
    processStrictModeRestoreSettled,
    rememberModeSwitchSource,
    rememberModeState,
    setChapterIndex,
    setMode,
    setPendingRestoreTarget,
    startRestoreMaskForTarget,
    setStrictModeSwitchTransaction,
    stopRestoreMask,
    strictModeSwitchEnabled,
    chapterIndex,
    latestReaderStateRef,
    layoutQueries,
  ]);

  const handleRestoreSettled = useCallback((result: RestoreSettledResult): boolean => {
    const strictTransaction = getStrictModeSwitchTransaction();
    if (strictTransaction?.strict) {
      if (strictTransaction.stage !== 'restore_target') {
        bufferStrictModeRestoreSettled(result);
        return false;
      }

      if (processStrictModeRestoreSettled(result)) {
        return false;
      }
    }

    return handleModeSwitchRestoreSettled(result, mode);
  }, [
    bufferStrictModeRestoreSettled,
    getStrictModeSwitchTransaction,
    handleModeSwitchRestoreSettled,
    mode,
    processStrictModeRestoreSettled,
  ]);

  useSummaryRestoreRunner({
    chapterIndex,
    clearPendingRestoreTarget,
    currentChapterIndex: currentChapter?.index,
    enabled: isActiveChapterResolved && !isChapterAnalysisLoading,
    getRestoreAttempt,
    mode,
    notifyRestoreSettled: persistence.notifyRestoreSettled,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    recordRestoreResult,
    setChapterChangeSource: navigation.setChapterChangeSource,
    stopRestoreMask,
    summaryRestoreSignal,
    suppressScrollSyncTemporarily,
    viewportContentRef: viewport.contentRef,
  });

  useEffect(() => () => { captureCurrentReaderPositionRef.current(); }, []);
  const { handleContentScroll } = useSummaryProgressPersistence({
    chapterIndex,
    mode,
    pendingRestoreTargetRef,
    persistReaderState,
    isScrollSyncSuppressed: persistence.isScrollSyncSuppressed,
    viewportContentRef: viewport.contentRef,
  });
  const handleBeforeChapterChange = useCallback(() => {
    clearPendingRestoreTarget();
    stopRestoreMask();
    suppressScrollSyncTemporarily();
  }, [clearPendingRestoreTarget, stopRestoreMask, suppressScrollSyncTemporarily]);
  return {
    modeSwitchError,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    captureCurrentReaderPosition,
    clearPendingRestoreTarget,
    handleBeforeChapterChange,
    handleContentScroll,
    handleRestoreSettled,
    getRestoreAttempt,
    recordRestoreResult,
    retryLastFailedRestore,
    setPendingRestoreTarget,
    startRestoreMaskForTarget,
    stopRestoreMask,
    suppressScrollSyncTemporarily,
    switchMode,
  };
}
export const useReaderRestoreFlow = useReaderRestoreController;
export type UseReaderRestoreFlowResult = UseReaderRestoreControllerResult;
