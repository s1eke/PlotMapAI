import type {
  MeasuredChapterLayout,
  PageSlice,
  PaginatedChapterLayout,
  ReaderLocator,
  ReaderPageItem,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  VirtualBlockMetrics,
  VisibleBlockRange,
} from '../layout/readerLayoutTypes';
import {
  areLocatorsEquivalent,
  findBoundaryMetric,
  findFirstVisibleMetricIndex,
  findLastVisibleMetricIndex,
  findNearestMeaningfulMetric,
  pageContainsLocator,
} from './readerLocatorHelpers';

export function createMetricStartLocator(metric: VirtualBlockMetrics): ReaderLocator | null {
  if (metric.block.kind === 'blank') {
    return null;
  }

  if (metric.block.kind === 'image') {
    return {
      blockIndex: metric.block.blockIndex,
      chapterIndex: metric.block.chapterIndex,
      edge: 'start',
      kind: 'image',
    };
  }

  const line = metric.lines[0];
  return {
    blockIndex: metric.block.blockIndex,
    chapterIndex: metric.block.chapterIndex,
    endCursor: line?.end,
    kind: metric.block.kind,
    lineIndex: 0,
    startCursor: line?.start,
  };
}

export function createMetricEndLocator(metric: VirtualBlockMetrics): ReaderLocator | null {
  if (metric.block.kind === 'blank') {
    return null;
  }

  if (metric.block.kind === 'image') {
    return {
      blockIndex: metric.block.blockIndex,
      chapterIndex: metric.block.chapterIndex,
      edge: 'end',
      kind: 'image',
    };
  }

  const line = metric.lines[metric.lines.length - 1];
  return {
    blockIndex: metric.block.blockIndex,
    chapterIndex: metric.block.chapterIndex,
    endCursor: line?.end,
    kind: metric.block.kind,
    lineIndex: Math.max(0, metric.lines.length - 1),
    startCursor: line?.start,
  };
}

export function getItemStartLocator(
  item: ReaderPageItem,
  pageIndex?: number,
): ReaderLocator | null {
  if (item.kind === 'image') {
    return {
      blockIndex: item.blockIndex,
      chapterIndex: item.chapterIndex,
      edge: 'start',
      kind: 'image',
      pageIndex,
    };
  }

  if (item.kind === 'blank') {
    return null;
  }

  const line = item.lines[0];
  return {
    blockIndex: item.blockIndex,
    chapterIndex: item.chapterIndex,
    endCursor: line?.end,
    kind: item.kind,
    lineIndex: item.lineStartIndex,
    pageIndex,
    startCursor: line?.start,
  };
}

export function getItemEndLocator(
  item: ReaderPageItem,
  pageIndex?: number,
): ReaderLocator | null {
  if (item.kind === 'image') {
    return {
      blockIndex: item.blockIndex,
      chapterIndex: item.chapterIndex,
      edge: 'end',
      kind: 'image',
      pageIndex,
    };
  }

  if (item.kind === 'blank') {
    return null;
  }

  const line = item.lines[item.lines.length - 1];
  return {
    blockIndex: item.blockIndex,
    chapterIndex: item.chapterIndex,
    endCursor: line?.end,
    kind: item.kind,
    lineIndex: item.lineStartIndex + Math.max(0, item.lines.length - 1),
    pageIndex,
    startCursor: line?.start,
  };
}

export function findPageIndexForLocator(
  paginatedLayout: PaginatedChapterLayout | null | undefined,
  locator: ReaderLocator | null | undefined,
): number | null {
  if (!paginatedLayout || !locator) {
    return null;
  }

  if (typeof locator.pageIndex === 'number') {
    const directPage = paginatedLayout.pageSlices[locator.pageIndex];
    if (directPage && pageContainsLocator(directPage, locator)) {
      return directPage.pageIndex;
    }
  }

  for (const page of paginatedLayout.pageSlices) {
    if (areLocatorsEquivalent(page.startLocator, locator)) {
      return page.pageIndex;
    }
  }

  for (const page of paginatedLayout.pageSlices) {
    if (pageContainsLocator(page, locator)) {
      return page.pageIndex;
    }
  }

  return null;
}

export function findVisibleBlockRange(
  layout: MeasuredChapterLayout,
  offsetTop: number,
  viewportHeight: number,
  overscanPx: number,
): VisibleBlockRange {
  if (layout.metrics.length === 0) {
    return {
      endIndex: -1,
      startIndex: 0,
    };
  }

  const viewportStart = offsetTop - overscanPx;
  const viewportEnd = offsetTop + viewportHeight + overscanPx;
  if (viewportEnd <= 0 || viewportStart >= layout.totalHeight) {
    return {
      endIndex: -1,
      startIndex: 0,
    };
  }

  const clampedViewportStart = Math.max(0, viewportStart);
  const clampedViewportEnd = Math.min(layout.totalHeight, viewportEnd);
  if (clampedViewportEnd <= clampedViewportStart) {
    return {
      endIndex: -1,
      startIndex: 0,
    };
  }

  const startIndex = findFirstVisibleMetricIndex(layout.metrics, clampedViewportStart);
  const endIndex = findLastVisibleMetricIndex(layout.metrics, clampedViewportEnd);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return {
      endIndex: -1,
      startIndex: 0,
    };
  }

  return {
    endIndex,
    startIndex,
  };
}

