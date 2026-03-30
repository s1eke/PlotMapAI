import { describe, expect, it } from 'vitest';

import {
  getEffectivePagedRenderPageIndex,
  shouldClearPendingCommittedPageOverride,
} from '../pagedDragRenderState';

function createLayout(chapterIndex: number, pageCount: number) {
  return {
    chapterIndex,
    columnCount: 1,
    columnGap: 0,
    columnWidth: 320,
    pageHeight: 640,
    pageSlices: Array.from({ length: pageCount }, (_, pageIndex) => ({
      chapterIndex,
      columnCount: 1,
      columns: [{ height: 0, items: [] }],
      endLocator: null,
      pageIndex,
      startLocator: null,
    })),
  };
}

describe('pagedDragRenderState', () => {
  it('uses the committed drag target page while the new chapter is visible but parent pageIndex is still stale', () => {
    const layout = createLayout(2, 5);

    expect(getEffectivePagedRenderPageIndex({
      currentChapterIndex: 2,
      currentLayout: layout,
      pageIndex: 4,
      pendingOverride: {
        chapterIndex: 2,
        pageIndex: 0,
      },
    })).toBe(0);
  });

  it('falls back to the parent pageIndex when the committed drag target chapter is not active', () => {
    const layout = createLayout(1, 5);

    expect(getEffectivePagedRenderPageIndex({
      currentChapterIndex: 1,
      currentLayout: layout,
      pageIndex: 3,
      pendingOverride: {
        chapterIndex: 2,
        pageIndex: 0,
      },
    })).toBe(3);
  });

  it('uses the pending page target when a cross-chapter render should land on the last page', () => {
    const layout = createLayout(2, 5);

    expect(getEffectivePagedRenderPageIndex({
      currentChapterIndex: 2,
      currentLayout: layout,
      pageIndex: 0,
      pendingPageTarget: 'end',
      pendingOverride: null,
    })).toBe(4);
  });

  it('clears the override once parent pageIndex catches up to the committed target', () => {
    const layout = createLayout(2, 5);

    expect(shouldClearPendingCommittedPageOverride({
      currentChapterIndex: 2,
      currentLayout: layout,
      pageIndex: 0,
      pendingOverride: {
        chapterIndex: 2,
        pageIndex: 0,
      },
    })).toBe(true);

    expect(shouldClearPendingCommittedPageOverride({
      currentChapterIndex: 2,
      currentLayout: layout,
      pageIndex: 3,
      pendingOverride: {
        chapterIndex: 2,
        pageIndex: 0,
      },
    })).toBe(false);
  });
});
