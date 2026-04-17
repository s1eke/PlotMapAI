import { debugLog, setDebugSnapshot } from '@shared/debug';
import { isReaderTraceEnabled, recordReaderTrace } from '@shared/reader-trace';
import {
  canSkipReaderRestore,
  resolvePagedRestoreTargetPageIndex,
  resolvePagedTargetPage,
} from '@shared/utils/readerPosition';
import {
  restoreStepFailure,
  restoreStepPending,
  restoreStepSuccess,
  runRestoreSolver,
} from '@shared/utils/readerRestoreSolver';
import type {
  PageTarget,
  ReaderRestoreResult,
  ReaderRestoreTarget,
} from '@shared/contracts/reader';
import type { PaginatedChapterLayout } from '../layout-core/internal';
import {
  findPageIndexForLocator,
  getChapterBoundaryLocator,
} from '../layout-core/internal';

function buildSkippedNoTargetResult(
  chapterIndex: number,
  attempts: number,
): ReaderRestoreResult {
  return {
    status: 'skipped',
    reason: 'no_target',
    retryable: false,
    attempts,
    mode: 'paged',
    chapterIndex,
  };
}

interface AttemptPagedRestoreParams {
  chapterIndex: number;
  currentPageIndex: number;
  nextPageCount: number;
  currentPagedLayout?: PaginatedChapterLayout | null;
  pendingPageTarget: PageTarget | null;
  pendingRestoreTarget: ReaderRestoreTarget;
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  clearPendingRestoreTarget: () => void;
  notifyRestoreSettled: (status: 'completed' | 'failed' | 'skipped') => void;
  stopRestoreMask: () => void;
  setPageIndex: (nextPageIndex: number) => void;
}

