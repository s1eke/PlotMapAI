import type {
  PageSlice,
  ReaderLocator,
  ReaderPageItem,
  VirtualBlockMetrics,
} from './readerLayoutTypes';

export function areLayoutCursorsEquivalent(
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

export function areLocatorsEquivalent(
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

export function pageContainsLocator(
  page: PageSlice | null | undefined,
  locator: ReaderLocator,
): boolean {
  if (!page) {
    return false;
  }

  for (const column of page.columns) {
    for (const item of column.items) {
      if (item.chapterIndex !== locator.chapterIndex || item.blockIndex !== locator.blockIndex) {
        continue;
      }

      if (item.kind === 'image' && locator.kind === 'image') {
        return true;
      }

      if ((item.kind === 'heading' || item.kind === 'text') && locator.kind === item.kind) {
        const lineIndex = locator.lineIndex ?? 0;
        const startLineIndex = item.lineStartIndex;
        const endLineIndex = item.lineStartIndex + item.lines.length;
        if (lineIndex >= startLineIndex && lineIndex < endLineIndex) {
          return true;
        }
      }
    }
  }

  return false;
}

export function findFirstVisibleMetricIndex(
  metrics: VirtualBlockMetrics[],
  viewportStart: number,
): number {
  let low = 0;
  let high = metrics.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const metric = metrics[mid];
    if (metric.top + metric.height > viewportStart) {
      result = mid;
      high = mid - 1;
      continue;
    }
    low = mid + 1;
  }

  return result;
}

export function findLastVisibleMetricIndex(
  metrics: VirtualBlockMetrics[],
  viewportEnd: number,
): number {
  let low = 0;
  let high = metrics.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const metric = metrics[mid];
    if (metric.top < viewportEnd) {
      result = mid;
      low = mid + 1;
      continue;
    }
    high = mid - 1;
  }

  return result;
}

export function findNearestMeaningfulMetric(
  metrics: VirtualBlockMetrics[],
  blockIndex: number,
): VirtualBlockMetrics | null {
  for (let index = blockIndex; index >= 0; index -= 1) {
    const metric = metrics[index];
    if (metric && metric.block.kind !== 'blank') {
      return metric;
    }
  }

  for (let index = blockIndex + 1; index < metrics.length; index += 1) {
    const metric = metrics[index];
    if (metric.block.kind !== 'blank') {
      return metric;
    }
  }

  return null;
}

export function findBoundaryMetric(
  metrics: VirtualBlockMetrics[],
  edge: 'start' | 'end',
): VirtualBlockMetrics | null {
  if (edge === 'start') {
    for (const metric of metrics) {
      if (metric.block.kind !== 'blank') {
        return metric;
      }
    }
    return null;
  }

  for (let index = metrics.length - 1; index >= 0; index -= 1) {
    const metric = metrics[index];
    if (metric.block.kind !== 'blank') {
      return metric;
    }
  }

  return null;
}

export type ReaderLocatorPageItem = ReaderPageItem;
