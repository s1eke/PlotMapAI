import { useCallback, useEffect, useRef } from 'react';
import type { ChapterContent } from '@shared/contracts/reader';
import type { ReaderSessionSnapshot } from './useReaderSession';
import type {
  ReaderMode,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  ReaderSessionCommands,
  RestoreSettledResult,
  StoredReaderState,
} from '@shared/contracts/reader';
import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import { getContainerProgress, shouldKeepReaderRestoreMask } from '@shared/utils/readerPosition';
import { createReaderStateModeHints } from '@shared/utils/readerMode';
import { mergeStoredReaderState } from './state';
import {
  captureReaderStateSnapshot,
  solveModeRestoreTarget,
  toRestoreTargetFromState,
} from './readerModeState';
import {
  beginRestore,
  completeRestore,
  getStoredReaderStateSnapshot,
  setPendingRestoreTarget as setStorePendingRestoreTarget,
} from './readerSessionStore';
import { useReaderRestoreResultTracker } from './readerRestoreResultTracker';
import { useReaderModeSwitchRollback } from './useReaderModeSwitchRollback';
import {
  type StrictModeSwitchContentMode,
  useReaderStrictModeSwitch,
} from './useReaderStrictModeSwitch';
import { useSummaryRestoreRunner } from './useSummaryRestoreRunner';
import { debugLog, setDebugSnapshot } from '@shared/debug';

interface UseReaderRestoreControllerParams {
  sessionSnapshot: Pick<
    ReaderSessionSnapshot,
    'chapterIndex' | 'mode' | 'pendingRestoreTarget'
  >;
  sessionCommands: Pick<
    ReaderSessionCommands,
    | 'latestReaderStateRef'
    | 'markUserInteracted'
    | 'persistReaderState'
    | 'setChapterIndex'
    | 'setMode'
  >;
  currentChapter: ChapterContent | null;
  summaryRestoreSignal: unknown;
  isChapterAnalysisLoading: boolean;
}

