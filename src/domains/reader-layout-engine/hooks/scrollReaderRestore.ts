import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type {
  ChapterContent,
  ReaderLocator,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  StoredReaderState,
} from '@shared/contracts/reader';
import type { ScrollReaderLayout } from './scrollReaderControllerTypes';

import { useCallback, useEffect } from 'react';

import { getChapterBoundaryLocator } from '../layout-core/internal';
import { debugLog, setDebugSnapshot } from '@shared/debug';
import {
  canSkipReaderRestore,
  SCROLL_READING_ANCHOR_RATIO,
} from '@shared/utils/readerPosition';
import {
  restoreStepFailure,
  restoreStepPending,
  restoreStepSuccess,
  runRestoreSolver,
} from '@shared/utils/readerRestoreSolver';
import { toCanonicalPositionFromLocator } from '@shared/utils/readerStoredState';
import { buildFocusedScrollWindow } from '../scroll-runtime/internal';

function setStableRestoreWindow(
  setScrollModeChapters: Dispatch<SetStateAction<number[]>>,
  nextWindow: number[],
): void {
  setScrollModeChapters((previousWindow) => (
    previousWindow.length === nextWindow.length
    && previousWindow.every((index, position) => index === nextWindow[position])
      ? previousWindow
      : nextWindow
  ));
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
    mode: 'scroll',
    chapterIndex,
  };
}

export function useScrollReaderRestore(params: {
  chapterIndex: number;
  chaptersLength: number;
  clearPendingRestoreTarget: () => void;
  currentChapter: ChapterContent | null;
  enabled: boolean;
  layoutQueries: {
    resolveScrollLocatorOffset: (locator: ReaderLocator) => number | null;
  };
  navigation: {
    setChapterChangeSource: (source: 'navigation' | 'restore' | 'scroll' | null) => void;
  };
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: MutableRefObject<ReaderRestoreTarget | null>;
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  persistReaderState: (state: StoredReaderState) => void;
  persistence: {
    notifyRestoreSettled: (status: 'completed' | 'failed' | 'skipped') => void;
    suppressScrollSyncTemporarily: () => void;
  };
  scrollChapterBodyElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollChapterElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollLayouts: ReadonlyMap<number, ScrollReaderLayout>;
  setScrollModeChapters: Dispatch<SetStateAction<number[]>>;
  stopRestoreMask: () => void;
  viewportContentRef: RefObject<HTMLDivElement | null>;
}): void {
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
    persistReaderState,
    persistence,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    scrollLayouts,
    setScrollModeChapters,
    stopRestoreMask,
    viewportContentRef,
  } = params;

  const ensureScrollRestoreWindow = useCallback((target: ReaderRestoreTarget) => {
    const targetChapterIndex = target.locator?.chapterIndex ?? target.chapterIndex;
    if (targetChapterIndex < 0 || targetChapterIndex >= chaptersLength) {
      return;
    }

    setStableRestoreWindow(
      setScrollModeChapters,
      buildFocusedScrollWindow(targetChapterIndex, chaptersLength),
    );
  }, [chaptersLength, setScrollModeChapters]);

  const resolvePendingRestoreLocator = useCallback((target: ReaderRestoreTarget) => {
    if (target.locator) {
      return target.locator;
    }

    if (target.locatorBoundary === undefined) {
      return null;
    }

    const chapterLayout = scrollLayouts.get(target.chapterIndex) ?? null;
    return getChapterBoundaryLocator(chapterLayout, target.locatorBoundary);
  }, [scrollLayouts]);

  const resolvePendingScrollTarget = useCallback((
    target: ReaderRestoreTarget,
    container: HTMLDivElement,
  ) => {
    const targetChapterIndex = target.locator?.chapterIndex ?? target.chapterIndex;
    const targetElement = scrollChapterElementsRef.current.get(targetChapterIndex) ?? null;
    const resolvedLocator = resolvePendingRestoreLocator(target);

    if (target.locatorBoundary !== undefined && resolvedLocator === null) {
      const hasResolvedBoundaryLayout = scrollLayouts.has(target.chapterIndex)
        && scrollChapterBodyElementsRef.current.has(target.chapterIndex);
      if (!hasResolvedBoundaryLayout) {
        return restoreStepPending<{
          locator: ReaderLocator;
          scrollTop: number;
        }>('layout_missing');
      }
    }

    if (resolvedLocator) {
      if (target.locatorBoundary === 'start' && targetElement) {
        return restoreStepSuccess({
          locator: resolvedLocator,
          scrollTop: Math.max(0, Math.round(targetElement.offsetTop)),
        });
      }

      const nextScrollTop = layoutQueries.resolveScrollLocatorOffset(resolvedLocator);
      if (nextScrollTop !== null) {
        return restoreStepSuccess({
          locator: resolvedLocator,
          scrollTop: Math.max(
            0,
            Math.round(nextScrollTop - container.clientHeight * SCROLL_READING_ANCHOR_RATIO),
          ),
        });
      }

      const hasResolvedChapterLayout = scrollLayouts.has(resolvedLocator.chapterIndex)
        && scrollChapterBodyElementsRef.current.has(resolvedLocator.chapterIndex);
      if (!hasResolvedChapterLayout) {
        return restoreStepPending<{
          locator: ReaderLocator;
          scrollTop: number;
        }>('layout_missing');
      }
    }

    return restoreStepFailure<{
      locator: ReaderLocator;
      scrollTop: number;
    }>('target_unresolvable', {
      retryable: false,
    });
  }, [
    layoutQueries,
    resolvePendingRestoreLocator,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    scrollLayouts,
  ]);

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
          const projected = resolvePendingScrollTarget(target, container);
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
          locator: executed.locator,
        }),
      });

      if (solverOutcome.kind === 'pending') {
        if (activeTarget) {
          ensureScrollRestoreWindow(activeTarget);
        }
        frameId = requestAnimationFrame(restoreScrollPosition);
        return;
      }

      navigation.setChapterChangeSource(null);
      if (solverOutcome.result.status === 'failed') {
        const failureRecord = recordRestoreResult(solverOutcome.result, activeTarget);
        if (failureRecord.scheduledRetry) {
          if (activeTarget) {
            ensureScrollRestoreWindow(activeTarget);
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

      recordRestoreResult(solverOutcome.result, activeTarget);
      const completedSnapshot = {
        source: 'scrollReaderRestore',
        mode: 'scroll',
        status: solverOutcome.result.status,
        chapterIndex,
        resolvedLocator: solverOutcome.context?.locator ?? null,
        target: activeTarget ?? null,
      };
      setDebugSnapshot('reader-position-restore', completedSnapshot);
      if (solverOutcome.context?.locator) {
        persistReaderState({
          canonical: toCanonicalPositionFromLocator(solverOutcome.context.locator),
          hints: {
            pageIndex: undefined,
            contentMode: 'scroll',
          },
        });
      }
      clearPendingRestoreTarget();
      stopRestoreMask();
      persistence.notifyRestoreSettled(solverOutcome.result.status);
    };

    frameId = requestAnimationFrame(restoreScrollPosition);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    chapterIndex,
    clearPendingRestoreTarget,
    currentChapter,
    enabled,
    ensureScrollRestoreWindow,
    navigation,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    getRestoreAttempt,
    recordRestoreResult,
    persistReaderState,
    persistence,
    resolvePendingScrollTarget,
    stopRestoreMask,
    viewportContentRef,
  ]);
}
