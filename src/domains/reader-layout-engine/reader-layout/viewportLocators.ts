import type { ChapterContent } from '@shared/contracts/reader';
import type { PageTarget, ReaderRestoreTarget } from '@shared/contracts/reader';
import type {
  MeasuredChapterLayout,
  PaginatedChapterLayout,
  ReaderLocator,
  ReaderPageColumn,
  ReaderPageItem,
  ReaderTextPageItem,
} from '../utils/layout/readerLayout';
import {
  findVisibleBlockRange,
  findLocatorForLayoutOffset,
  findPageIndexForLocator,
  getChapterBoundaryLocator,
  getOffsetForLocator,
  getPageStartLocator,
} from '../utils/layout/readerLayout';
import {
  resolvePagedTargetPage,
  SCROLL_READING_ANCHOR_RATIO,
} from '@shared/utils/readerPosition';
type ReaderPagedLayout = PaginatedChapterLayout;
type ReaderScrollLayout = MeasuredChapterLayout;

interface ScrollCanonicalSamplingSource {
  chapterIndex: number;
  contentElement: HTMLDivElement;
  scrollLayouts: ReadonlyMap<number, ReaderScrollLayout>;
  scrollChapterBodyElements: ReadonlyMap<number, HTMLDivElement>;
  scrollReaderChapters: Array<{ index: number; chapter: ChapterContent }>;
}

interface PagedCanonicalSamplingSource {
  currentPagedLayout: ReaderPagedLayout;
  pageIndex: number;
}

type CanonicalSamplingSource =
  | { mode: 'scroll'; source: ScrollCanonicalSamplingSource }
  | { mode: 'paged'; source: PagedCanonicalSamplingSource };

function clampAnchorRatio(anchorRatio: number): number {
  if (!Number.isFinite(anchorRatio)) {
    return SCROLL_READING_ANCHOR_RATIO;
  }

  if (anchorRatio <= 0) {
    return 0;
  }

  if (anchorRatio >= 1) {
    return 1;
  }

  return anchorRatio;
}

function toPageItemStartLocator(
  item: ReaderPageItem,
  pageIndex: number,
): ReaderLocator | null {
  if (item.kind === 'blank') {
    return null;
  }

  if (item.kind === 'image') {
    return {
      chapterIndex: item.chapterIndex,
      blockIndex: item.blockIndex,
      kind: 'image',
      edge: 'start',
      pageIndex,
    };
  }

  const firstLine = item.lines[0];
  return {
    chapterIndex: item.chapterIndex,
    blockIndex: item.blockIndex,
    kind: item.kind,
    lineIndex: item.lineStartIndex,
    startCursor: firstLine?.start,
    endCursor: firstLine?.end,
    pageIndex,
  };
}

function toPageItemEndLocator(
  item: ReaderPageItem,
  pageIndex: number,
): ReaderLocator | null {
  if (item.kind === 'blank') {
    return null;
  }

  if (item.kind === 'image') {
    return {
      chapterIndex: item.chapterIndex,
      blockIndex: item.blockIndex,
      kind: 'image',
      edge: 'end',
      pageIndex,
    };
  }

  const lastLine = item.lines[item.lines.length - 1];
  return {
    chapterIndex: item.chapterIndex,
    blockIndex: item.blockIndex,
    kind: item.kind,
    lineIndex: item.lineStartIndex + Math.max(item.lines.length - 1, 0),
    startCursor: lastLine?.start,
    endCursor: lastLine?.end,
    pageIndex,
  };
}

function sampleTextPageItemLocator(
  item: ReaderTextPageItem,
  offsetWithinItem: number,
  pageIndex: number,
): ReaderLocator {
  const lineCount = Math.max(item.lines.length, 1);
  const lineHeight = Math.max(item.lineHeightPx, 1);
  const contentOffset = Math.max(
    0,
    offsetWithinItem - item.marginBefore,
  );
  const lineOffset = Math.max(
    0,
    Math.min(lineCount - 1, Math.floor(contentOffset / lineHeight)),
  );
  const sampledLine = item.lines[lineOffset];

  return {
    chapterIndex: item.chapterIndex,
    blockIndex: item.blockIndex,
    kind: item.kind,
    lineIndex: item.lineStartIndex + lineOffset,
    startCursor: sampledLine?.start,
    endCursor: sampledLine?.end,
    pageIndex,
  };
}

function samplePageItemLocator(
  item: ReaderPageItem,
  offsetWithinItem: number,
  pageIndex: number,
): ReaderLocator | null {
  if (item.kind === 'blank') {
    return null;
  }

  if (item.kind === 'image') {
    const imageHeight = Math.max(item.displayHeight, 1);
    const contentOffset = offsetWithinItem - item.marginBefore;

    return {
      chapterIndex: item.chapterIndex,
      blockIndex: item.blockIndex,
      kind: 'image',
      edge: contentOffset >= imageHeight / 2 ? 'end' : 'start',
      pageIndex,
    };
  }

  return sampleTextPageItemLocator(item, offsetWithinItem, pageIndex);
}

function resolveBlankItemFallbackLocator(params: {
  items: ReaderPageItem[];
  pivotIndex: number;
  offsetWithinItem: number;
  pageIndex: number;
  itemHeight: number;
}): ReaderLocator | null {
  const {
    items,
    pivotIndex,
    offsetWithinItem,
    pageIndex,
    itemHeight,
  } = params;
  const preferNext = offsetWithinItem >= itemHeight / 2;
  let previousLocator: ReaderLocator | null = null;
  let nextLocator: ReaderLocator | null = null;

  for (let index = pivotIndex - 1; index >= 0; index -= 1) {
    const locator = toPageItemEndLocator(items[index], pageIndex);
    if (locator) {
      previousLocator = locator;
      break;
    }
  }

  for (let index = pivotIndex + 1; index < items.length; index += 1) {
    const locator = toPageItemStartLocator(items[index], pageIndex);
    if (locator) {
      nextLocator = locator;
      break;
    }
  }

  return preferNext
    ? nextLocator ?? previousLocator
    : previousLocator ?? nextLocator;
}