export function findLocatorForLayoutOffset(
  layout: MeasuredChapterLayout,
  offsetTop: number,
): ReaderLocator | null {
  if (layout.metrics.length === 0) {
    return null;
  }

  const clampedOffset = Math.max(0, Math.min(offsetTop, Math.max(layout.totalHeight - 1, 0)));
  let matchedMetric = layout.metrics[layout.metrics.length - 1];
  for (const metric of layout.metrics) {
    if (clampedOffset < metric.top + metric.height) {
      matchedMetric = metric;
      break;
    }
  }

  if (matchedMetric.block.kind === 'blank') {
    const meaningfulMetric = findNearestMeaningfulMetric(
      layout.metrics,
      matchedMetric.block.blockIndex,
    );
    if (!meaningfulMetric) {
      return null;
    }
    matchedMetric = meaningfulMetric;
  }

  if (matchedMetric.block.kind === 'image') {
    return {
      blockIndex: matchedMetric.block.blockIndex,
      chapterIndex: matchedMetric.block.chapterIndex,
      edge: clampedOffset - matchedMetric.top > matchedMetric.height / 2 ? 'end' : 'start',
      kind: 'image',
    };
  }

  if (matchedMetric.block.kind !== 'heading' && matchedMetric.block.kind !== 'text') {
    return null;
  }

  const lineIndex = matchedMetric.lines.length === 0
    ? 0
    : Math.max(
      0,
      Math.min(
        matchedMetric.lines.length - 1,
        Math.floor(
          Math.max(
            0,
            clampedOffset - matchedMetric.top - matchedMetric.marginBefore,
          ) / matchedMetric.lineHeightPx,
        ),
      ),
    );
  const line = matchedMetric.lines[lineIndex];
  return {
    blockIndex: matchedMetric.block.blockIndex,
    chapterIndex: matchedMetric.block.chapterIndex,
    endCursor: line?.end,
    kind: matchedMetric.block.kind,
    lineIndex,
    startCursor: line?.start,
  };
}

export function getOffsetForLocator(
  layout: MeasuredChapterLayout,
  locator: ReaderLocator | null | undefined,
): number | null {
  if (!locator) {
    return null;
  }

  const metric = layout.metrics.find(
    (candidate) => candidate.block.blockIndex === locator.blockIndex,
  );
  if (!metric) {
    return null;
  }

  if (metric.block.kind === 'image') {
    return metric.top + (locator.edge === 'end' ? metric.height : metric.marginBefore);
  }

  if (metric.block.kind === 'blank') {
    return metric.top;
  }

  const lineIndex = Math.max(
    0,
    Math.min(locator.lineIndex ?? 0, Math.max(metric.lines.length - 1, 0)),
  );
  return metric.top + metric.marginBefore + lineIndex * metric.lineHeightPx;
}

export function getPageStartLocator(page: PageSlice | null | undefined): ReaderLocator | null {
  return page?.startLocator ?? null;
}

export function getChapterBoundaryLocator(
  layout: MeasuredChapterLayout | PaginatedChapterLayout | null | undefined,
  edge: 'start' | 'end',
): ReaderLocator | null {
  if (!layout) {
    return null;
  }

  if ('metrics' in layout) {
    const boundaryMetric = findBoundaryMetric(layout.metrics, edge);
    if (!boundaryMetric) {
      return null;
    }

    return edge === 'start'
      ? createMetricStartLocator(boundaryMetric)
      : createMetricEndLocator(boundaryMetric);
  }

  if (layout.pageSlices.length === 0) {
    return null;
  }

  const page = edge === 'start'
    ? layout.pageSlices[0]
    : layout.pageSlices[layout.pageSlices.length - 1];

  return edge === 'start'
    ? page.startLocator ?? page.endLocator ?? null
    : page.endLocator ?? page.startLocator ?? null;
}

export function getChapterStartLocator(
  layout: MeasuredChapterLayout | PaginatedChapterLayout | null | undefined,
): ReaderLocator | null {
  return getChapterBoundaryLocator(layout, 'start');
}

export function getChapterEndLocator(
  layout: MeasuredChapterLayout | PaginatedChapterLayout | null | undefined,
): ReaderLocator | null {
  return getChapterBoundaryLocator(layout, 'end');
}

export function getPageStartLocatorFromStaticTree(
  pagedTree: StaticPagedChapterTree | null | undefined,
  pageIndex: number,
): ReaderLocator | null {
  return getPageStartLocator(pagedTree?.pageSlices[pageIndex]);
}

export function findPageIndexForLocatorInStaticTree(
  pagedTree: StaticPagedChapterTree | null | undefined,
  locator: ReaderLocator | null | undefined,
): number | null {
  return findPageIndexForLocator(pagedTree, locator);
}

export function getOffsetForLocatorInStaticTree(
  scrollTree: StaticScrollChapterTree,
  locator: ReaderLocator | null | undefined,
): number | null {
  return getOffsetForLocator(scrollTree, locator);
}
