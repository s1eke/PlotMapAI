import type { ChapterContent } from '../api/readerApi';
import type { PageTarget, ReaderRestoreTarget } from '../hooks/readerSessionTypes';
import type {
  MeasuredChapterLayout,
  PaginatedChapterLayout,
  ReaderLocator,
} from '../utils/readerLayout';

import {
  findVisibleBlockRange,
  findLocatorForLayoutOffset,
  findPageIndexForLocator,
  getChapterBoundaryLocator,
  getOffsetForLocator,
  getPageStartLocator,
} from '../utils/readerLayout';
import {
  getPageIndexFromProgress,
  resolvePagedTargetPage,
  SCROLL_READING_ANCHOR_RATIO,
} from '../utils/readerPosition';

type ReaderPagedLayout = PaginatedChapterLayout;
type ReaderScrollLayout = MeasuredChapterLayout;

export function resolveCurrentScrollLocator(params: {
  chapterIndex: number;
  contentElement: HTMLDivElement | null;
  isPagedMode: boolean;
  scrollLayouts: ReadonlyMap<number, ReaderScrollLayout>;
  scrollChapterBodyElements: ReadonlyMap<number, HTMLDivElement>;
  scrollReaderChapters: Array<{ index: number; chapter: ChapterContent }>;
  viewMode: 'original' | 'summary';
}): ReaderLocator | null {
  if (
    params.isPagedMode
    || params.viewMode !== 'original'
    || !params.contentElement
    || params.scrollReaderChapters.length === 0
  ) {
    return null;
  }

  const visibleMarker =
    params.contentElement.scrollTop
    + params.contentElement.clientHeight * SCROLL_READING_ANCHOR_RATIO;
  const initialChapterIndex = params.scrollReaderChapters[0]?.index ?? params.chapterIndex;
  let currentLayout = params.scrollLayouts.get(initialChapterIndex) ?? null;
  let currentBodyElement = params.scrollChapterBodyElements.get(initialChapterIndex) ?? null;
  let currentTop = Number.NEGATIVE_INFINITY;

  for (const renderableChapter of params.scrollReaderChapters) {
    const chapterBodyElement = params.scrollChapterBodyElements.get(renderableChapter.index);
    const chapterLayout = params.scrollLayouts.get(renderableChapter.index);
    if (!chapterBodyElement || !chapterLayout) {
      continue;
    }
    if (
      chapterBodyElement.offsetTop <= visibleMarker
      && chapterBodyElement.offsetTop > currentTop
    ) {
      currentBodyElement = chapterBodyElement;
      currentLayout = chapterLayout;
      currentTop = chapterBodyElement.offsetTop;
    }
  }

  if (!currentLayout || !currentBodyElement) {
    return null;
  }

  return findLocatorForLayoutOffset(currentLayout, visibleMarker - currentBodyElement.offsetTop);
}

export function resolveCurrentPagedLocator(params: {
  currentPagedLayout: ReaderPagedLayout | null;
  isPagedMode: boolean;
  pageIndex: number;
  viewMode: 'original' | 'summary';
}): ReaderLocator | null {
  if (!params.isPagedMode || params.viewMode !== 'original' || !params.currentPagedLayout) {
    return null;
  }

  return getPageStartLocator(params.currentPagedLayout.pageSlices[params.pageIndex]);
}

export function resolveCurrentScrollLocatorOffset(params: {
  locator: ReaderLocator;
  scrollChapterBodyElements: ReadonlyMap<number, HTMLDivElement>;
  scrollLayouts: ReadonlyMap<number, ReaderScrollLayout>;
}): number | null {
  const chapterBodyElement = params.scrollChapterBodyElements.get(params.locator.chapterIndex);
  const chapterLayout = params.scrollLayouts.get(params.locator.chapterIndex);
  if (!chapterBodyElement || !chapterLayout) {
    return null;
  }

  const offset = getOffsetForLocator(chapterLayout, params.locator);
  if (offset === null) {
    return null;
  }

  return chapterBodyElement.offsetTop + offset;
}

export function resolvePagedViewportState(params: {
  chapterIndex: number;
  currentPagedLayout: ReaderPagedLayout;
  pageIndex: number;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingPageTarget: PageTarget | null;
}): {
    pageCount: number;
    targetPage: number;
  } {
  const pageCount = Math.max(1, params.currentPagedLayout.pageSlices.length);
  const restoredLocator = params.pendingRestoreTarget?.locator
    ?? (
      params.pendingRestoreTarget?.locatorBoundary !== undefined
        ? getChapterBoundaryLocator(
          params.currentPagedLayout,
          params.pendingRestoreTarget.locatorBoundary,
        )
        : null
    );
  const restoredPageIndex = restoredLocator
    ? findPageIndexForLocator(params.currentPagedLayout, restoredLocator)
    : null;
  const chapterProgress = params.pendingRestoreTarget?.chapterProgress;
  const hasRestorableProgress = params.pendingRestoreTarget?.chapterIndex === params.chapterIndex
    && typeof chapterProgress === 'number';
  let targetPage = resolvePagedTargetPage(params.pendingPageTarget, params.pageIndex, pageCount);
  if (hasRestorableProgress) {
    targetPage = getPageIndexFromProgress(
      chapterProgress,
      pageCount,
    );
  }
  if (restoredPageIndex !== null) {
    targetPage = restoredPageIndex;
  }

  return {
    pageCount,
    targetPage,
  };
}

export function calculateVisibleScrollBlockRanges(params: {
  contentElement: HTMLDivElement | null;
  isPagedMode: boolean;
  renderableScrollLayouts: Array<{
    chapter: ChapterContent;
    index: number;
    layout: ReaderScrollLayout;
  }>;
  scrollChapterBodyElements: ReadonlyMap<number, HTMLDivElement>;
  scrollViewportHeight: number;
  scrollViewportTop: number;
  viewMode: 'original' | 'summary';
}): Map<number, ReturnType<typeof findVisibleBlockRange>> {
  if (params.isPagedMode || params.viewMode !== 'original' || !params.contentElement) {
    return new Map();
  }

  const viewportRect = params.contentElement.getBoundingClientRect();
  const viewportHeight = params.contentElement.clientHeight
    || viewportRect.height
    || params.scrollViewportHeight;
  if (viewportHeight <= 0) {
    return new Map();
  }

  const nextRanges = new Map<number, ReturnType<typeof findVisibleBlockRange>>();
  const overscanPx = Math.max(240, Math.round(viewportHeight * 0.75));
  for (const renderableChapter of params.renderableScrollLayouts) {
    const chapterBodyElement = params.scrollChapterBodyElements.get(renderableChapter.index);
    if (!chapterBodyElement) {
      continue;
    }

    const chapterBodyRect = chapterBodyElement.getBoundingClientRect();
    const offsetTop = Number.isFinite(viewportRect.top) && Number.isFinite(chapterBodyRect.top)
      ? viewportRect.top - chapterBodyRect.top
      : params.scrollViewportTop - chapterBodyElement.offsetTop;
    nextRanges.set(
      renderableChapter.index,
      findVisibleBlockRange(
        renderableChapter.layout,
        offsetTop,
        viewportHeight,
        overscanPx,
      ),
    );
  }

  return nextRanges;
}
