import type {
  CanonicalPosition,
  ReaderLocatorBoundary,
  ReaderMode,
  ReaderNavigationIntent,
  ReaderRestoreTarget,
  StoredReaderState,
} from '@shared/contracts/reader';
import {
  buildStoredReaderState,
  getStoredChapterIndex,
  toCanonicalPositionFromLocator,
  toReaderLocatorFromCanonical,
} from './readerStoredState';
import { resolvePersistedReaderMode } from './readerMode';

export interface ChapterRenderData {
  paragraphs: string[];
  skipLineIndex: number;
}

export const SCROLL_READING_ANCHOR_RATIO = 0.3;

export function getContainerMaxScrollTop(element: HTMLDivElement | null): number {
  if (!element) return 0;
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

export function clampContainerScrollTop(
  element: HTMLDivElement | null,
  scrollTop: number,
): number {
  const nextScrollTop = Math.round(scrollTop);
  if (!element) {
    return Math.max(0, nextScrollTop);
  }

  return Math.max(0, Math.min(getContainerMaxScrollTop(element), nextScrollTop));
}

export function clampProgress(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function getContainerProgress(element: HTMLDivElement | null): number {
  if (!element) return 0;

  const maxScroll = getContainerMaxScrollTop(element);
  if (maxScroll <= 0) return 0;

  return clampProgress(element.scrollTop / maxScroll);
}

export function getPageIndexFromProgress(progress: number | undefined, totalPages: number): number {
  if (totalPages <= 1) return 0;
  return Math.max(
    0,
    Math.min(totalPages - 1, Math.round(clampProgress(progress) * (totalPages - 1))),
  );
}

export function resolvePagedRestoreTargetPageIndex(params: {
  chapterProgress?: number;
  locatorPageIndex?: number;
  resolvedLocatorPageIndex?: number | null;
  totalPages: number;
}): number | null {
  const progressPageIndex = typeof params.chapterProgress === 'number'
    ? getPageIndexFromProgress(params.chapterProgress, params.totalPages)
    : null;

  if (typeof params.locatorPageIndex === 'number') {
    return Math.max(0, Math.min(params.totalPages - 1, params.locatorPageIndex));
  }

  if (typeof params.resolvedLocatorPageIndex === 'number') {
    if (
      params.resolvedLocatorPageIndex === 0
      && progressPageIndex !== null
      && progressPageIndex > 0
    ) {
      return progressPageIndex;
    }

    return Math.max(0, Math.min(params.totalPages - 1, params.resolvedLocatorPageIndex));
  }

  return progressPageIndex;
}

export function resolvePagedTargetPage(
  pageTarget: 'start' | 'end' | null | undefined,
  pageIndex: number,
  totalPages: number,
): number {
  if (totalPages <= 1) {
    return 0;
  }

  if (pageTarget === 'start') {
    return 0;
  }

  if (pageTarget === 'end') {
    return totalPages - 1;
  }

  return Math.max(0, Math.min(totalPages - 1, pageIndex));
}

export function hasReaderRestoreTarget(
  target: ReaderRestoreTarget | null | undefined,
): boolean {
  if (!target) return false;

  const usesSummaryProgress = target.mode === 'summary'
    && typeof target.chapterProgress === 'number'
    && Number.isFinite(target.chapterProgress);

  return target.locator !== undefined
    || target.locatorBoundary !== undefined
    || usesSummaryProgress;
}

export function shouldKeepReaderRestoreMask(
  target: ReaderRestoreTarget | null | undefined,
): boolean {
  if (!target) return false;

  const usesSummaryProgress = target.mode === 'summary'
    && typeof target.chapterProgress === 'number'
    && target.chapterProgress > 0;

  return target.locator !== undefined
    || target.locatorBoundary !== undefined
    || usesSummaryProgress;
}

export function canSkipReaderRestore(
  target: ReaderRestoreTarget | null | undefined,
): boolean {
  return !hasReaderRestoreTarget(target);
}

export function createRestoreTargetFromPersistedState(
  state: StoredReaderState | null | undefined,
  mode: ReaderMode = 'scroll',
): ReaderRestoreTarget | null {
  if (!state) {
    return null;
  }

  const normalizedState = buildStoredReaderState(state);
  const targetMode = resolvePersistedReaderMode(normalizedState, {
    fallbackContentMode: mode === 'paged' ? 'paged' : 'scroll',
  }).mode;
  const locator = toReaderLocatorFromCanonical(
    normalizedState.canonical,
    normalizedState.hints?.pageIndex,
  );
  const canonicalEdge = normalizedState.canonical?.edge;
  const hasCanonicalBoundary =
    canonicalEdge === 'start'
    || canonicalEdge === 'end';
  const locatorBoundary = !locator && hasCanonicalBoundary
    ? canonicalEdge
    : undefined;
  const target: ReaderRestoreTarget = {
    chapterIndex: getStoredChapterIndex(normalizedState),
    mode: targetMode,
    locator,
    locatorBoundary,
  };

  if (typeof normalizedState.hints?.chapterProgress === 'number') {
    target.chapterProgress = typeof normalizedState.hints?.chapterProgress === 'number'
      ? clampProgress(normalizedState.hints.chapterProgress)
      : undefined;
  }

  return shouldKeepReaderRestoreMask(target) ? target : null;
}

export function createRestoreTargetFromNavigationIntent(
  intent: ReaderNavigationIntent,
  mode: ReaderMode,
): ReaderRestoreTarget {
  const locatorBoundary: ReaderLocatorBoundary = intent.locatorBoundary ?? intent.pageTarget;

  return {
    chapterIndex: intent.locator?.chapterIndex ?? intent.chapterIndex,
    mode,
    locatorBoundary: intent.locator ? undefined : locatorBoundary,
    locator: intent.locator,
  };
}

export function createCanonicalPositionFromNavigationIntent(
  intent: Pick<ReaderNavigationIntent, 'chapterIndex' | 'locator' | 'pageTarget'>,
): CanonicalPosition {
  const fromLocator = toCanonicalPositionFromLocator(intent.locator);
  if (fromLocator) {
    return fromLocator;
  }

  return {
    chapterIndex: intent.chapterIndex,
    edge: intent.pageTarget,
  };
}

export function buildChapterRenderData(content: string, title: string): ChapterRenderData {
  const paragraphs = content.split('\n');
  const firstNonEmptyIndex = paragraphs.findIndex((paragraph) => paragraph.trim().length > 0);
  const skipLineIndex =
    firstNonEmptyIndex !== -1 && paragraphs[firstNonEmptyIndex].trim() === title.trim()
      ? firstNonEmptyIndex
      : -1;

  return {
    paragraphs,
    skipLineIndex,
  };
}
