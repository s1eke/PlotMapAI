import type {
  ReaderLocator,
  ReaderRestoreResult,
  ReaderRestoreTarget,
} from '@shared/contracts/reader';
import type { UseScrollReaderRestoreParams } from './scrollReaderRestoreTypes';

import { useEffect } from 'react';

import { debugLog, setDebugSnapshot } from '@shared/debug';
import {
  canSkipReaderRestore,
  clampContainerScrollTop,
  getContainerMaxScrollTop,
} from '@shared/utils/readerPosition';
import {
  restoreStepFailure,
  restoreStepPending,
  restoreStepSuccess,
  runRestoreSolver,
} from '@shared/utils/readerRestoreSolver';
import { toCanonicalPositionFromLocator } from '@shared/utils/readerStoredState';
import {
  areRestoreLocatorsEquivalent,
  areRestoreLocatorsInSameBlock,
  buildSkippedNoTargetResult,
  ensureScrollRestoreWindow,
  resolvePendingScrollTarget,
} from './scrollReaderRestoreHelpers';

const SCROLL_RESTORE_LOCATOR_SETTLE_FRAMES = 6;
const SCROLL_RESTORE_LOCATOR_SETTLE_OFFSET_TOLERANCE_PX = 2;
const SCROLL_RESTORE_SAME_BLOCK_SETTLE_OFFSET_TOLERANCE_PX = 64;
const SCROLL_RESTORE_SCROLL_TOP_SETTLE_TOLERANCE_PX = 2;

