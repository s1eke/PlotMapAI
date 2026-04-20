import type {
  ReaderLocator,
  ReaderMode,
  ReaderRestoreMeasuredError,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  StoredReaderState,
} from '@shared/contracts/reader';
import {
  clampContainerScrollTop,
  resolvePagedRestoreTargetPageIndex,
  SCROLL_READING_ANCHOR_RATIO,
} from '@shared/utils/readerPosition';

import {
  mergeStoredReaderState,
  toCanonicalPositionFromLocator,
} from '@shared/utils/readerStoredState';

export interface ReaderModeSwitchDebugSnapshot {
  chapterIndex: number;
  chapterProgress: number | null;
  hasLocator: boolean;
  locatorBoundary: ReaderRestoreTarget['locatorBoundary'] | null;
  persistedHintContentMode: 'paged' | 'scroll' | null;
  persistedHintViewMode: 'original' | 'summary' | null;
  previousMode: ReaderMode;
  source: 'useReaderRestoreController.switchMode';
  strictModeSwitchEnabled: boolean;
  targetMode: ReaderMode;
}

export type StrictModeSwitchCaptureResult =
  | { ok: true; state: StoredReaderState }
  | { message: string; ok: false };

export type StrictModeSwitchRestoreVerificationResult =
  | { ok: true }
  | {
    message: string;
    measuredError?: ReaderRestoreMeasuredError;
    ok: false;
    reason: ReaderRestoreResult['reason'];
  };

function buildStrictModeLocatorUnavailableMessage(mode: 'paged' | 'scroll'): string {
  return `live_${mode}_locator_missing`;
}

function areLayoutCursorsEquivalent(
  left: ReaderLocator['startCursor'],
  right: ReaderLocator['startCursor'],
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.segmentIndex === right.segmentIndex
    && left.graphemeIndex === right.graphemeIndex;
}

function areStrictModeLocatorsEquivalent(
  left: ReaderLocator | null | undefined,
  right: ReaderLocator | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return left.chapterIndex === right.chapterIndex
    && left.blockIndex === right.blockIndex
    && left.kind === right.kind
    && left.lineIndex === right.lineIndex
    && left.edge === right.edge
    && areLayoutCursorsEquivalent(left.startCursor, right.startCursor)
    && areLayoutCursorsEquivalent(left.endCursor, right.endCursor);
}

export function captureStrictModeSwitchState(params: {
  chapterIndex: number;
  currentOriginalLocator: ReaderLocator | null;
  currentPagedLocator: ReaderLocator | null;
  latestReaderState: StoredReaderState;
  mode: 'paged' | 'scroll';
}): StrictModeSwitchCaptureResult {
  const activeLocator = params.mode === 'scroll'
    ? params.currentOriginalLocator
    : params.currentPagedLocator;
  if (!activeLocator) {
    return {
      ok: false,
      message: buildStrictModeLocatorUnavailableMessage(params.mode),
    };
  }

  return {
    ok: true,
    state: mergeStoredReaderState(params.latestReaderState, {
      canonical: toCanonicalPositionFromLocator(activeLocator),
      hints: {
        contentMode: params.mode,
        pageIndex: params.mode === 'scroll' ? undefined : activeLocator.pageIndex,
      },
    }),
  };
}

export function buildStrictModeRestoreFailureResult(params: {
  chapterIndex: number;
  measuredError?: ReaderRestoreMeasuredError;
  reason: ReaderRestoreResult['reason'];
  targetMode: 'paged' | 'scroll';
}): ReaderRestoreResult {
  return {
    attempts: 1,
    chapterIndex: params.chapterIndex,
    measuredError: params.measuredError,
    mode: params.targetMode,
    reason: params.reason,
    retryable: false,
    status: 'failed',
  };
}

