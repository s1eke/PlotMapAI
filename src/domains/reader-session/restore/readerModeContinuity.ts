import type {
  ReaderMode,
  ReaderRestoreTarget,
  StoredReaderState,
} from '@shared/contracts/reader';
import {
  getReaderRestoreTargetChapterIndex,
  getReaderRestoreTargetLocator,
} from '@shared/utils/readerStoredState';

export interface ScrollPagedContinuitySnapshot {
  chapterIndex: number;
  pagedPageIndex: number;
  scrollTarget: ReaderRestoreTarget;
}

export function cloneReaderRestoreTarget(target: ReaderRestoreTarget): ReaderRestoreTarget {
  return {
    ...target,
    position: target.position
      ? { ...target.position }
      : undefined,
    locator: target.locator
      ? {
        ...target.locator,
        startCursor: target.locator.startCursor
          ? { ...target.locator.startCursor }
          : undefined,
        endCursor: target.locator.endCursor
          ? { ...target.locator.endCursor }
          : undefined,
      }
      : undefined,
  };
}

export function createScrollPagedContinuitySnapshot(params: {
  pagedPageIndex: number;
  sourceTarget: ReaderRestoreTarget;
}): ScrollPagedContinuitySnapshot {
  return {
    chapterIndex: getReaderRestoreTargetChapterIndex(params.sourceTarget)
      ?? params.sourceTarget.chapterIndex,
    pagedPageIndex: params.pagedPageIndex,
    scrollTarget: cloneReaderRestoreTarget(params.sourceTarget),
  };
}

export function resolveScrollContinuityTarget(params: {
  continuitySnapshot: ScrollPagedContinuitySnapshot | null;
  sourceTarget: ReaderRestoreTarget;
}): ReaderRestoreTarget | null {
  const { continuitySnapshot, sourceTarget } = params;
  const sourcePageIndex = getReaderRestoreTargetLocator(sourceTarget)?.pageIndex;
  const sourceChapterIndex = getReaderRestoreTargetChapterIndex(sourceTarget)
    ?? sourceTarget.chapterIndex;
  if (
    !continuitySnapshot
    || typeof sourcePageIndex !== 'number'
    || continuitySnapshot.chapterIndex !== sourceChapterIndex
    || continuitySnapshot.pagedPageIndex !== sourcePageIndex
  ) {
    return null;
  }

  const restoredTarget = cloneReaderRestoreTarget(continuitySnapshot.scrollTarget);
  const restoredLocator = getReaderRestoreTargetLocator(restoredTarget);
  if (restoredLocator) {
    restoredTarget.locator = {
      ...restoredLocator,
      pageIndex: continuitySnapshot.pagedPageIndex,
    };
  }

  return {
    ...restoredTarget,
    mode: 'scroll',
  };
}

export function resolveNextChapterProgress(params: {
  currentReaderState: StoredReaderState;
  targetMode: ReaderMode;
  targetRestoreTarget: ReaderRestoreTarget;
}): number | undefined {
  const { currentReaderState, targetMode, targetRestoreTarget } = params;
  if (targetMode === 'summary') {
    return targetRestoreTarget.chapterProgress ?? 0;
  }

  if (targetMode === 'scroll') {
    return targetRestoreTarget.chapterProgress ?? currentReaderState.hints?.chapterProgress;
  }

  return currentReaderState.hints?.chapterProgress;
}
