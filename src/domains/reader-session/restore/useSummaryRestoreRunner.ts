import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

import type { ReaderRestoreResult, ReaderRestoreTarget } from '@shared/contracts/reader';

import {
  canSkipReaderRestore,
  clampProgress,
  getContainerProgress,
} from '@shared/utils/readerPosition';
import {
  restoreStepFailure,
  restoreStepSuccess,
  runRestoreSolver,
} from '@shared/utils/readerRestoreSolver';

interface UseSummaryRestoreRunnerParams {
  chapterIndex: number;
  clearPendingRestoreTarget: () => void;
  currentChapterIndex: number | null | undefined;
  enabled: boolean;
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  mode: 'scroll' | 'paged' | 'summary';
  notifyRestoreSettled: (status: 'completed' | 'failed' | 'skipped') => void;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: MutableRefObject<ReaderRestoreTarget | null>;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  setChapterChangeSource: (source: 'navigation' | 'restore' | 'scroll' | null) => void;
  stopRestoreMask: () => void;
  summaryRestoreSignal: unknown;
  suppressScrollSyncTemporarily: () => void;
  viewportContentRef: MutableRefObject<HTMLDivElement | null>;
}

function buildSkippedNoTargetResult(
  chapterIndex: number,
  attempts: number,
): ReaderRestoreResult {
  return {
    status: 'skipped',
    reason: 'no_target',
    retryable: false,
    attempts,
    mode: 'summary',
    chapterIndex,
  };
}

export function useSummaryRestoreRunner(params: UseSummaryRestoreRunnerParams): void {
  const {
    chapterIndex,
    clearPendingRestoreTarget,
    currentChapterIndex,
    enabled,
    getRestoreAttempt,
    mode,
    notifyRestoreSettled,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    recordRestoreResult,
    setChapterChangeSource,
    stopRestoreMask,
    summaryRestoreSignal,
    suppressScrollSyncTemporarily,
    viewportContentRef,
  } = params;

  useEffect(() => {
    if (!enabled || mode !== 'summary') {
      return;
    }

    const pendingTarget = pendingRestoreTarget ?? pendingRestoreTargetRef.current;
    const container = viewportContentRef.current;
    if (
      !pendingTarget
      || pendingTarget.mode !== 'summary'
      || !container
      || currentChapterIndex !== chapterIndex
    ) {
      return;
    }

    const currentRetryAttempt = getRestoreAttempt(pendingTarget);
    if (canSkipReaderRestore(pendingTarget)) {
      recordRestoreResult(
        buildSkippedNoTargetResult(chapterIndex, currentRetryAttempt + 1),
        pendingTarget,
      );
      clearPendingRestoreTarget();
      stopRestoreMask();
      notifyRestoreSettled('skipped');
      return;
    }

    let frameId = 0;
    let cancelled = false;

    const restoreSummaryPosition = () => {
      if (cancelled) {
        return;
      }

      const activeContainer = viewportContentRef.current;
      const activeTarget = pendingRestoreTargetRef.current;
      if (!activeContainer || !activeTarget || activeTarget.mode !== 'summary') {
        frameId = requestAnimationFrame(restoreSummaryPosition);
        return;
      }

      const solverOutcome = runRestoreSolver({
        attempts: getRestoreAttempt(activeTarget) + 1,
        chapterIndex,
        hasTarget: true,
        mode: 'summary',
        modeMatchesTarget: activeTarget.mode === 'summary',
        parse: () => restoreStepSuccess({
          target: activeTarget,
          container: activeContainer,
        }),
        project: ({ target, container: restoreContainer }) => {
          if (typeof target.chapterProgress !== 'number') {
            return restoreStepFailure('target_unresolvable', {
              retryable: false,
            });
          }

          const maxScroll = Math.max(
            0,
            restoreContainer.scrollHeight - restoreContainer.clientHeight,
          );
          const expectedProgress = clampProgress(target.chapterProgress);
          const expectedScrollTop = maxScroll > 0
            ? Math.round(maxScroll * expectedProgress)
            : 0;
          return restoreStepSuccess({
            expectedProgress,
            expectedScrollTop,
            container: restoreContainer,
          });
        },
        execute: ({ expectedScrollTop, container: restoreContainer }) => {
          setChapterChangeSource('restore');
          suppressScrollSyncTemporarily();
          const nextContainer = restoreContainer;
          nextContainer.scrollTop = expectedScrollTop;
          return restoreStepSuccess({
            container: nextContainer,
            expectedScrollTop,
            actualScrollTop: nextContainer.scrollTop,
          });
        },
        validate: (projected, executed) => {
          const actualProgress = getContainerProgress(executed.container);
          const delta = Math.abs(actualProgress - projected.expectedProgress);
          const measuredError = {
            metric: 'progress_delta' as const,
            delta,
            tolerance: 0.01,
            expected: projected.expectedProgress,
            actual: actualProgress,
          };

          if (delta > measuredError.tolerance) {
            return restoreStepFailure('validation_exceeded_tolerance', {
              retryable: true,
              measuredError,
            });
          }

          return restoreStepSuccess(measuredError);
        },
        buildContext: ({ executed }) => ({
          actualScrollTop: executed.actualScrollTop,
        }),
      });

      if (solverOutcome.kind === 'pending') {
        frameId = requestAnimationFrame(restoreSummaryPosition);
        return;
      }

      setChapterChangeSource(null);
      if (solverOutcome.result.status === 'failed') {
        const failureRecord = recordRestoreResult(solverOutcome.result, activeTarget);
        if (failureRecord.scheduledRetry) {
          frameId = requestAnimationFrame(restoreSummaryPosition);
          return;
        }

        clearPendingRestoreTarget();
        stopRestoreMask();
        notifyRestoreSettled('failed');
        return;
      }

      recordRestoreResult(solverOutcome.result, activeTarget);
      clearPendingRestoreTarget();
      stopRestoreMask();
      notifyRestoreSettled(solverOutcome.result.status);
    };

    frameId = requestAnimationFrame(restoreSummaryPosition);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    chapterIndex,
    clearPendingRestoreTarget,
    currentChapterIndex,
    enabled,
    getRestoreAttempt,
    mode,
    notifyRestoreSettled,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    recordRestoreResult,
    setChapterChangeSource,
    stopRestoreMask,
    summaryRestoreSignal,
    suppressScrollSyncTemporarily,
    viewportContentRef,
  ]);
}
