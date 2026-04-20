import type { RefObject } from 'react';
import type { ChapterContent } from '@shared/contracts/reader';
import type {
  ReaderLocator,
  ReaderMeasuredLine,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  StaticSummaryShellTree,
  VirtualBlockMetrics,
} from '../utils/layout/readerLayout';

import { buildChapterBlockSequence } from '@shared/text-processing';

import {
  createReaderTypographyMetrics,
  createReaderViewportMetrics,
  type ReaderViewportMetrics,
} from '../utils/layout/readerLayout';

interface DeterministicReaderRenderCacheParams {
  contentRef: RefObject<HTMLDivElement | null>;
  currentChapter: ChapterContent | null;
  fontSize: number;
  lineSpacing: number;
  pagedChapters: ChapterContent[];
  pagedViewportElement: HTMLDivElement | null;
  paragraphSpacing: number;
  scrollChapters: Array<{ chapter: ChapterContent; index: number }>;
}

const DEFAULT_SCROLL_VIEWPORT_WIDTH = 1024;
const DEFAULT_SCROLL_VIEWPORT_HEIGHT = 800;
const DEFAULT_PAGED_VIEWPORT_WIDTH = 600;
const DEFAULT_PAGED_VIEWPORT_HEIGHT = 800;
const SCROLL_BLOCK_HEIGHT = 72;
const IMAGE_BLOCK_HEIGHT = 220;
const BLOCK_MARGIN_BEFORE = 8;
const BLOCK_MARGIN_AFTER = 16;
const PAGED_BLOCKS_PER_PAGE = 2;

function createTextLines(text: string): ReaderMeasuredLine[] {
  return [{
    lineIndex: 0,
    text,
  }] as unknown as ReaderMeasuredLine[];
}

function createTextLocator(
  chapterIndex: number,
  blockIndex: number,
): ReaderLocator {
  return {
    blockIndex,
    chapterIndex,
    kind: 'text',
    lineIndex: 0,
  };
}

function toChapterBlockSource(chapter: ChapterContent) {
  return {
    content: chapter.plainText,
    index: chapter.index,
    title: chapter.title,
  };
}

function createScrollMetric(
  chapter: ChapterContent,
  block: ReturnType<typeof buildChapterBlockSequence>[number],
  top: number,
): VirtualBlockMetrics | null {
  const key = `${chapter.index}:${block.blockIndex}`;

  if (block.kind === 'blank') {
    return null;
  }

  if (block.kind === 'image') {
    return {
      block: {
        blockIndex: block.blockIndex,
        chapterIndex: chapter.index,
        imageKey: block.imageKey,
        key,
        kind: 'image',
        marginAfter: BLOCK_MARGIN_AFTER,
        marginBefore: BLOCK_MARGIN_BEFORE,
        paragraphIndex: block.paragraphIndex,
      },
      contentHeight: IMAGE_BLOCK_HEIGHT,
      displayHeight: 180,
      displayWidth: 320,
      font: 'Stub Image',
      fontSizePx: 18,
      fontWeight: 400,
      height: IMAGE_BLOCK_HEIGHT,
      lineHeightPx: 24,
      lines: [],
      marginAfter: BLOCK_MARGIN_AFTER,
      marginBefore: BLOCK_MARGIN_BEFORE,
      top,
    };
  }

  return {
    block: {
      blockIndex: block.blockIndex,
      chapterIndex: chapter.index,
      key,
      kind: 'text',
      marginAfter: block.hasParagraphSpacingAfter ? BLOCK_MARGIN_AFTER : 0,
      marginBefore: BLOCK_MARGIN_BEFORE,
      paragraphIndex: block.paragraphIndex,
      text: block.text,
    },
    contentHeight: SCROLL_BLOCK_HEIGHT,
    font: 'Stub Sans',
    fontSizePx: 18,
    fontWeight: 400,
    height: SCROLL_BLOCK_HEIGHT,
    lineHeightPx: 28,
    lines: createTextLines(block.text),
    marginAfter: block.hasParagraphSpacingAfter ? BLOCK_MARGIN_AFTER : 0,
    marginBefore: BLOCK_MARGIN_BEFORE,
    top,
  };
}

export function createDeterministicScrollLayout(
  chapter: ChapterContent,
): StaticScrollChapterTree {
  const metrics: VirtualBlockMetrics[] = [];
  let top = 0;

  for (const block of buildChapterBlockSequence(toChapterBlockSource(chapter))) {
    const metric = createScrollMetric(chapter, block, top);
    if (!metric) {
      top += BLOCK_MARGIN_AFTER;
      continue;
    }
    metrics.push(metric);
    top += metric.height + metric.marginBefore + metric.marginAfter;
  }

  return {
    blockCount: metrics.length,
    chapterIndex: chapter.index,
    metrics,
    renderMode: 'plain',
    textWidth: 640,
    totalHeight: Math.max(top, DEFAULT_SCROLL_VIEWPORT_HEIGHT),
  };
}

