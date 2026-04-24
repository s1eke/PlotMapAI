import type {
  ReaderMode,
  ReaderRestoreTarget,
  StoredReaderState,
} from '@shared/contracts/reader';

export interface ScrollPagedContinuitySnapshot {
  chapterIndex: number;
  pagedPageIndex: number;
  scrollTarget: ReaderRestoreTarget;
}

export function cloneReaderRestoreTarget(target: ReaderRestoreTarget): ReaderRestoreTarget {
  return {
    ...target,
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
    chapterIndex: params.sourceTarget.chapterIndex,
    pagedPageIndex: params.pagedPageIndex,
    scrollTarget: cloneReaderRestoreTarget(params.sourceTarget),
  };
}

export function resolveScrollContinuityTarget(params: {
  continuitySnapshot: ScrollPagedContinuitySnapshot | null;
  sourceTarget: ReaderRestoreTarget;
}): ReaderRestoreTarget | null {
  const { continuitySnapshot, sourceTarget } = params;
  const sourcePageIndex = sourceTarget.locator?.pageIndex;
  if (
    !continuitySnapshot
    || typeof sourcePageIndex !== 'number'
    || continuitySnapshot.chapterIndex !== sourceTarget.chapterIndex
    || continuitySnapshot.pagedPageIndex !== sourcePageIndex
  ) {
    return null;
  }

  return {
    ...cloneReaderRestoreTarget(continuitySnapshot.scrollTarget),
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