function sampleLocatorFromColumn(
  column: ReaderPageColumn | undefined,
  offset: number,
  pageIndex: number,
): ReaderLocator | null {
  if (!column || column.items.length === 0) {
    return null;
  }

  let currentTop = 0;
  for (let index = 0; index < column.items.length; index += 1) {
    const item = column.items[index];
    const itemHeight = Math.max(item.height, 1);
    const nextTop = currentTop + itemHeight;

    if (offset < nextTop || index === column.items.length - 1) {
      const offsetWithinItem = Math.max(
        0,
        Math.min(itemHeight - 1, offset - currentTop),
      );
      const sampled = samplePageItemLocator(item, offsetWithinItem, pageIndex);
      if (sampled) {
        return sampled;
      }

      return resolveBlankItemFallbackLocator({
        items: column.items,
        pivotIndex: index,
        offsetWithinItem,
        pageIndex,
        itemHeight,
      });
    }

    currentTop = nextTop;
  }

  return null;
}

function sampleScrollCanonicalPosition(
  anchorRatio: number,
  source: ScrollCanonicalSamplingSource,
): ReaderLocator | null {
  if (source.scrollReaderChapters.length === 0) {
    return null;
  }

  const normalizedAnchorRatio = clampAnchorRatio(anchorRatio);
  const visibleMarker =
    source.contentElement.scrollTop
    + source.contentElement.clientHeight * normalizedAnchorRatio;
  const initialChapterIndex = source.scrollReaderChapters[0]?.index ?? source.chapterIndex;
  let currentLayout = source.scrollLayouts.get(initialChapterIndex) ?? null;
  let currentBodyElement = source.scrollChapterBodyElements.get(initialChapterIndex) ?? null;
  let currentTop = Number.NEGATIVE_INFINITY;

  for (const renderableChapter of source.scrollReaderChapters) {
    const chapterBodyElement = source.scrollChapterBodyElements.get(renderableChapter.index);
    const chapterLayout = source.scrollLayouts.get(renderableChapter.index);
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

function samplePagedCanonicalPosition(
  anchorRatio: number,
  source: PagedCanonicalSamplingSource,
): ReaderLocator | null {
  const page = source.currentPagedLayout.pageSlices[source.pageIndex];
  if (!page) {
    return null;
  }

  const normalizedAnchorRatio = clampAnchorRatio(anchorRatio);
  const columnCount = Math.max(1, page.columns.length);
  const pageHeight = Math.max(source.currentPagedLayout.pageHeight, 1);
  const totalFlowHeight = columnCount * pageHeight;
  const maxOffset = Math.max(totalFlowHeight - 1, 0);
  const flowOffset = Math.max(
    0,
    Math.min(maxOffset, normalizedAnchorRatio * totalFlowHeight),
  );
  const targetColumnIndex = Math.min(
    columnCount - 1,
    Math.floor(flowOffset / pageHeight),
  );
  const targetColumnOffset = flowOffset - targetColumnIndex * pageHeight;
  const sampled = sampleLocatorFromColumn(
    page.columns[targetColumnIndex],
    targetColumnOffset,
    page.pageIndex,
  );
  if (sampled) {
    return sampled;
  }

  return page.startLocator ?? page.endLocator ?? getPageStartLocator(page);
}

export function sampleCanonicalPosition(
  anchorRatio: number,
  source: CanonicalSamplingSource,
): ReaderLocator | null {
  if (source.mode === 'scroll') {
    return sampleScrollCanonicalPosition(anchorRatio, source.source);
  }

  return samplePagedCanonicalPosition(anchorRatio, source.source);
}

export function resolveCurrentScrollLocator(params: {
  anchorRatio?: number;
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
  ) {
    return null;
  }

  return sampleCanonicalPosition(
    params.anchorRatio ?? SCROLL_READING_ANCHOR_RATIO,
    {
      mode: 'scroll',
      source: {
        chapterIndex: params.chapterIndex,
        contentElement: params.contentElement,
        scrollLayouts: params.scrollLayouts,
        scrollChapterBodyElements: params.scrollChapterBodyElements,
        scrollReaderChapters: params.scrollReaderChapters,
      },
    },
  );
}

export function resolveCurrentPagedLocator(params: {
  anchorRatio?: number;
  currentPagedLayout: ReaderPagedLayout | null;
  isPagedMode: boolean;
  pageIndex: number;
  viewMode: 'original' | 'summary';
}): ReaderLocator | null {
  if (!params.isPagedMode || params.viewMode !== 'original' || !params.currentPagedLayout) {
    return null;
  }

  return sampleCanonicalPosition(
    params.anchorRatio ?? SCROLL_READING_ANCHOR_RATIO,
    {
      mode: 'paged',
      source: {
        currentPagedLayout: params.currentPagedLayout,
        pageIndex: params.pageIndex,
      },
    },
  );
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
  const locatorPageIndex = params.pendingRestoreTarget?.locator?.pageIndex;
  let targetPage = resolvePagedTargetPage(params.pendingPageTarget, params.pageIndex, pageCount);
  if (restoredPageIndex !== null) {
    targetPage = restoredPageIndex;
  } else if (typeof locatorPageIndex === 'number') {
    targetPage = Math.max(0, Math.min(pageCount - 1, locatorPageIndex));
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
