import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  ReaderLocator,
  ReaderRestoreResult,
  ReaderRestoreTarget,
} from '@shared/contracts/reader';
import type { ScrollReaderLayout } from './scrollReaderControllerTypes';

import {
  getChapterBoundaryLocator,
  resolveLocatorGlobalOffset,
  resolveGlobalOffsetPosition,
  type NovelFlowIndex,
} from '../layout-core/internal';
import {
  clampContainerScrollTop,
  clampProgress,
  getChapterLocalProgress,
  getContainerMaxScrollTop,
  getScrollTopForChapterProgress,
  SCROLL_READING_ANCHOR_RATIO,
} from '@shared/utils/readerPosition';
import {
  getReaderRestoreTargetBoundary,
  getReaderRestoreTargetChapterIndex,
  getReaderRestoreTargetLocator,
} from '@shared/utils/readerStoredState';
import {
  restoreStepFailure,
  restoreStepPending,
  restoreStepSuccess,
} from '@shared/utils/readerRestoreSolver';
import { buildFocusedScrollWindow } from './scrollReaderWindowing';

const SCROLL_RESTORE_PROGRESS_FALLBACK_TOLERANCE_PX = 32;

function isFocusedSingleChapterContainer(params: {
  container: HTMLDivElement;
  targetElement: HTMLDivElement | null;
}): boolean {
  const { container, targetElement } = params;
  return Boolean(
    targetElement
    && container.scrollHeight > 0
    && targetElement.offsetHeight > 0
    && container.scrollHeight <= targetElement.offsetHeight + 1,
  );
}

export function resolveScrollTopForRestoreChapterProgress(params: {
  chapterProgress: number | undefined;
  container: HTMLDivElement;
  targetElement: HTMLDivElement | null;
}): number | null {
  const { chapterProgress, container, targetElement } = params;
  if (typeof chapterProgress !== 'number') {
    return null;
  }
  const readingAnchorOffset = container.clientHeight * SCROLL_READING_ANCHOR_RATIO;

  if (isFocusedSingleChapterContainer({ container, targetElement })) {
    return clampContainerScrollTop(
      container,
      getContainerMaxScrollTop(container) * clampProgress(chapterProgress)
        - readingAnchorOffset,
    );
  }

  return getScrollTopForChapterProgress(
    container,
    targetElement,
    chapterProgress,
    readingAnchorOffset,
  );
}

export function resolveRestoredScrollGlobalOffset(params: {
  novelFlowIndex: NovelFlowIndex | null;
  resolvedLocator: ReaderLocator | null | undefined;
  restoredChapterIndex: number;
  restoredChapterProgress: number | undefined;
}): number | undefined {
  const {
    novelFlowIndex,
    resolvedLocator,
    restoredChapterIndex,
    restoredChapterProgress,
  } = params;
  if (!novelFlowIndex) {
    return undefined;
  }

  const locatorOffset = resolveLocatorGlobalOffset(novelFlowIndex, resolvedLocator);
  if (locatorOffset !== null) {
    return locatorOffset;
  }

  const flowEntry = novelFlowIndex.chapters[restoredChapterIndex];
  if (!flowEntry || typeof restoredChapterProgress !== 'number') {
    return undefined;
  }

  const chapterHeight = Math.max(0, flowEntry.scrollEnd - flowEntry.scrollStart);
  return flowEntry.scrollStart + chapterHeight * restoredChapterProgress;
}

export function resolveRestoredChapterProgress(params: {
  container: HTMLDivElement | null;
  restoredChapterElement: HTMLDivElement | null;
}): number | undefined {
  const { container, restoredChapterElement } = params;
  return container && restoredChapterElement
    ? getChapterLocalProgress(
      container,
      restoredChapterElement,
      container.clientHeight * SCROLL_READING_ANCHOR_RATIO,
    )
    : undefined;
}

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
  const targetChapterIndex = getReaderRestoreTargetChapterIndex(target) ?? target.chapterIndex;
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
  const targetLocator = getReaderRestoreTargetLocator(target);
  if (targetLocator) {
    return targetLocator;
  }

  const targetBoundary = getReaderRestoreTargetBoundary(target);
  if (targetBoundary === undefined) {
    return null;
  }

  const targetChapterIndex = getReaderRestoreTargetChapterIndex(target) ?? target.chapterIndex;
  const chapterLayout = scrollLayouts.get(targetChapterIndex) ?? null;
  return getChapterBoundaryLocator(chapterLayout, targetBoundary);
}

