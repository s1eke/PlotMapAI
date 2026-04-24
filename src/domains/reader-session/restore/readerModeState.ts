import type {
  ReaderMode,
  ReaderRestoreTarget,
  ScrollModeAnchor,
  StoredReaderState,
} from '@shared/contracts/reader';

import { clampProgress, getContainerProgress } from '@shared/utils/readerPosition';

import {
  buildStoredReaderState,
  getStoredChapterIndex,
  mergeStoredReaderState,
  toCanonicalPositionFromLocator,
  toReaderLocatorFromCanonical,
} from '@shared/utils/readerStoredState';

function areCanonicalPositionsEquivalent(
  left: StoredReaderState['canonical'],
  right: StoredReaderState['canonical'],
): boolean {
  if (!left || !right) {
    return false;
  }

  return left.chapterIndex === right.chapterIndex
    && left.blockIndex === right.blockIndex
    && left.kind === right.kind
    && left.lineIndex === right.lineIndex
    && left.edge === right.edge
    && left.startCursor?.segmentIndex === right.startCursor?.segmentIndex
    && left.startCursor?.graphemeIndex === right.startCursor?.graphemeIndex
    && left.endCursor?.segmentIndex === right.endCursor?.segmentIndex
    && left.endCursor?.graphemeIndex === right.endCursor?.graphemeIndex;
}

function resolvePagedScrollProgressProjection(
  state: StoredReaderState,
  currentPagedLocator: ReturnType<typeof toReaderLocatorFromCanonical> | null,
): number | undefined {
  if (
    state.hints?.contentMode !== 'paged'
    || typeof state.hints.chapterProgress !== 'number'
  ) {
    return undefined;
  }

  const currentPageIndex = currentPagedLocator?.pageIndex;
  const previousPageIndex = state.hints.pageIndex;
  if (
    typeof currentPageIndex === 'number'
    && (
      previousPageIndex === undefined
      || previousPageIndex === currentPageIndex
    )
  ) {
    return state.hints.chapterProgress;
  }

  return undefined;
}

export function toRestoreTargetFromState(params: {
  chapterIndex: number;
  mode: ReaderMode;
  state: StoredReaderState;
}): ReaderRestoreTarget {
  const normalizedState = buildStoredReaderState(params.state);
  const locator = toReaderLocatorFromCanonical(
    normalizedState.canonical,
    normalizedState.hints?.pageIndex,
  );
  const canonicalEdge = normalizedState.canonical?.edge;
  const hasCanonicalBoundary =
    canonicalEdge === 'start'
    || canonicalEdge === 'end';
  const target: ReaderRestoreTarget = {
    chapterIndex: getStoredChapterIndex(normalizedState) || params.chapterIndex,
    mode: params.mode,
    locator,
    locatorBoundary: !locator && hasCanonicalBoundary ? canonicalEdge : undefined,
  };

  if (typeof normalizedState.hints?.chapterProgress === 'number') {
    target.chapterProgress = typeof normalizedState.hints?.chapterProgress === 'number'
      ? clampProgress(normalizedState.hints.chapterProgress)
      : undefined;
  }

  return target;
}

