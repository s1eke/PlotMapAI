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
      nextState = mergeStoredReaderState(nextState, {
        canonical: toCanonicalPositionFromLocator(params.currentPagedLocator),
        hints: {
          ...nextState.hints,
          pageIndex: params.currentPagedLocator.pageIndex,
        },
      });
    }
    return nextState;
  }

  if (params.mode === 'summary') {
    return mergeStoredReaderState(nextState, {
      hints: {
        ...nextState.hints,
        chapterProgress: getContainerProgress(params.viewportContentElement),
      },
    });
  }

  const resolvedScrollProgress = getContainerProgress(params.viewportContentElement);

  if (params.currentOriginalLocator && !shouldPreferLatestReaderState) {
    return mergeStoredReaderState(nextState, {
      canonical: toCanonicalPositionFromLocator(params.currentOriginalLocator),
      hints: {
        ...nextState.hints,
        chapterProgress: resolvedScrollProgress,
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
        chapterProgress: resolvedScrollProgress,
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
        chapterProgress: resolvedScrollProgress,
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
