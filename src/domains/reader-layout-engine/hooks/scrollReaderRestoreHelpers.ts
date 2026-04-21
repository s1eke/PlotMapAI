import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  ReaderLocator,
  ReaderRestoreResult,
  ReaderRestoreTarget,
} from '@shared/contracts/reader';
import type { ScrollReaderLayout } from './scrollReaderControllerTypes';

import { getChapterBoundaryLocator } from '../layout-core/internal';
import {
  clampContainerScrollTop,
  getContainerMaxScrollTop,
  SCROLL_READING_ANCHOR_RATIO,
} from '@shared/utils/readerPosition';
import {
  restoreStepFailure,
  restoreStepPending,
  restoreStepSuccess,
} from '@shared/utils/readerRestoreSolver';
import { buildFocusedScrollWindow } from './scrollReaderWindowing';

const SCROLL_RESTORE_PROGRESS_FALLBACK_TOLERANCE = 0.03;

export function setStableRestoreWindow(
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

export function buildSkippedNoTargetResult(
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

export function areRestoreLocatorsEquivalent(
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

export function areRestoreLocatorsInSameBlock(
  left: ReaderLocator | null | undefined,
  right: ReaderLocator | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return left.chapterIndex === right.chapterIndex
    && left.blockIndex === right.blockIndex
    && left.kind === right.kind;
}

export function ensureScrollRestoreWindow(params: {
  chaptersLength: number;
  setScrollModeChapters: Dispatch<SetStateAction<number[]>>;
  target: ReaderRestoreTarget;
}): void {
  const { chaptersLength, setScrollModeChapters, target } = params;
  const targetChapterIndex = target.locator?.chapterIndex ?? target.chapterIndex;
  if (targetChapterIndex < 0 || targetChapterIndex >= chaptersLength) {
    return;
  }

  setStableRestoreWindow(
    setScrollModeChapters,
    buildFocusedScrollWindow(targetChapterIndex, chaptersLength),
  );
}

export function resolvePendingRestoreLocator(
  target: ReaderRestoreTarget,
  scrollLayouts: ReadonlyMap<number, ScrollReaderLayout>,
): ReaderLocator | null {
  if (target.locator) {
    return target.locator;
  }

  if (target.locatorBoundary === undefined) {
    return null;
  }

  const chapterLayout = scrollLayouts.get(target.chapterIndex) ?? null;
  return getChapterBoundaryLocator(chapterLayout, target.locatorBoundary);
}

export function resolvePendingScrollTarget(params: {
  container: HTMLDivElement;
  layoutQueries: {
    resolveScrollLocatorOffset: (locator: ReaderLocator) => number | null;
  };
  scrollChapterBodyElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollChapterElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollLayouts: ReadonlyMap<number, ScrollReaderLayout>;
  target: ReaderRestoreTarget;
}) {
  const {
    container,
    layoutQueries,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    scrollLayouts,
    target,
  } = params;
  const targetChapterIndex = target.locator?.chapterIndex ?? target.chapterIndex;
  const targetElement = scrollChapterElementsRef.current.get(targetChapterIndex) ?? null;
  const resolvedLocator = resolvePendingRestoreLocator(target, scrollLayouts);
  const containerMaxScrollTop = getContainerMaxScrollTop(container);
  const progressScrollTop = typeof target.chapterProgress === 'number'
    ? clampContainerScrollTop(container, containerMaxScrollTop * target.chapterProgress)
    : null;
  const resolvePreferredScrollTop = (candidateScrollTop: number): number => {
    if (progressScrollTop === null || typeof target.chapterProgress !== 'number') {
      return candidateScrollTop;
    }

    const candidateProgress = containerMaxScrollTop > 0 ? candidateScrollTop / containerMaxScrollTop : 0;
    if (
      Math.abs(candidateProgress - target.chapterProgress)
      > SCROLL_RESTORE_PROGRESS_FALLBACK_TOLERANCE
    ) {
      return progressScrollTop;
    }

    return candidateScrollTop;
  };

  type ScrollRestoreStepValue = {
    locator: ReaderLocator | null;
    scrollTop: number;
  };

  if (target.locatorBoundary !== undefined && resolvedLocator === null) {
    const hasResolvedBoundaryLayout = scrollLayouts.has(target.chapterIndex)
      && scrollChapterBodyElementsRef.current.has(target.chapterIndex);
    if (!hasResolvedBoundaryLayout) {
      return restoreStepPending<ScrollRestoreStepValue>('layout_missing');
    }

    // Layout is ready but produced no boundary locator (e.g. metrics not yet computed).
    // Fall back to chapter-progress scroll position once the container has a non-zero
    // scroll range; return pending if the DOM layout is not fully settled yet.
    if (progressScrollTop !== null) {
      if (containerMaxScrollTop > 0) {
        return restoreStepSuccess<ScrollRestoreStepValue>({
          locator: null,
          scrollTop: progressScrollTop,
        });
      }
      return restoreStepPending<ScrollRestoreStepValue>('layout_not_ready');
    }
  }

  if (resolvedLocator) {
    if (target.locatorBoundary === 'start' && targetElement) {
      const resolvedScrollTop = clampContainerScrollTop(container, targetElement.offsetTop);
      return restoreStepSuccess<ScrollRestoreStepValue>({
        locator: resolvedLocator,
        scrollTop: resolvePreferredScrollTop(resolvedScrollTop),
      });
    }

    const nextScrollTop = layoutQueries.resolveScrollLocatorOffset(resolvedLocator);
    if (nextScrollTop !== null) {
      // Guard: if the scroll container has no scrollable range yet the DOM layout
      // has not settled.  Returning success with scrollTop=0 here would complete
      // the restore prematurely; retry on the next frame instead.
      if (containerMaxScrollTop === 0) {
        return restoreStepPending<ScrollRestoreStepValue>('layout_not_ready');
      }
      const resolvedScrollTop = clampContainerScrollTop(
        container,
        nextScrollTop - container.clientHeight * SCROLL_READING_ANCHOR_RATIO,
      );
      return restoreStepSuccess<ScrollRestoreStepValue>({
        locator: resolvedLocator,
        scrollTop: resolvePreferredScrollTop(resolvedScrollTop),
      });
    }

    const hasResolvedChapterLayout = scrollLayouts.has(resolvedLocator.chapterIndex)
      && scrollChapterBodyElementsRef.current.has(resolvedLocator.chapterIndex);
    if (!hasResolvedChapterLayout) {
      return restoreStepPending<ScrollRestoreStepValue>('layout_missing');
    }
  }

  // Last resort: use chapter progress if locator-based resolution is unavailable.
  // Guard against returning a stale progress=0 when the container scroll range has
  // not been computed yet (DOM layout incomplete); retry on the next frame instead.
  if (progressScrollTop !== null) {
    if (containerMaxScrollTop > 0) {
      return restoreStepSuccess<ScrollRestoreStepValue>({
        locator: null,
        scrollTop: progressScrollTop,
      });
    }
    return restoreStepPending<ScrollRestoreStepValue>('layout_not_ready');
  }

  return restoreStepFailure<ScrollRestoreStepValue>('target_unresolvable', {
    retryable: false,
  });
}