export function captureReaderStateSnapshot(params: {
  chapterIndex: number;
  currentAnchor: ScrollModeAnchor | null;
  currentOriginalLocator: ReturnType<typeof toReaderLocatorFromCanonical> | null;
  currentPagedLocator: ReturnType<typeof toReaderLocatorFromCanonical> | null;
  latestReaderState: StoredReaderState;
  mode: ReaderMode;
  navigationSource: 'navigation' | 'restore' | 'scroll' | null;
  storedReaderState: StoredReaderState;
  viewportContentElement: HTMLDivElement | null;
}): StoredReaderState {
  const latestChapterIndex = getStoredChapterIndex(params.latestReaderState);
  const shouldPreferLatestReaderState =
    params.navigationSource === 'navigation'
    || latestChapterIndex !== params.chapterIndex;
  const preferredReaderState = shouldPreferLatestReaderState
    ? buildStoredReaderState(params.latestReaderState)
    : buildStoredReaderState(params.storedReaderState);
  let nextState: StoredReaderState = buildStoredReaderState(preferredReaderState);

  if (params.mode === 'paged') {
    if (params.currentPagedLocator) {
      const nextChapterProgress = resolvePagedScrollProgressProjection(
        nextState,
        params.currentPagedLocator,
      );
      nextState = mergeStoredReaderState(nextState, {
        canonical: toCanonicalPositionFromLocator(params.currentPagedLocator),
        hints: {
          ...nextState.hints,
          chapterProgress: nextChapterProgress,
          contentMode: 'paged',
          pageIndex: params.currentPagedLocator.pageIndex,
        },
      });
    }
    return nextState;
  }

  if (params.mode === 'summary') {
    const nextChapterProgress = params.viewportContentElement
      ? getContainerProgress(params.viewportContentElement)
      : nextState.hints?.chapterProgress;
    return mergeStoredReaderState(nextState, {
      hints: {
        ...nextState.hints,
        chapterProgress: nextChapterProgress,
      },
    });
  }

  const currentOriginalCanonical = params.currentOriginalLocator
    ? toCanonicalPositionFromLocator(params.currentOriginalLocator)
    : undefined;
  let resolvedScrollProgress: number | undefined;
  if (typeof params.currentAnchor?.chapterProgress === 'number') {
    resolvedScrollProgress = clampProgress(params.currentAnchor.chapterProgress);
  } else if (params.viewportContentElement) {
    resolvedScrollProgress = getContainerProgress(params.viewportContentElement);
  }
  const shouldPreservePreviousProgress = resolvedScrollProgress === 0
    && typeof nextState.hints?.chapterProgress === 'number'
    && nextState.hints.chapterProgress > 0
    && areCanonicalPositionsEquivalent(nextState.canonical, currentOriginalCanonical);
  const nextChapterProgress = shouldPreservePreviousProgress
    ? nextState.hints?.chapterProgress
    : resolvedScrollProgress ?? nextState.hints?.chapterProgress;

  if (params.currentOriginalLocator && !shouldPreferLatestReaderState) {
    return mergeStoredReaderState(nextState, {
      canonical: toCanonicalPositionFromLocator(params.currentOriginalLocator),
      hints: {
        ...nextState.hints,
        chapterProgress: nextChapterProgress,
        pageIndex: undefined,
      },
    });
  }

  if (params.currentAnchor && !shouldPreferLatestReaderState) {
    return mergeStoredReaderState(nextState, {
      canonical: {
        chapterIndex: params.currentAnchor.chapterIndex,
        edge: 'start',
      },
      hints: {
        ...nextState.hints,
        chapterProgress: nextChapterProgress,
        pageIndex: undefined,
      },
    });
  }

  if (shouldPreferLatestReaderState) {
    return mergeStoredReaderState(nextState, {
      canonical: preferredReaderState.canonical,
      hints: preferredReaderState.hints,
    });
  }

  if (params.latestReaderState.canonical) {
    return mergeStoredReaderState(nextState, {
      canonical: params.latestReaderState.canonical,
      hints: {
        ...nextState.hints,
        chapterProgress: nextChapterProgress,
        pageIndex: undefined,
      },
    });
  }

  return nextState;
}

export function solveModeRestoreTarget(params: {
  baseTarget: ReaderRestoreTarget;
  chapterIndex: number;
  currentReaderState: StoredReaderState;
  mode: ReaderMode;
  modeSnapshots: Record<ReaderMode, ReaderRestoreTarget | null>;
  targetMode: ReaderMode;
}): ReaderRestoreTarget {
  const currentChapterIndex =
    params.currentReaderState.canonical?.chapterIndex ?? params.chapterIndex;

  if (params.targetMode === 'summary') {
    return {
      ...params.baseTarget,
      chapterProgress: 0,
      locatorBoundary: undefined,
      locator: undefined,
    };
  }

  if (params.mode !== 'summary') {
    return params.baseTarget;
  }

  const matchingSnapshot = params.modeSnapshots[params.targetMode];
  const canReuseSnapshot =
    matchingSnapshot && matchingSnapshot.chapterIndex === currentChapterIndex;
  if (canReuseSnapshot) {
    return {
      ...params.baseTarget,
      ...matchingSnapshot,
      mode: params.targetMode,
    };
  }

  return {
    chapterIndex: currentChapterIndex || params.chapterIndex,
    mode: params.targetMode,
    locatorBoundary: 'start',
  };
}