export interface UseReaderRestoreControllerResult {
  modeSwitchError: ReturnType<typeof useReaderStrictModeSwitch>['modeSwitchError'];
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  captureCurrentReaderPosition: (options?: { flush?: boolean }) => StoredReaderState;
  clearPendingRestoreTarget: () => void;
  handleBeforeChapterChange: () => void;
  handleContentScroll: () => void;
  handleRestoreSettled: (result: RestoreSettledResult) => boolean;
  switchMode: (targetMode: ReaderMode) => Promise<void>;
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  retryLastFailedRestore: () => boolean;
  setPendingRestoreTarget: (
    nextTarget: ReaderRestoreTarget | null,
    options?: { force?: boolean },
  ) => void;
  startRestoreMaskForTarget: (target: ReaderRestoreTarget | null | undefined) => void;
  stopRestoreMask: () => void;
  suppressScrollSyncTemporarily: () => void;
}

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
  const {
    latestReaderStateRef,
    markUserInteracted,
    persistReaderState,
    setChapterIndex,
    setMode,
  } = sessionCommands;
  const pendingRestoreTargetRef = useRef<ReaderRestoreTarget | null>(pendingRestoreTarget);
  const captureCurrentReaderPositionRef =
    useRef<(options?: { flush?: boolean }) => StoredReaderState>(() => ({}));
  const modeSnapshotRef = useRef<Record<ReaderMode, ReaderRestoreTarget | null>>({
    paged: null,
    scroll: null,
    summary: null,
  });
  const summaryProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveChapterResolved = currentChapter?.index === chapterIndex;

  useEffect(() => {
    pendingRestoreTargetRef.current = pendingRestoreTarget;
  }, [pendingRestoreTarget]);

  const setPendingRestoreTarget = useCallback(
    (nextTarget: ReaderRestoreTarget | null, options?: { force?: boolean }) => {
      if (!nextTarget) {
        pendingRestoreTargetRef.current = null;
        setStorePendingRestoreTarget(null);
        return;
      }

      if (options?.force) {
        pendingRestoreTargetRef.current = nextTarget;
        setStorePendingRestoreTarget(nextTarget);
        return;
      }

      pendingRestoreTargetRef.current = shouldKeepReaderRestoreMask(nextTarget)
        ? nextTarget
        : null;
      setStorePendingRestoreTarget(
        shouldKeepReaderRestoreMask(nextTarget) ? nextTarget : null,
      );
    },
    [],
  );
  const clearPendingRestoreTarget = useCallback(() => {
    pendingRestoreTargetRef.current = null;
    setStorePendingRestoreTarget(null);
  }, []);
  const startRestoreMaskForTarget = useCallback(
    (target: ReaderRestoreTarget | null | undefined) => {
      if (shouldKeepReaderRestoreMask(target)) {
        beginRestore(target);
        return;
      }

      completeRestore();
    },
    [],
  );
  const stopRestoreMask = useCallback(() => { completeRestore(); }, []);

  const suppressScrollSyncTemporarily = useCallback(() => {
    persistence.suppressScrollSyncTemporarily();
  }, [persistence]);
  const {
    clearModeSwitchError,
    finalizeStrictModeSwitchFailure,
    flushPersistenceForStrictMode,
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

  useEffect(() => {
    captureCurrentReaderPositionRef.current = captureCurrentReaderPosition;
  }, [captureCurrentReaderPosition]);

  useEffect(() => {
    return persistence.registerBeforeFlush(() => {
      captureCurrentReaderPositionRef.current();
    });
  }, [persistence]);

  const switchMode = useCallback(async (targetMode: ReaderMode): Promise<void> => {
    if (targetMode === mode) return;

    clearModeSwitchError();
    const isStrictModeSwitch =
      strictModeSwitchEnabled
      && mode !== 'summary'
      && targetMode !== 'summary';
    const strictSourceMode = mode as StrictModeSwitchContentMode;
    const strictTargetMode = targetMode as StrictModeSwitchContentMode;
    const currentReaderState = captureCurrentReaderPosition(isStrictModeSwitch
      ? { flush: true }
      : undefined);
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
    }

    if (isStrictModeSwitch) {
      setStrictModeSwitchTransaction({
        chapterIndex: targetRestoreTarget.chapterIndex,
        sourceMode: strictSourceMode,
        stage: 'capture_source',
        strict: true,
        targetMode: strictTargetMode,
        targetRestoreTarget,
      });
      const captureFailure = await flushPersistenceForStrictMode();
      if (captureFailure) {
        finalizeStrictModeSwitchFailure({
          chapterIndex: targetRestoreTarget.chapterIndex,
          message: captureFailure.message,
          sourceMode: strictSourceMode,
          stage: 'capture_source',
          targetMode: strictTargetMode,
        });
        return;
      }
    }

    markUserInteracted();
    setChapterIndex(targetRestoreTarget.chapterIndex);
    rememberModeState(targetRestoreTarget);
    setPendingRestoreTarget(targetRestoreTarget, { force: true });
    setMode(targetMode);

    if (isStrictModeSwitch) {
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
        finalizeStrictModeSwitchFailure({
          chapterIndex: targetRestoreTarget.chapterIndex,
          message: targetPersistenceFailure.message,
          sourceMode: strictSourceMode,
          stage: 'persist_target_state',
          targetMode: strictTargetMode,
        });
        return;
      }
      setStrictModeSwitchTransaction({
        chapterIndex: targetRestoreTarget.chapterIndex,
        sourceMode: strictSourceMode,
        stage: 'restore_target',
        strict: true,
        targetMode: strictTargetMode,
        targetRestoreTarget,
      });
    } else {
      persistReaderState(nextPersistedState);
    }

    const modeSwitchSnapshot = {
      source: 'useReaderRestoreController.switchMode',
      previousMode: mode,
      targetMode,
      chapterIndex: targetRestoreTarget.chapterIndex,
      locatorBoundary: targetRestoreTarget.locatorBoundary ?? null,
      hasLocator: Boolean(targetRestoreTarget.locator),
      chapterProgress: targetRestoreTarget.chapterProgress ?? null,
      persistedHintViewMode: nextPersistedState.hints?.viewMode ?? null,
      persistedHintContentMode: nextPersistedState.hints?.contentMode ?? null,
      strictModeSwitchEnabled: isStrictModeSwitch,
    };
    setDebugSnapshot('reader-mode-switch', modeSwitchSnapshot);
    debugLog('Reader', 'reader mode switched', modeSwitchSnapshot);
  }, [
    captureCurrentReaderPosition,
    clearPendingRestoreTarget,
    clearModeSwitchError,
    finalizeStrictModeSwitchFailure,
    flushPersistenceForStrictMode,
    markUserInteracted,
    mode,
    persistReaderState,
    rememberModeSwitchSource,
    rememberModeState,
    setChapterIndex,
    setMode,
    setPendingRestoreTarget,
    setStrictModeSwitchTransaction,
    stopRestoreMask,
    strictModeSwitchEnabled,
    chapterIndex,
  ]);

  const handleRestoreSettled = useCallback(
    (result: RestoreSettledResult): boolean => {
      if (handleStrictModeRestoreSettled(result)) {
        return false;
      }

      return handleModeSwitchRestoreSettled(result, mode);
    },
    [
      handleStrictModeRestoreSettled,
      handleModeSwitchRestoreSettled,
      mode,
    ],
  );

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

  useEffect(() => {
    return () => {
      captureCurrentReaderPositionRef.current();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (summaryProgressTimerRef.current) {
        clearTimeout(summaryProgressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (summaryProgressTimerRef.current) {
      clearTimeout(summaryProgressTimerRef.current);
      summaryProgressTimerRef.current = null;
    }
  }, [chapterIndex, mode]);

  const handleBeforeChapterChange = useCallback(() => {
    clearPendingRestoreTarget();
    stopRestoreMask();
    suppressScrollSyncTemporarily();
  }, [clearPendingRestoreTarget, stopRestoreMask, suppressScrollSyncTemporarily]);

  const handleContentScroll = useCallback(() => {
    if (persistence.isScrollSyncSuppressed()) {
      return;
    }

    if (mode !== 'summary' || pendingRestoreTargetRef.current) {
      return;
    }

    if (summaryProgressTimerRef.current) {
      clearTimeout(summaryProgressTimerRef.current);
    }

    summaryProgressTimerRef.current = setTimeout(() => {
      persistReaderState({
        hints: {
          chapterProgress: getContainerProgress(viewport.contentRef.current),
        },
      });
    }, 150);
  }, [mode, persistReaderState, persistence, viewport.contentRef]);

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
