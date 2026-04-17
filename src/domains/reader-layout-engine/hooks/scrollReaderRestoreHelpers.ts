import type { Dispatch, SetStateAction } from 'react';
import type { ReaderLocator, ReaderRestoreResult } from '@shared/contracts/reader';

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