export function createDeterministicPagedLayout(
  chapter: ChapterContent,
): StaticPagedChapterTree {
  const pageItems = buildChapterBlockSequence(toChapterBlockSource(chapter))
    .filter((block) => block.kind !== 'blank')
    .map((block) => {
      const key = `${chapter.index}:${block.blockIndex}`;
      if (block.kind === 'image') {
        return {
          blockIndex: block.blockIndex,
          chapterIndex: chapter.index,
          displayHeight: 180,
          displayWidth: 320,
          edge: 'start' as const,
          height: IMAGE_BLOCK_HEIGHT,
          imageKey: block.imageKey,
          key,
          kind: 'image' as const,
          marginAfter: BLOCK_MARGIN_AFTER,
          marginBefore: BLOCK_MARGIN_BEFORE,
        };
      }

      return {
        blockIndex: block.blockIndex,
        chapterIndex: chapter.index,
        contentHeight: SCROLL_BLOCK_HEIGHT,
        font: 'Stub Sans',
        fontSizePx: 18,
        height: SCROLL_BLOCK_HEIGHT,
        key,
        kind: 'text' as const,
        lineHeightPx: 28,
        lineStartIndex: 0,
        lines: createTextLines(block.text),
        marginAfter: block.hasParagraphSpacingAfter ? BLOCK_MARGIN_AFTER : 0,
        marginBefore: BLOCK_MARGIN_BEFORE,
        text: block.text,
      };
    });
  const pageSlices = pageItems.length === 0
    ? [{
      columnCount: 1,
      columns: [{
        height: DEFAULT_PAGED_VIEWPORT_HEIGHT,
        items: [],
      }],
      endLocator: null,
      pageIndex: 0,
      startLocator: null,
    }]
    : Array.from({
      length: Math.ceil(pageItems.length / PAGED_BLOCKS_PER_PAGE),
    }, (_, pageIndex) => {
      const items = pageItems.slice(
        pageIndex * PAGED_BLOCKS_PER_PAGE,
        (pageIndex + 1) * PAGED_BLOCKS_PER_PAGE,
      );
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      return {
        columnCount: 1,
        columns: [{
          height: DEFAULT_PAGED_VIEWPORT_HEIGHT,
          items,
        }],
        endLocator: lastItem ? createTextLocator(chapter.index, lastItem.blockIndex) : null,
        pageIndex,
        startLocator: firstItem ? createTextLocator(chapter.index, firstItem.blockIndex) : null,
      };
    });

  return {
    chapterIndex: chapter.index,
    columnCount: 1,
    columnGap: 0,
    columnWidth: 520,
    pageHeight: 700,
    pageSlices,
  };
}

export function createDeterministicSummaryShell(
  chapter: ChapterContent,
): StaticSummaryShellTree {
  return {
    chapterIndex: chapter.index,
    title: chapter.title,
    variant: 'summary-shell',
  };
}

function readViewportMetrics(
  params: DeterministicReaderRenderCacheParams,
): ReaderViewportMetrics {
  return createReaderViewportMetrics(
    params.contentRef.current?.clientWidth || DEFAULT_SCROLL_VIEWPORT_WIDTH,
    params.contentRef.current?.clientHeight || DEFAULT_SCROLL_VIEWPORT_HEIGHT,
    params.pagedViewportElement?.clientWidth || DEFAULT_PAGED_VIEWPORT_WIDTH,
    params.pagedViewportElement?.clientHeight || DEFAULT_PAGED_VIEWPORT_HEIGHT,
    params.fontSize,
  );
}

export function useDeterministicReaderRenderCache(
  params: DeterministicReaderRenderCacheParams,
) {
  const viewportMetrics = readViewportMetrics(params);
  const typography = createReaderTypographyMetrics(
    params.fontSize,
    params.lineSpacing,
    params.paragraphSpacing,
    viewportMetrics.pagedViewportWidth || viewportMetrics.scrollViewportWidth,
  );
  const pagedLayouts = new Map(
    params.pagedChapters.map((chapter) => [
      chapter.index,
      createDeterministicPagedLayout(chapter),
    ]),
  );
  const scrollLayouts = new Map(
    params.scrollChapters.map(({ chapter, index }) => [
      index,
      createDeterministicScrollLayout(chapter),
    ]),
  );
  const summaryShells = new Map(
    params.currentChapter
      ? [[params.currentChapter.index, createDeterministicSummaryShell(params.currentChapter)]]
      : [],
  );

  return {
    pagedLayouts,
    scrollLayouts,
    summaryShells,
    typography,
    viewportMetrics,
    cacheSourceByKey: new Map(),
    isPreheating: false,
    pendingPreheatCount: 0,
  };
}
