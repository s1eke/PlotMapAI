import { describe, expect, it } from 'vitest';

import type {
  PageSlice,
  ReaderLayoutSignature,
  ReaderMeasuredLine,
  ReaderTextPageItem,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  VirtualBlockMetrics,
} from '../../layout/readerLayoutTypes';
import type { ReaderRenderCacheRecord } from '../../render-cache/readerRenderCacheCore';

import {
  buildNovelFlowIndex,
  createChapterFlowManifestFromRenderCacheRecord,
  createChapterFlowManifestFromScrollTree,
  isChapterFlowManifestCompatible,
  mergeChapterFlowManifests,
  resolveGlobalOffsetPosition,
  resolveGlobalPagePosition,
  resolveLocatorGlobalOffset,
  resolveLocatorGlobalPageIndex,
  toGlobalOffset,
  toGlobalPageIndex,
} from '../novelFlowIndex';

const LAYOUT_SIGNATURE: ReaderLayoutSignature = {
  columnCount: 1,
  columnGap: 0,
  fontSize: 18,
  lineSpacing: 1.8,
  pageHeight: 720,
  paragraphSpacing: 16,
  textWidth: 520,
};

function createMeasuredLine(text: string, lineIndex: number): ReaderMeasuredLine {
  return {
    end: {
      graphemeIndex: lineIndex * 10 + text.length,
      segmentIndex: 0,
    },
    lineIndex,
    start: {
      graphemeIndex: lineIndex * 10,
      segmentIndex: 0,
    },
    text,
    width: text.length * 16,
  };
}

function createTextMetric(params: {
  blockIndex: number;
  chapterIndex: number;
  height: number;
  lineIndex?: number;
  top: number;
}): VirtualBlockMetrics {
  const line = createMeasuredLine(
    `chapter-${params.chapterIndex}-block-${params.blockIndex}`,
    params.lineIndex ?? 0,
  );

  return {
    block: {
      blockIndex: params.blockIndex,
      blockKey: `block-${params.blockIndex}`,
      chapterIndex: params.chapterIndex,
      key: `${params.chapterIndex}:text:${params.blockIndex}`,
      kind: 'text',
      marginAfter: 0,
      marginBefore: 0,
      paragraphIndex: params.blockIndex,
      text: line.text,
    },
    contentHeight: params.height,
    font: '400 16px sans-serif',
    fontSizePx: 16,
    fontWeight: 400,
    height: params.height,
    lineHeightPx: params.height,
    lines: [line],
    marginAfter: 0,
    marginBefore: 0,
    top: params.top,
  };
}

function createScrollTree(
  chapterIndex: number,
  blockHeights: number[],
): StaticScrollChapterTree {
  let top = 0;
  const metrics = blockHeights.map((height, blockIndex) => {
    const metric = createTextMetric({
      blockIndex,
      chapterIndex,
      height,
      lineIndex: blockIndex,
      top,
    });
    top += height;
    return metric;
  });

  return {
    blockCount: metrics.length,
    chapterIndex,
    metrics,
    renderMode: 'rich',
    textWidth: 520,
    totalHeight: top,
  };
}

function createTextPageItem(params: {
  blockIndex: number;
  chapterIndex: number;
  lineIndex?: number;
}): ReaderTextPageItem {
  const lineIndex = params.lineIndex ?? 0;
  const line = createMeasuredLine(
    `chapter-${params.chapterIndex}-page-block-${params.blockIndex}`,
    lineIndex,
  );

  return {
    blockIndex: params.blockIndex,
    blockKey: `block-${params.blockIndex}`,
    chapterIndex: params.chapterIndex,
    contentHeight: 40,
    font: '400 16px sans-serif',
    fontSizePx: 16,
    height: 40,
    key: `${params.chapterIndex}:page-text:${params.blockIndex}`,
    kind: 'text',
    lineHeightPx: 40,
    lineStartIndex: lineIndex,
    lines: [line],
    marginAfter: 0,
    marginBefore: 0,
    text: line.text,
  };
}

function createPageSlice(
  pageIndex: number,
  item: ReaderTextPageItem,
): PageSlice {
  return {
    columnCount: 1,
    columns: [{ height: item.height, items: [item] }],
    endLocator: {
      blockIndex: item.blockIndex,
      blockKey: item.blockKey,
      chapterIndex: item.chapterIndex,
      endCursor: item.lines[0]?.end,
      kind: 'text',
      lineIndex: item.lineStartIndex,
      pageIndex,
      startCursor: item.lines[0]?.start,
    },
    pageIndex,
    startLocator: {
      blockIndex: item.blockIndex,
      blockKey: item.blockKey,
      chapterIndex: item.chapterIndex,
      endCursor: item.lines[0]?.end,
      kind: 'text',
      lineIndex: item.lineStartIndex,
      pageIndex,
      startCursor: item.lines[0]?.start,
    },
  };
}

