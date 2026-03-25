import type { StoredReaderState } from '../hooks/useReaderStatePersistence';

export interface ChapterRenderData {
  paragraphs: string[];
  skipLineIndex: number;
}

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
  return Math.max(0, Math.min(totalPages - 1, Math.round(clampProgress(progress) * (totalPages - 1))));
}

export function shouldMaskReaderPositionRestore(state: StoredReaderState | null | undefined): boolean {
  if (!state) return false;

  return (state.chapterIndex ?? 0) > 0
    || state.viewMode === 'summary'
    || state.isTwoColumn === true
    || (typeof state.chapterProgress === 'number' && state.chapterProgress > 0)
    || (typeof state.scrollPosition === 'number' && state.scrollPosition > 0);
}

export function buildChapterRenderData(content: string, title: string): ChapterRenderData {
  const paragraphs = content.split('\n');
  const firstNonEmptyIndex = paragraphs.findIndex((paragraph) => paragraph.trim().length > 0);
  const skipLineIndex = firstNonEmptyIndex !== -1 && paragraphs[firstNonEmptyIndex].trim() === title.trim()
    ? firstNonEmptyIndex
    : -1;

  return {
    paragraphs,
    skipLineIndex,
  };
}
