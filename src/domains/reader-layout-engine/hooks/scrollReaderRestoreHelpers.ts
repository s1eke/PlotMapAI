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
  getChapterLocalProgress,
  getScrollTopForChapterProgress,
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
  const progressScrollTop = getScrollTopForChapterProgress(
    container,
    targetElement,
    target.chapterProgress,
  );
  const resolvePreferredScrollTop = (candidateScrollTop: number): number => {
    if (progressScrollTop === null || typeof target.chapterProgress !== 'number' || !targetElement) {
      return candidateScrollTop;
    }

    const candidateProgress = getChapterLocalProgress(
      {
        clientHeight: container.clientHeight,
        scrollTop: candidateScrollTop,
      },
      targetElement,
    );
    if (
      Math.abs(candidateProgress - target.chapterProgress)
      > SCROLL_RESTORE_PROGRESS_FALLBACK_TOLERANCE
    ) {
      return progressScrollTop;
    }

    return candidateScrollTop;
  };

  interface ScrollRestoreStepValue {
    locator: ReaderLocator | null;
    scrollTop: number;
  }

  if (target.locatorBoundary !== undefined && resolvedLocator === null) {
    const hasResolvedBoundaryLayout = scrollLayouts.has(target.chapterIndex)
      && scrollChapterBodyElementsRef.current.has(target.chapterIndex);
    if (!hasResolvedBoundaryLayout) {
      return restoreStepPending<ScrollRestoreStepValue>('layout_missing');
    }

    // 布局已就绪但未生成边界定位项（例如指标尚未计算）。
    // 一旦容器具有非零滚动范围，则回退到章节进度滚动位置；
    // 如果 DOM 布局尚未完全稳定，则返回等待状态。
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
      // 防护：如果滚动容器尚无滚动范围，则说明 DOM 布局尚未稳定。
      // 此时若返回 scrollTop=0 的成功状态会导致恢复过早完成；请在下一帧重试。
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

  // 最后手段：如果基于定位项的解析不可用，则使用章节进度。
  // 防止在容器滚动范围尚未计算（DOM 布局不完整）时返回过时的进度 0；
  // 请在下一帧重试。
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