function createPagedTree(
  chapterIndex: number,
  blockIndices: number[],
): StaticPagedChapterTree {
  return {
    chapterIndex,
    columnCount: 1,
    columnGap: 0,
    columnWidth: 520,
    pageHeight: 720,
    pageSlices: blockIndices.map((blockIndex, pageIndex) => createPageSlice(
      pageIndex,
      createTextPageItem({
        blockIndex,
        chapterIndex,
        lineIndex: blockIndex,
      }),
    )),
  };
}

function createScrollManifest(chapterIndex: number, blockHeights: number[]) {
  return createChapterFlowManifestFromScrollTree({
    contentHash: `content-${chapterIndex}`,
    contentVersion: 1,
    layoutFeatureSet: 'scroll-rich-inline',
    layoutKey: 'scroll-layout',
    layoutSignature: LAYOUT_SIGNATURE,
    rendererVersion: 7,
    tree: createScrollTree(chapterIndex, blockHeights),
  });
}

function createPagedRecord(
  chapterIndex: number,
  blockIndices: number[],
): ReaderRenderCacheRecord {
  const tree = createPagedTree(chapterIndex, blockIndices);

  return {
    chapterIndex,
    contentFormat: 'rich',
    contentHash: `content-${chapterIndex}`,
    contentVersion: 1,
    layoutFeatureSet: 'paged-pagination-block',
    layoutKey: 'paged-layout',
    layoutSignature: LAYOUT_SIGNATURE,
    novelId: 1,
    queryManifest: {
      blockCount: blockIndices.length,
      endLocator: tree.pageSlices[tree.pageSlices.length - 1]?.endLocator ?? null,
      pageCount: tree.pageSlices.length,
      startLocator: tree.pageSlices[0]?.startLocator ?? null,
    },
    rendererVersion: 7,
    storageKind: 'render-tree',
    tree,
    updatedAt: '2026-04-24T00:00:00.000Z',
    variantFamily: 'original-paged',
  };
}

