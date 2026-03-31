import type { PaginatedChapterLayout } from './readerLayout';
import { resolvePagedTargetPage } from './readerPosition';

export interface PendingCommittedPageOverride {
  chapterIndex: number;
  pageIndex: number;
}

export function getEffectivePagedRenderPageIndex(params: {
  currentChapterIndex: number;
  currentLayout: PaginatedChapterLayout | null;
  pageIndex: number;
  pendingPageTarget?: 'start' | 'end' | null;
  pendingOverride: PendingCommittedPageOverride | null;
}): number {
  const {
    currentChapterIndex,
    currentLayout,
    pageIndex,
    pendingOverride,
    pendingPageTarget,
  } = params;
  if (!currentLayout) {
    return pageIndex;
  }

  if (pendingOverride
    && currentLayout.chapterIndex === pendingOverride.chapterIndex
    && currentChapterIndex === pendingOverride.chapterIndex) {
    return Math.max(0, Math.min(currentLayout.pageSlices.length - 1, pendingOverride.pageIndex));
  }

  return resolvePagedTargetPage(pendingPageTarget, pageIndex, currentLayout.pageSlices.length);
}

export function shouldClearPendingCommittedPageOverride(params: {
  currentChapterIndex: number;
  currentLayout: PaginatedChapterLayout | null;
  pageIndex: number;
  pendingOverride: PendingCommittedPageOverride | null;
}): boolean {
  const { currentChapterIndex, currentLayout, pageIndex, pendingOverride } = params;
  if (!pendingOverride) {
    return false;
  }

  if (!currentLayout || currentLayout.chapterIndex !== pendingOverride.chapterIndex) {
    return false;
  }

  return (
    currentChapterIndex === pendingOverride.chapterIndex &&
    pageIndex === pendingOverride.pageIndex
  );
}
