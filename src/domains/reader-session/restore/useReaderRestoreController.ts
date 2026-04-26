import { useCallback, useRef } from 'react';
import type {
  ReaderMode,
  ReaderRestoreTarget,
  RestoreSettledResult,
} from '@shared/contracts/reader';
import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import { createReaderStateModeHints } from '@shared/utils/readerMode';
import { mergeStoredReaderState } from '@shared/utils/readerStoredState';
import {
  solveModeRestoreTarget,
  toRestoreTargetFromState,
} from './readerModeState';
import {
  buildReaderModeSwitchDebugSnapshot,
  captureStrictModeSwitchState,
} from '../mode-switch/readerModeSwitchDebug';
import { useReaderRestoreResultTracker } from './readerRestoreResultTracker';
import { useReaderModeSwitchRollback } from '../mode-switch/useReaderModeSwitchRollback';
import { usePendingRestoreTargetController } from './usePendingRestoreTargetController';
import {
  type StrictModeSwitchContentMode,
  type ModeSwitchTransactionStage,
  useReaderStrictModeSwitch,
} from '../mode-switch/useReaderStrictModeSwitch';
import {
  type UseReaderRestoreControllerParams,
  type UseReaderRestoreControllerResult,
} from './readerRestoreControllerTypes';
import { useSummaryRestoreRunner } from './useSummaryRestoreRunner';
import { useStrictModeRestoreVerification } from './useStrictModeRestoreVerification';
import { debugLog, setDebugSnapshot } from '@shared/debug';
import {
  traceModeSwitchError,
  traceModeSwitchFinished,
  traceModeSwitchStarted,
  traceModeSwitchTargetResolved,
} from '../mode-switch/readerModeSwitchTrace';
import { useReaderPositionCapture } from '../hooks/useReaderPositionCapture';
import {
  createScrollPagedContinuitySnapshot,
  resolveNextChapterProgress,
  resolveScrollContinuityTarget,
  type ScrollPagedContinuitySnapshot,
} from './readerModeContinuity';
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
  const { chapterIndex, mode, pendingRestoreTarget, restoreStatus } = sessionSnapshot;
  const { latestReaderStateRef, markUserInteracted, persistReaderState, setChapterIndex, setMode } =
    sessionCommands;
  const modeSnapshotRef = useRef<Record<ReaderMode, ReaderRestoreTarget | null>>({
    paged: null,
    scroll: null,
    summary: null,
  });
  const scrollPagedContinuityRef = useRef<ScrollPagedContinuitySnapshot | null>(null);
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
  const captureCurrentReaderPosition = useReaderPositionCapture({
    chapterIndex,
    latestReaderStateRef,
    layoutQueries,
    mode,
    navigation,
    persistence,
    persistReaderState,
    rememberModeState,
    viewportContentRef: viewport.contentRef,
  });
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
  const { processStrictModeRestoreSettled } = useStrictModeRestoreVerification({
    completeStrictModeSwitchTransaction,
    contentRef: viewport.contentRef,
    finalizeStrictModeSwitchFailure,
    getCurrentOriginalLocator: layoutQueries.getCurrentOriginalLocator,
    getPagedState: navigation.getPagedState,
    getStrictModeSwitchTransaction,
    handleStrictModeRestoreSettled,
    resolvePagedLocatorPageIndex: (locator) => (
      locator ? layoutQueries.resolvePagedLocatorPageIndex(locator) : null
    ),
    resolveScrollLocatorOffset: (locator) => (
      layoutQueries.resolveScrollLocatorOffset(locator)
    ),
  });
  const switchMode = useCallback(async (targetMode: ReaderMode): Promise<void> => {
    if (targetMode === mode) return;

    const isStrictModeSwitch =
      strictModeSwitchEnabled
      && mode !== 'summary'
      && targetMode !== 'summary';
    const strictSourceMode = mode as StrictModeSwitchContentMode;
    const strictTargetMode = targetMode as StrictModeSwitchContentMode;
    let modeSwitchStage: ModeSwitchTransactionStage = 'capture_source';

    traceModeSwitchStarted({
      chapterIndex,
      restoreStatus,
      sourceMode: mode,
      strict: isStrictModeSwitch,
      targetMode,
    });
    try {
      clearModeSwitchError();
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
      let targetRestoreTarget = solveModeRestoreTarget({
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
      if (isStrictModeSwitch && strictSourceMode === 'paged' && strictTargetMode === 'scroll') {
        const currentPagedState = navigation.getPagedState();
        const sourcePageIndex =
          sourceRestoreTarget.locator?.pageIndex ?? sourceRestoreTarget.pageIndex;
        const continuitySourceTarget = typeof sourcePageIndex === 'number'
          || typeof currentPagedState.pageIndex !== 'number'
          ? sourceRestoreTarget
          : {
            ...sourceRestoreTarget,
            pageIndex: currentPagedState.pageIndex,
            locator: sourceRestoreTarget.locator
              ? {
                ...sourceRestoreTarget.locator,
                pageIndex: currentPagedState.pageIndex,
              }
              : sourceRestoreTarget.locator,
          };
        targetRestoreTarget = resolveScrollContinuityTarget({
          continuitySnapshot: scrollPagedContinuityRef.current,
          sourceTarget: continuitySourceTarget,
        }) ?? targetRestoreTarget;
      }
      const nextLastContentMode = currentReaderState.hints?.contentMode
        ?? (mode === 'paged' ? 'paged' : 'scroll');
      const nextPersistedState = mergeStoredReaderState(currentReaderState, {
        hints: {
          ...currentReaderState.hints,
          ...createReaderStateModeHints(targetMode, nextLastContentMode),
          chapterProgress: resolveNextChapterProgress({
            currentReaderState,
            targetMode,
            targetRestoreTarget,
          }),
          ...(targetMode !== mode
            ? {
              pageIndex: undefined,
              pagedProjection: undefined,
            }
            : {}),
        },
      });
      traceModeSwitchTargetResolved({
        chapterIndex,
        nextLastContentMode,
        restoreStatus,
        sourceMode: mode,
        strict: isStrictModeSwitch,
        targetMode,
        targetRestoreTarget,
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
        modeSwitchStage = 'persist_target_state';
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
        modeSwitchStage = 'restore_target';
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
        if (strictSourceMode === 'scroll' && strictTargetMode === 'paged') {
          const { pageIndex } = navigation.getPagedState();
          Object.assign(scrollPagedContinuityRef, {
            current: createScrollPagedContinuitySnapshot({
              pagedPageIndex: pageIndex,
              sourceTarget: sourceRestoreTarget,
            }),
          });
        } else if (strictSourceMode === 'paged' && strictTargetMode === 'scroll') {
          Object.assign(scrollPagedContinuityRef, {
            current: null,
          });
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
        traceModeSwitchFinished({
          restoreStatus,
          sourceMode: mode,
          strict: true,
          targetMode,
          targetRestoreTarget,
        });
        return;
      }
      markUserInteracted();
      setChapterIndex(targetRestoreTarget.chapterIndex);
      rememberModeState(targetRestoreTarget);
      setPendingRestoreTarget(targetRestoreTarget, { force: true });
      startRestoreMaskForTarget(targetRestoreTarget);
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
      traceModeSwitchFinished({
        restoreStatus,
        sourceMode: mode,
        strict: false,
        targetMode,
        targetRestoreTarget,
      });
    } catch (error) {
      traceModeSwitchError({
        chapterIndex,
        error,
        restoreStatus,
        sourceMode: mode,
        stage: modeSwitchStage,
        strict: isStrictModeSwitch,
        targetMode,
      });
      throw error;
    }
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
    restoreStatus,
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
    navigation,
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
  const handleContentScroll = useCallback(() => {}, []);
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