describe('novelFlowIndex', () => {
  it('builds scroll prefix sums across missing chapters and resolves half-open boundaries', () => {
    const firstManifest = createScrollManifest(0, [40, 60]);
    const thirdManifest = createScrollManifest(2, [50]);
    const index = buildNovelFlowIndex({
      chapterCount: 3,
      layoutKey: 'scroll-layout',
      layoutSignature: LAYOUT_SIGNATURE,
      manifests: [firstManifest, thirdManifest],
      novelId: 1,
    });

    expect(index.totalScrollHeight).toBe(150);
    expect(index.chapters.map((chapter) => ({
      chapterIndex: chapter.chapterIndex,
      manifestStatus: chapter.manifestStatus,
      scrollEnd: chapter.scrollEnd,
      scrollStart: chapter.scrollStart,
    }))).toEqual([
      { chapterIndex: 0, manifestStatus: 'materialized', scrollEnd: 100, scrollStart: 0 },
      { chapterIndex: 1, manifestStatus: 'missing', scrollEnd: 100, scrollStart: 100 },
      { chapterIndex: 2, manifestStatus: 'materialized', scrollEnd: 150, scrollStart: 100 },
    ]);
    expect(resolveGlobalOffsetPosition(index, 100)).toMatchObject({
      chapterIndex: 2,
      globalOffset: 100,
      localOffset: 0,
    });
    expect(resolveGlobalOffsetPosition(index, 999)).toMatchObject({
      chapterIndex: 2,
      globalOffset: 150,
      localOffset: 50,
    });
    expect(toGlobalOffset(index, { chapterIndex: 0, localOffset: 999 })).toBe(100);
    expect(toGlobalOffset(index, { chapterIndex: 1, localOffset: 0 })).toBeNull();
  });

  it('builds page prefix sums and returns null for empty page indexes', () => {
    const firstManifest = createChapterFlowManifestFromRenderCacheRecord(
      createPagedRecord(0, [0, 1]),
    );
    const thirdManifest = createChapterFlowManifestFromRenderCacheRecord(
      createPagedRecord(2, [0, 1, 2]),
    );
    const index = buildNovelFlowIndex({
      chapterCount: 3,
      layoutKey: 'paged-layout',
      layoutSignature: LAYOUT_SIGNATURE,
      manifests: [firstManifest, thirdManifest],
      novelId: 1,
    });

    expect(index.totalPageCount).toBe(5);
    expect(resolveGlobalPagePosition(index, 2)).toMatchObject({
      chapterIndex: 2,
      globalPageIndex: 2,
      localPageIndex: 0,
    });
    expect(resolveGlobalPagePosition(index, 999)).toMatchObject({
      chapterIndex: 2,
      globalPageIndex: 4,
      localPageIndex: 2,
    });
    expect(toGlobalPageIndex(index, { chapterIndex: 2, localPageIndex: 99 })).toBe(4);

    const emptyIndex = buildNovelFlowIndex({
      chapterCount: 1,
      layoutKey: 'paged-layout',
      layoutSignature: LAYOUT_SIGNATURE,
      manifests: [],
      novelId: 1,
    });
    expect(resolveGlobalPagePosition(emptyIndex, 0)).toBeNull();
  });

  it('merges scroll and paged manifests while preserving stale status', () => {
    const scrollManifest = createScrollManifest(0, [40, 60]);
    const pagedManifest = createChapterFlowManifestFromRenderCacheRecord(
      createPagedRecord(0, [0, 1, 1]),
      'estimated',
    );
    const merged = mergeChapterFlowManifests(scrollManifest, pagedManifest);

    expect(merged).toMatchObject({
      pageCount: 3,
      scrollHeight: 100,
      status: 'materialized',
    });
    expect(merged?.startLocator).toEqual(scrollManifest.startLocator);
    expect(merged?.blockSummaries.find((summary) => summary.blockIndex === 1)).toMatchObject({
      pageEnd: 3,
      pageStart: 1,
      startOffset: 40,
    });

    expect(mergeChapterFlowManifests(
      scrollManifest,
      { ...pagedManifest!, status: 'stale' },
    )?.status).toBe('stale');
  });

  it('resolves locators to global offsets and pages from chapter boundaries and blocks', () => {
    const scrollManifest = createScrollManifest(1, [40, 60, 30]);
    const pagedManifest = createChapterFlowManifestFromRenderCacheRecord(
      createPagedRecord(1, [0, 1, 2]),
    );
    const merged = mergeChapterFlowManifests(scrollManifest, pagedManifest);
    const index = buildNovelFlowIndex({
      chapterCount: 2,
      layoutKey: 'scroll-layout',
      layoutSignature: LAYOUT_SIGNATURE,
      manifests: [createScrollManifest(0, [25]), merged],
      novelId: 1,
    });
    const secondBlockLocator = merged?.blockSummaries.find((summary) => (
      summary.blockIndex === 1
    ))?.startLocator;

    expect(resolveLocatorGlobalOffset(index, merged?.startLocator)).toBe(25);
    expect(resolveLocatorGlobalOffset(index, merged?.endLocator)).toBe(155);
    expect(resolveLocatorGlobalOffset(index, secondBlockLocator)).toBe(65);
    expect(resolveLocatorGlobalPageIndex(index, merged?.startLocator)).toBe(0);
    expect(resolveLocatorGlobalPageIndex(index, merged?.endLocator)).toBe(2);
    expect(resolveLocatorGlobalPageIndex(index, secondBlockLocator)).toBe(1);
  });

  it('resolves global offsets by locator text quote when block indices drift', () => {
    const manifest = createScrollManifest(1, [40, 60, 30]);
    const index = buildNovelFlowIndex({
      chapterCount: 2,
      layoutKey: 'scroll-layout',
      layoutSignature: LAYOUT_SIGNATURE,
      manifests: [createScrollManifest(0, [25]), manifest],
      novelId: 1,
    });
    const thirdBlockLocator = manifest?.blockSummaries.find((summary) => (
      summary.blockIndex === 2
    ))?.startLocator;
    if (!thirdBlockLocator) {
      throw new Error('Expected third block locator in test manifest.');
    }

    expect(resolveLocatorGlobalOffset(index, {
      ...thirdBlockLocator,
      blockIndex: 0,
    })).toBe(125);
  });

  it('checks manifest compatibility against identity fields', () => {
    const manifest = createScrollManifest(0, [40]);

    expect(isChapterFlowManifestCompatible(manifest, {
      contentHash: 'content-0',
      layoutFeatureSet: 'scroll-rich-inline',
      layoutKey: 'scroll-layout',
      rendererVersion: 7,
    })).toBe(true);
    expect(isChapterFlowManifestCompatible(manifest, { contentHash: 'other' })).toBe(false);
    expect(isChapterFlowManifestCompatible(manifest, { layoutKey: 'other' })).toBe(false);
    expect(isChapterFlowManifestCompatible(manifest, { rendererVersion: 8 })).toBe(false);
    expect(isChapterFlowManifestCompatible(manifest, {
      layoutFeatureSet: 'paged-pagination-block',
    })).toBe(false);
    expect(isChapterFlowManifestCompatible({ ...manifest, status: 'stale' }, {
      contentHash: 'content-0',
    })).toBe(false);
  });
});