export function attemptPagedRestore({
  chapterIndex,
  currentPageIndex,
  nextPageCount,
  currentPagedLayout,
  pendingPageTarget,
  pendingRestoreTarget,
  getRestoreAttempt,
  recordRestoreResult,
  clearPendingRestoreTarget,
  notifyRestoreSettled,
  stopRestoreMask,
  setPageIndex,
}: AttemptPagedRestoreParams): 'handled' | 'pending' {
  if (canSkipReaderRestore(pendingRestoreTarget)) {
    if (isReaderTraceEnabled()) {
      recordReaderTrace('paged_restore_completed', {
        chapterIndex,
        mode: 'paged',
        details: {
          attempts: getRestoreAttempt(pendingRestoreTarget) + 1,
          currentPageIndex,
          nextPageCount,
          reason: 'no_target',
          resolvedTargetPage: null,
          status: 'skipped',
        },
      });
    }
    const skippedSnapshot = {
      source: 'usePagedReaderLayout',
      mode: 'paged',
      status: 'skipped',
      chapterIndex,
      reason: 'no_target',
      target: pendingRestoreTarget,
    };
    setDebugSnapshot('reader-position-restore', skippedSnapshot);
    debugLog('Reader', 'paged restore skipped because target is missing', skippedSnapshot);
    recordRestoreResult(
      buildSkippedNoTargetResult(
        chapterIndex,
        getRestoreAttempt(pendingRestoreTarget) + 1,
      ),
      pendingRestoreTarget,
    );
    clearPendingRestoreTarget();
    stopRestoreMask();
    notifyRestoreSettled('skipped');
    return 'handled';
  }

  const solverOutcome = runRestoreSolver({
    attempts: getRestoreAttempt(pendingRestoreTarget) + 1,
    chapterIndex,
    hasTarget: true,
    mode: 'paged',
    modeMatchesTarget: pendingRestoreTarget.mode === 'paged',
    parse: () => {
      return restoreStepSuccess({
        target: pendingRestoreTarget,
        layout: currentPagedLayout,
        currentPageIndex,
        nextPageCount,
      });
    },
    project: ({
      target,
      layout,
      currentPageIndex: nextCurrentPageIndex,
      nextPageCount: totalPages,
    }) => {
      let resolvedTargetPage: number | null = null;
      if (target.locator) {
        const resolvedLocatorPageIndex = layout
          ? findPageIndexForLocator(layout, target.locator)
          : null;
        resolvedTargetPage = resolvePagedRestoreTargetPageIndex({
          chapterProgress: target.chapterProgress,
          locatorPageIndex: target.locator.pageIndex,
          resolvedLocatorPageIndex,
          totalPages,
        });
        if (resolvedTargetPage === null && !layout) {
          return restoreStepPending('layout_missing');
        }
      }
      if (resolvedTargetPage === null && target.locatorBoundary !== undefined) {
        if (!layout) {
          return restoreStepPending('layout_missing');
        }
        const boundaryLocator = getChapterBoundaryLocator(
          layout,
          target.locatorBoundary,
        );
        if (!boundaryLocator) {
          return restoreStepFailure('target_unresolvable', {
            retryable: false,
          });
        }
        resolvedTargetPage = findPageIndexForLocator(layout, boundaryLocator);
      }
      if (resolvedTargetPage === null && pendingPageTarget) {
        resolvedTargetPage = resolvePagedTargetPage(
          pendingPageTarget,
          nextCurrentPageIndex,
          totalPages,
        );
      }

      if (resolvedTargetPage === null) {
        return restoreStepFailure('target_unresolvable', {
          retryable: false,
        });
      }

      return restoreStepSuccess({
        targetPageIndex: resolvedTargetPage,
      });
    },
    execute: ({ targetPageIndex }) => {
      if (targetPageIndex !== currentPageIndex) {
        setPageIndex(targetPageIndex);
      }

      return restoreStepSuccess({
        expectedPageIndex: targetPageIndex,
        actualPageIndex: targetPageIndex,
      });
    },
    validate: (_projected, executed) => {
      const measuredError = {
        metric: 'page_delta' as const,
        delta: Math.abs(executed.actualPageIndex - executed.expectedPageIndex),
        tolerance: 0,
        expected: executed.expectedPageIndex,
        actual: executed.actualPageIndex,
      };

      if (measuredError.delta > measuredError.tolerance) {
        return restoreStepFailure('validation_exceeded_tolerance', {
          retryable: true,
          measuredError,
        });
      }

      return restoreStepSuccess(measuredError);
    },
    buildContext: ({ executed }) => ({
      pageIndex: executed.actualPageIndex,
      resolvedTargetPage: executed.expectedPageIndex,
    }),
  });

  if (solverOutcome.kind === 'pending') {
    setDebugSnapshot('reader-position-restore', {
      source: 'usePagedReaderLayout',
      mode: 'paged',
      status: 'pending',
      chapterIndex,
      reason: solverOutcome.reason,
      retryable: solverOutcome.retryable,
      target: pendingRestoreTarget,
    });
    return 'pending';
  }

  if (solverOutcome.result.status === 'failed') {
    if (isReaderTraceEnabled()) {
      recordReaderTrace('paged_restore_failed', {
        chapterIndex,
        mode: 'paged',
        details: {
          attempts: solverOutcome.result.attempts,
          currentPageIndex,
          nextPageCount,
          reason: solverOutcome.result.reason,
          resolvedTargetPage: null,
          retryable: solverOutcome.result.retryable,
        },
      });
    }
    const failureRecord = recordRestoreResult(solverOutcome.result, pendingRestoreTarget);
    if (failureRecord.scheduledRetry) {
      return 'pending';
    }

    const failedSnapshot = {
      source: 'usePagedReaderLayout',
      mode: 'paged',
      status: 'failed',
      chapterIndex,
      reason: solverOutcome.result.reason,
      retryable: solverOutcome.result.retryable,
      attempts: solverOutcome.result.attempts,
      target: pendingRestoreTarget,
    };
    setDebugSnapshot('reader-position-restore', failedSnapshot);
    debugLog('Reader', 'paged restore failed', failedSnapshot);
    clearPendingRestoreTarget();
    stopRestoreMask();
    notifyRestoreSettled('failed');
    return 'handled';
  }

  recordRestoreResult(solverOutcome.result, pendingRestoreTarget);
  if (isReaderTraceEnabled()) {
    recordReaderTrace('paged_restore_completed', {
      chapterIndex,
      mode: 'paged',
      details: {
        attempts: solverOutcome.result.attempts,
        currentPageIndex,
        nextPageCount,
        reason: solverOutcome.result.reason,
        resolvedTargetPage: solverOutcome.context?.resolvedTargetPage ?? null,
        status: solverOutcome.result.status,
      },
    });
  }
  setDebugSnapshot('reader-position-restore', {
    source: 'usePagedReaderLayout',
    mode: 'paged',
    status: solverOutcome.result.status,
    chapterIndex,
    resolvedPageIndex: solverOutcome.context?.pageIndex ?? null,
    target: pendingRestoreTarget,
  });
  clearPendingRestoreTarget();
  stopRestoreMask();
  notifyRestoreSettled(solverOutcome.result.status);
  return 'handled';
}