export function useScrollReaderRestore(params: UseScrollReaderRestoreParams): void {
  const {
    chapterIndex,
    chaptersLength,
    clearPendingRestoreTarget,
    currentChapter,
    enabled,
    layoutQueries,
    navigation,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    getRestoreAttempt,
    recordRestoreResult,
    retainFocusedWindowAfterRestore,
    persistReaderState,
    persistence,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    scrollLayouts,
    setScrollModeChapters,
    stopRestoreMask,
    viewportContentRef,
  } = params;

  useEffect(() => {
    if (!enabled || currentChapter?.index !== chapterIndex) {
      return;
    }

    const pendingTarget = pendingRestoreTarget ?? pendingRestoreTargetRef.current;
    if (!pendingTarget || pendingTarget.mode !== 'scroll') {
      return;
    }

    const currentRetryAttempt = getRestoreAttempt(pendingTarget);
    if (canSkipReaderRestore(pendingTarget)) {
      const skippedSnapshot = {
        source: 'scrollReaderRestore',
        mode: 'scroll',
        status: 'skipped',
        chapterIndex,
        reason: 'no_target',
        target: pendingTarget,
      };
      setDebugSnapshot('reader-position-restore', skippedSnapshot);
      debugLog('Reader', 'scroll restore skipped because target is missing', skippedSnapshot);
      recordRestoreResult(
        buildSkippedNoTargetResult(chapterIndex, currentRetryAttempt + 1),
        pendingTarget,
      );
      navigation.setChapterChangeSource(null);
      clearPendingRestoreTarget();
      stopRestoreMask();
      persistence.notifyRestoreSettled('skipped');
      return;
    }

    let frameId = 0;
    let cancelled = false;
    let restoreSettledFrameCount = 0;

    const finalizeSuccessfulRestore = (
      activeTarget: ReaderRestoreTarget | null,
      completedResult: ReaderRestoreResult,
      resolvedLocator: ReaderLocator | null | undefined,
    ) => {
      recordRestoreResult(completedResult, activeTarget);
      const completedSnapshot = {
        source: 'scrollReaderRestore',
        mode: 'scroll',
        status: completedResult.status,
        chapterIndex,
        resolvedLocator: resolvedLocator ?? null,
        target: activeTarget ?? null,
      };
      setDebugSnapshot('reader-position-restore', completedSnapshot);
      if (resolvedLocator) {
        persistReaderState({
          canonical: toCanonicalPositionFromLocator(resolvedLocator),
          hints: {
            pageIndex: undefined,
            contentMode: 'scroll',
          },
        });
      }
      retainFocusedWindowAfterRestore(chapterIndex);
      clearPendingRestoreTarget();
      stopRestoreMask();
      persistence.notifyRestoreSettled(completedResult.status);
    };

    const failSettledScrollRestore = (
      activeTarget: ReaderRestoreTarget | null,
      currentLocator: ReaderLocator | null,
      expectedOffset: number | null,
      actualOffset: number | null,
      tolerance: number,
    ) => {
      const measuredError = (
        typeof expectedOffset === 'number'
        && typeof actualOffset === 'number'
      )
        ? {
          metric: 'scroll_px' as const,
          delta: Math.abs(actualOffset - expectedOffset),
          tolerance,
          expected: expectedOffset,
          actual: actualOffset,
        }
        : undefined;
      const failedResult: ReaderRestoreResult = {
        attempts: getRestoreAttempt(activeTarget) + 1,
        chapterIndex,
        measuredError,
        mode: 'scroll',
        reason: 'validation_exceeded_tolerance',
        retryable: true,
        status: 'failed',
      };
      const failureRecord = recordRestoreResult(failedResult, activeTarget);
      if (failureRecord.scheduledRetry) {
        if (activeTarget) {
          ensureScrollRestoreWindow({
            chaptersLength,
            setScrollModeChapters,
            target: activeTarget,
          });
        }
        restoreSettledFrameCount = 0;
        frameId = requestAnimationFrame(restoreScrollPosition);
        return;
      }

      const failedSnapshot = {
        source: 'scrollReaderRestore',
        mode: 'scroll',
        status: 'failed',
        chapterIndex,
        reason: failedResult.reason,
        retryable: failedResult.retryable,
        attempts: failedResult.attempts,
        currentLocator,
        expectedOffset,
        actualOffset,
        tolerance,
        target: activeTarget ?? null,
      };
      setDebugSnapshot('reader-position-restore', failedSnapshot);
      debugLog('Reader', 'scroll restore failed', failedSnapshot);
      clearPendingRestoreTarget();
      stopRestoreMask();
      persistence.notifyRestoreSettled('failed');
    };

    const verifySettledScrollRestore = (
      activeTarget: ReaderRestoreTarget | null,
      expectedLocator: ReaderLocator | null | undefined,
      completedResult: ReaderRestoreResult,
      expectedScrollTop: number,
    ) => {
      if (cancelled) {
        return;
      }

      const currentLocator = layoutQueries.getCurrentOriginalLocator();
      const container = viewportContentRef.current;
      const shouldPreferProgressStability = Boolean(
        activeTarget
        && typeof activeTarget.chapterProgress === 'number',
      );
      const progressExpectedScrollTop = (
        container
        && activeTarget
        && typeof activeTarget.chapterProgress === 'number'
      )
        ? clampContainerScrollTop(
          container,
          getContainerMaxScrollTop(container) * activeTarget.chapterProgress,
        )
        : expectedScrollTop;
      if (
        !shouldPreferProgressStability
        && expectedLocator
        && areRestoreLocatorsEquivalent(currentLocator, expectedLocator)
      ) {
        finalizeSuccessfulRestore(activeTarget, completedResult, expectedLocator);
        return;
      }
      const scrollTopIsStable = container !== null
        && Math.abs(container.scrollTop - progressExpectedScrollTop)
          <= SCROLL_RESTORE_SCROLL_TOP_SETTLE_TOLERANCE_PX;
      if (scrollTopIsStable) {
        finalizeSuccessfulRestore(activeTarget, completedResult, expectedLocator ?? currentLocator);
        return;
      }

      if (
        container
        && activeTarget
        && typeof activeTarget.chapterProgress === 'number'
        && typeof activeTarget.locator?.pageIndex === 'number'
      ) {
        navigation.setChapterChangeSource('restore');
        persistence.suppressScrollSyncTemporarily();
        container.scrollTop = progressExpectedScrollTop;
      }

      const expectedOffset = expectedLocator
        ? layoutQueries.resolveScrollLocatorOffset(expectedLocator)
        : null;
      const actualOffset = currentLocator
        ? layoutQueries.resolveScrollLocatorOffset(currentLocator)
        : null;
      const offsetTolerance = areRestoreLocatorsInSameBlock(currentLocator, expectedLocator)
        ? SCROLL_RESTORE_SAME_BLOCK_SETTLE_OFFSET_TOLERANCE_PX
        : SCROLL_RESTORE_LOCATOR_SETTLE_OFFSET_TOLERANCE_PX;
      const offsetsAreStable = (
        typeof expectedOffset === 'number'
        && typeof actualOffset === 'number'
        && Math.abs(actualOffset - expectedOffset) <= offsetTolerance
      );
      if (offsetsAreStable) {
        finalizeSuccessfulRestore(activeTarget, completedResult, expectedLocator ?? currentLocator);
        return;
      }

      restoreSettledFrameCount += 1;
      if (restoreSettledFrameCount < SCROLL_RESTORE_LOCATOR_SETTLE_FRAMES) {
        frameId = requestAnimationFrame(() => {
          verifySettledScrollRestore(
            activeTarget,
            expectedLocator,
            completedResult,
            expectedScrollTop,
          );
        });
        return;
      }

      failSettledScrollRestore(
        activeTarget,
        currentLocator,
        expectedOffset,
        actualOffset,
        offsetTolerance,
      );
    };

    const restoreScrollPosition = () => {
      if (cancelled) {
        return;
      }

      const activeTarget = pendingRestoreTargetRef.current;
      const solverOutcome = runRestoreSolver({
        attempts: getRestoreAttempt(activeTarget) + 1,
        chapterIndex,
        hasTarget: Boolean(activeTarget),
        mode: 'scroll',
        modeMatchesTarget: activeTarget?.mode === 'scroll',
        parse: () => {
          if (!activeTarget) {
            return restoreStepFailure('target_unresolvable', { retryable: false });
          }

          const container = viewportContentRef.current;
          if (!container) {
            return restoreStepPending('container_missing');
          }

          return restoreStepSuccess({
            target: activeTarget,
            container,
          });
        },
        project: ({ target, container }) => {
          const projected = resolvePendingScrollTarget({
            container,
            layoutQueries,
            scrollChapterBodyElementsRef,
            scrollChapterElementsRef,
            scrollLayouts,
            target,
          });
          if (projected.state !== 'success') {
            return projected;
          }

          return restoreStepSuccess({
            ...projected.value,
            container,
          });
        },
        execute: ({ locator, scrollTop, container }) => {
          navigation.setChapterChangeSource('restore');
          persistence.suppressScrollSyncTemporarily();
          const nextContainer = container;
          nextContainer.scrollTop = scrollTop;
          return restoreStepSuccess({
            locator,
            expectedScrollTop: scrollTop,
            actualScrollTop: nextContainer.scrollTop,
          });
        },
        validate: (_projected, executed) => {
          const measuredError = {
            metric: 'scroll_px' as const,
            delta: Math.abs(executed.actualScrollTop - executed.expectedScrollTop),
            tolerance: 2,
            expected: executed.expectedScrollTop,
            actual: executed.actualScrollTop,
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
          expectedScrollTop: executed.expectedScrollTop,
          locator: executed.locator,
        }),
      });

      if (solverOutcome.kind === 'pending') {
        if (activeTarget) {
          ensureScrollRestoreWindow({
            chaptersLength,
            setScrollModeChapters,
            target: activeTarget,
          });
        }
        frameId = requestAnimationFrame(restoreScrollPosition);
        return;
      }

      navigation.setChapterChangeSource(null);
      if (solverOutcome.result.status === 'failed') {
        const failureRecord = recordRestoreResult(solverOutcome.result, activeTarget);
        if (failureRecord.scheduledRetry) {
          if (activeTarget) {
            ensureScrollRestoreWindow({
              chaptersLength,
              setScrollModeChapters,
              target: activeTarget,
            });
          }
          frameId = requestAnimationFrame(restoreScrollPosition);
          return;
        }

        const failedSnapshot = {
          source: 'scrollReaderRestore',
          mode: 'scroll',
          status: 'failed',
          chapterIndex,
          reason: solverOutcome.result.reason,
          retryable: solverOutcome.result.retryable,
          attempts: solverOutcome.result.attempts,
          target: activeTarget ?? null,
        };
        setDebugSnapshot('reader-position-restore', failedSnapshot);
        debugLog('Reader', 'scroll restore failed', failedSnapshot);
        clearPendingRestoreTarget();
        stopRestoreMask();
        persistence.notifyRestoreSettled('failed');
        return;
      }

      restoreSettledFrameCount = 0;
      frameId = requestAnimationFrame(() => {
        verifySettledScrollRestore(
          activeTarget,
          solverOutcome.context?.locator,
          solverOutcome.result,
          solverOutcome.context?.expectedScrollTop ?? 0,
        );
      });
    };

    frameId = requestAnimationFrame(restoreScrollPosition);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    chapterIndex,
    chaptersLength,
    clearPendingRestoreTarget,
    currentChapter,
    enabled,
    layoutQueries,
    navigation,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    getRestoreAttempt,
    recordRestoreResult,
    retainFocusedWindowAfterRestore,
    persistReaderState,
    persistence,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    scrollLayouts,
    setScrollModeChapters,
    stopRestoreMask,
    viewportContentRef,
  ]);
}
