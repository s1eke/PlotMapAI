import type {
  ReaderNavigationIntent,
  ReaderMode,
  ReaderRestoreTarget,
  StoredReaderState,
} from '../hooks/readerSessionTypes';

export interface ChapterRenderData {
  paragraphs: string[];
  skipLineIndex: number;
}

export const SCROLL_READING_ANCHOR_RATIO = 0.3;

export function clampProgress(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function getContainerProgress(element: HTMLDivElement | null): number {
  if (!element) return 0;

  const maxScroll = element.scrollHeight - element.clientHeight;
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

function resolveRestoreTargetViewState(
  state: StoredReaderState | null | undefined,
): Pick<ReaderRestoreTarget, 'chapterIndex' | 'mode'> {
  return {
    chapterIndex: state?.chapterIndex ?? 0,
    mode: state?.mode ?? 'scroll',
  };
}

export function hasReaderRestoreTarget(
  target: ReaderRestoreTarget | null | undefined,
): boolean {
  if (!target) return false;

  return target.locator !== undefined
    || (typeof target.chapterProgress === 'number' && Number.isFinite(target.chapterProgress))
    || (typeof target.scrollPosition === 'number' && Number.isFinite(target.scrollPosition));
}

export function shouldKeepReaderRestoreMask(
  target: ReaderRestoreTarget | null | undefined,
): boolean {
  if (!target) return false;

  return target.locator !== undefined
    || (typeof target.chapterProgress === 'number' && target.chapterProgress > 0)
    || (typeof target.scrollPosition === 'number' && target.scrollPosition > 0);
}

export function canSkipReaderRestore(
  target: ReaderRestoreTarget | null | undefined,
): boolean {
  return !hasReaderRestoreTarget(target);
}

export function createRestoreTargetFromPersistedState(
  state: StoredReaderState | null | undefined,
): ReaderRestoreTarget | null {
  if (!state) {
    return null;
  }

  const target: ReaderRestoreTarget = {
    ...resolveRestoreTargetViewState(state),
    chapterProgress: typeof state.chapterProgress === 'number'
      ? clampProgress(state.chapterProgress)
      : undefined,
    scrollPosition: typeof state.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
      ? state.scrollPosition
      : undefined,
    locatorVersion: state.locator ? 1 : undefined,
    locator: state.locator,
  };

  return shouldKeepReaderRestoreMask(target) ? target : null;
}

export function createRestoreTargetFromNavigationIntent(
  intent: ReaderNavigationIntent,
  mode: ReaderMode,
): ReaderRestoreTarget {
  return {
    chapterIndex: intent.chapterIndex,
    mode,
    chapterProgress: intent.pageTarget === 'end' ? 1 : 0,
    locatorVersion: undefined,
    locator: undefined,
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