export function resolvePendingScrollTarget(params: {
  container: HTMLDivElement;
  layoutQueries: {
    resolveScrollLocatorOffset: (locator: ReaderLocator) => number | null;
  };
  scrollChapterBodyElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollChapterElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollLayouts: ReadonlyMap<number, ScrollReaderLayout>;
  novelFlowIndex: NovelFlowIndex | null;
  target: ReaderRestoreTarget;
}) {
  const {
    container,
    layoutQueries,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    scrollLayouts,
    novelFlowIndex,
    target,
  } = params;
  const targetLocator = getReaderRestoreTargetLocator(target);
  const targetBoundary = getReaderRestoreTargetBoundary(target);
  const targetChapterIndex = getReaderRestoreTargetChapterIndex(target) ?? target.chapterIndex;
  const targetElement = scrollChapterElementsRef.current.get(targetChapterIndex) ?? null;
  const resolvedLocator = resolvePendingRestoreLocator(target, scrollLayouts);
  const containerMaxScrollTop = getContainerMaxScrollTop(container);
  const progressScrollTop = resolveScrollTopForRestoreChapterProgress({
    chapterProgress: target.chapterProgress,
    container,
    targetElement,
  });
  const resolvePreferredScrollTop = (candidateScrollTop: number): number => {
    if (targetLocator && typeof targetLocator.pageIndex !== 'number') {
      const locatorScrollTopHitBoundary =
        candidateScrollTop <= 0
        || candidateScrollTop >= containerMaxScrollTop;
      if (
        locatorScrollTopHitBoundary
        && progressScrollTop !== null
        && typeof target.chapterProgress === 'number'
        && Math.abs(candidateScrollTop - progressScrollTop)
          > SCROLL_RESTORE_PROGRESS_FALLBACK_TOLERANCE_PX
      ) {
        return progressScrollTop;
      }

      return candidateScrollTop;
    }

    if (
      typeof targetLocator?.pageIndex === 'number'
      && typeof target.chapterProgress !== 'number'
    ) {
      return candidateScrollTop;
    }

    if (progressScrollTop === null || typeof target.chapterProgress !== 'number' || !targetElement) {
      return candidateScrollTop;
    }

    if (
      Math.abs(candidateScrollTop - progressScrollTop)
      > SCROLL_RESTORE_PROGRESS_FALLBACK_TOLERANCE_PX
    ) {
      return progressScrollTop;
    }

    return candidateScrollTop;
  };
  const resolveGlobalFlowScrollTop = (): number | null => {
    const { globalFlow } = target;
    if (
      typeof target.chapterProgress === 'number'
      || !novelFlowIndex
      || novelFlowIndex.totalScrollHeight <= 0
      || typeof globalFlow?.globalScrollOffset !== 'number'
      || !Number.isFinite(globalFlow.globalScrollOffset)
    ) {
      return null;
    }

    if (globalFlow.layoutKey && globalFlow.layoutKey !== novelFlowIndex.layoutKey) {
      return null;
    }

    const resolvedGlobalPosition = resolveGlobalOffsetPosition(
      novelFlowIndex,
      globalFlow.globalScrollOffset,
    );
    if (!resolvedGlobalPosition) {
      return null;
    }

    return clampContainerScrollTop(
      container,
      resolvedGlobalPosition.globalOffset
        - container.clientHeight * SCROLL_READING_ANCHOR_RATIO,
    );
  };

  interface ScrollRestoreStepValue {
    locator: ReaderLocator | null;
    scrollTop: number;
  }

  if (targetBoundary !== undefined && resolvedLocator === null) {
    const hasResolvedBoundaryLayout = scrollLayouts.has(targetChapterIndex)
      && scrollChapterBodyElementsRef.current.has(targetChapterIndex);
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
    if (targetBoundary === 'start' && targetElement) {
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
      const globalFlowScrollTop = resolveGlobalFlowScrollTop();
      if (globalFlowScrollTop !== null) {
        if (containerMaxScrollTop > 0) {
          return restoreStepSuccess<ScrollRestoreStepValue>({
            locator: null,
            scrollTop: globalFlowScrollTop,
          });
        }
        return restoreStepPending<ScrollRestoreStepValue>('layout_not_ready');
      }
      return restoreStepPending<ScrollRestoreStepValue>('layout_missing');
    }
  }

  const globalFlowScrollTop = resolveGlobalFlowScrollTop();
  if (globalFlowScrollTop !== null) {
    if (containerMaxScrollTop > 0) {
      return restoreStepSuccess<ScrollRestoreStepValue>({
        locator: null,
        scrollTop: globalFlowScrollTop,
      });
    }
    return restoreStepPending<ScrollRestoreStepValue>('layout_not_ready');
  }

  // 最后手段：如果基于定位项和全书 flow 的解析不可用，则使用章节进度。
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