export function verifyStrictModeRestoreCompletion(params: {
  chapterIndex: number;
  contentElement: HTMLDivElement | null;
  currentOriginalLocator: ReaderLocator | null;
  currentPageCount: number;
  currentPageIndex: number;
  resolvePagedLocatorPageIndex: (target: ReaderRestoreTarget['locator']) => number | null;
  resolveScrollLocatorOffset: (
    locator: NonNullable<ReaderRestoreTarget['locator']>,
  ) => number | null;
  targetMode: 'paged' | 'scroll';
  targetRestoreTarget: ReaderRestoreTarget;
}) {
  const { targetRestoreTarget } = params;
  if (!targetRestoreTarget.locator) {
    return {
      message: 'strict_target_locator_missing',
      restoreResult: buildStrictModeRestoreFailureResult({
        chapterIndex: params.chapterIndex,
        reason: 'target_unresolvable',
        targetMode: params.targetMode,
      }),
    };
  }

  if (params.targetMode === 'paged') {
    const expectedPageIndex = resolvePagedRestoreTargetPageIndex({
      chapterProgress: targetRestoreTarget.chapterProgress,
      locatorPageIndex: targetRestoreTarget.locator.pageIndex,
      resolvedLocatorPageIndex: params.resolvePagedLocatorPageIndex(targetRestoreTarget.locator),
      totalPages: params.currentPageCount,
    });
    if (expectedPageIndex === null) {
      return {
        message: 'strict_target_page_unresolvable',
        restoreResult: buildStrictModeRestoreFailureResult({
          chapterIndex: params.chapterIndex,
          reason: 'target_unresolvable',
          targetMode: params.targetMode,
        }),
      };
    }

    if (params.currentPageIndex === expectedPageIndex) {
      return null;
    }

    return {
      message: `resolved_page_mismatch expected=${expectedPageIndex} actual=${params.currentPageIndex}`,
      restoreResult: buildStrictModeRestoreFailureResult({
        chapterIndex: params.chapterIndex,
        measuredError: {
          actual: params.currentPageIndex,
          delta: Math.abs(params.currentPageIndex - expectedPageIndex),
          expected: expectedPageIndex,
          metric: 'page_delta',
          tolerance: 0,
        },
        reason: 'validation_exceeded_tolerance',
        targetMode: params.targetMode,
      }),
    };
  }

  if (!params.contentElement) {
    return {
      message: 'strict_scroll_container_missing',
      restoreResult: buildStrictModeRestoreFailureResult({
        chapterIndex: params.chapterIndex,
        reason: 'container_missing',
        targetMode: params.targetMode,
      }),
    };
  }

  const resolvedOffset = params.resolveScrollLocatorOffset(targetRestoreTarget.locator);
  if (resolvedOffset === null) {
    return {
      message: 'strict_scroll_target_unresolvable',
      restoreResult: buildStrictModeRestoreFailureResult({
        chapterIndex: params.chapterIndex,
        reason: 'target_unresolvable',
        targetMode: params.targetMode,
      }),
    };
  }

  if (areStrictModeLocatorsEquivalent(params.currentOriginalLocator, targetRestoreTarget.locator)) {
    return null;
  }

  if (params.currentOriginalLocator) {
    const actualResolvedOffset = params.resolveScrollLocatorOffset(params.currentOriginalLocator);
    if (actualResolvedOffset !== null) {
      const delta = Math.abs(actualResolvedOffset - resolvedOffset);
      if (delta <= 2) {
        return null;
      }

      return {
        message: `resolved_locator_offset_mismatch expected=${resolvedOffset} actual=${actualResolvedOffset}`,
        restoreResult: buildStrictModeRestoreFailureResult({
          chapterIndex: params.chapterIndex,
          measuredError: {
            actual: actualResolvedOffset,
            delta,
            expected: resolvedOffset,
            metric: 'scroll_px',
            tolerance: 2,
          },
          reason: 'validation_exceeded_tolerance',
          targetMode: params.targetMode,
        }),
      };
    }
  }

  const expectedScrollTop = clampContainerScrollTop(
    params.contentElement,
    resolvedOffset - params.contentElement.clientHeight * SCROLL_READING_ANCHOR_RATIO,
  );
  const actualScrollTop = params.contentElement.scrollTop;
  const delta = Math.abs(actualScrollTop - expectedScrollTop);
  if (delta <= 2) {
    return null;
  }

  return {
    message: `resolved_scroll_mismatch expected=${expectedScrollTop} actual=${actualScrollTop}`,
    restoreResult: buildStrictModeRestoreFailureResult({
      chapterIndex: params.chapterIndex,
      measuredError: {
        actual: actualScrollTop,
        delta,
        expected: expectedScrollTop,
        metric: 'scroll_px',
        tolerance: 2,
      },
      reason: 'validation_exceeded_tolerance',
      targetMode: params.targetMode,
    }),
  };
}

export function buildReaderModeSwitchDebugSnapshot(params: {
  nextPersistedState: StoredReaderState;
  previousMode: ReaderMode;
  strictModeSwitchEnabled: boolean;
  targetMode: ReaderMode;
  targetRestoreTarget: ReaderRestoreTarget;
}): ReaderModeSwitchDebugSnapshot {
  return {
    source: 'useReaderRestoreController.switchMode',
    previousMode: params.previousMode,
    targetMode: params.targetMode,
    chapterIndex: params.targetRestoreTarget.chapterIndex,
    locatorBoundary: params.targetRestoreTarget.locatorBoundary ?? null,
    hasLocator: Boolean(params.targetRestoreTarget.locator),
    chapterProgress: params.targetRestoreTarget.chapterProgress ?? null,
    persistedHintViewMode: params.nextPersistedState.hints?.viewMode ?? null,
    persistedHintContentMode: params.nextPersistedState.hints?.contentMode ?? null,
    strictModeSwitchEnabled: params.strictModeSwitchEnabled,
  };
}
