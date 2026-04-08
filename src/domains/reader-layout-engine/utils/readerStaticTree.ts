import type { ChapterContent } from '@shared/contracts/reader';
import type { ReaderImageDimensions } from '@domains/reader-media';
import type { ReaderTextLayoutEngine } from './readerTextMeasurement';
import type {
  MeasuredChapterLayout,
  PageSlice,
  PaginatedChapterLayout,
  ReaderImageLayoutConstraints,
  ReaderTypographyMetrics,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  StaticSummaryShellTree,
  VirtualBlockMetrics,
} from './readerLayoutTypes';

import { PAGED_VIEWPORT_TOP_PADDING_PX } from './readerLayoutTypes';
import {
  getItemEndLocator,
  getItemStartLocator,
} from './readerLocator';
import {
  measurePagedReaderChapterLayout,
  measureScrollReaderChapterLayout,
} from './readerChapterMeasurement';
import { createRichLineFragments } from './richLineFragments';

export function getPagedContentHeight(pagedViewportHeight: number): number {
  return Math.max(0, pagedViewportHeight - PAGED_VIEWPORT_TOP_PADDING_PX);
}

export function createScrollImageLayoutConstraints(
  scrollTextWidth: number,
  scrollViewportHeight: number,
): ReaderImageLayoutConstraints {
  return {
    maxImageHeight: getPagedContentHeight(scrollViewportHeight),
    maxImageWidth: Math.max(0, scrollTextWidth),
  };
}

export function buildStaticScrollChapterTree(
  chapter: ChapterContent,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  imageLayoutConstraints?: ReaderImageLayoutConstraints,
  textLayoutEngine?: ReaderTextLayoutEngine,
  preferRichScrollRendering = true,
): StaticScrollChapterTree {
  return measureScrollReaderChapterLayout(
    chapter,
    width,
    typography,
    imageDimensionsByKey,
    imageLayoutConstraints,
    textLayoutEngine,
    preferRichScrollRendering,
  );
}

function createPageSlice(pageIndex: number, columnCount: number): PageSlice {
  return {
    columnCount,
    columns: Array.from({ length: columnCount }, () => ({ height: 0, items: [] })),
    endLocator: null,
    pageIndex,
    startLocator: null,
  };
}

function finalizePageLocators(page: PageSlice): void {
  const pageSlice = page;
  let startLocator = null;
  let endLocator = null;

  for (const column of pageSlice.columns) {
    for (const item of column.items) {
      if (!startLocator) {
        startLocator = getItemStartLocator(item, pageSlice.pageIndex);
      }
      endLocator = getItemEndLocator(item, pageSlice.pageIndex);
    }
  }

  pageSlice.startLocator = startLocator;
  pageSlice.endLocator = endLocator;
}

function findNextMeaningfulMetricAfter(
  metrics: VirtualBlockMetrics[],
  startIndex: number,
): VirtualBlockMetrics | null {
  for (let index = startIndex; index < metrics.length; index += 1) {
    const metric = metrics[index];
    if (metric && metric.block.kind !== 'blank') {
      return metric;
    }
  }

  return null;
}

function getMinimumRenderableHeight(
  metric: VirtualBlockMetrics,
  pageHeight: number,
): number {
  if (metric.block.kind === 'image') {
    const captionHeight = metric.captionHeight ?? 0;
    const captionSpacing = captionHeight > 0 ? (metric.captionSpacing ?? 0) : 0;
    const displayHeight = metric.displayHeight ?? metric.contentHeight;
    const maxImageHeight = pageHeight
      - metric.marginBefore
      - metric.marginAfter
      - captionSpacing
      - captionHeight;
    const resolvedDisplayHeight = displayHeight > maxImageHeight && maxImageHeight > 0
      ? maxImageHeight
      : displayHeight;
    return metric.marginBefore + resolvedDisplayHeight + captionSpacing + captionHeight;
  }

  if (metric.block.kind === 'text' && metric.block.renderRole === 'table') {
    return metric.marginBefore + metric.contentHeight;
  }

  return metric.marginBefore + metric.lineHeightPx;
}

export function composePaginatedChapterLayout(
  measuredLayout: MeasuredChapterLayout,
  columnHeight: number,
  columnCount: number,
  columnGap: number,
): PaginatedChapterLayout {
  const safeColumnCount = Math.max(columnCount, 1);
  const safeColumnHeight = Math.max(columnHeight, 1);
  const pages: PageSlice[] = [];
  let currentPage = createPageSlice(pages.length, safeColumnCount);
  let currentColumnIndex = 0;
  let currentColumnHeight = 0;

  const getCurrentColumn = () => currentPage.columns[currentColumnIndex];
  const advanceColumn = () => {
    currentColumnIndex += 1;
    currentColumnHeight = 0;
    if (currentColumnIndex < safeColumnCount) {
      return;
    }

    finalizePageLocators(currentPage);
    pages.push(currentPage);
    currentPage = createPageSlice(pages.length, safeColumnCount);
    currentColumnIndex = 0;
  };

  const ensureRoom = (minimumHeight: number): void => {
    if (currentColumnHeight === 0) {
      return;
    }
    if (currentColumnHeight + minimumHeight <= safeColumnHeight + 0.5) {
      return;
    }
    advanceColumn();
  };

  for (let metricIndex = 0; metricIndex < measuredLayout.metrics.length; metricIndex += 1) {
    const metric = measuredLayout.metrics[metricIndex];
    const nextMeaningfulMetric = findNextMeaningfulMetricAfter(
      measuredLayout.metrics,
      metricIndex + 1,
    );

    if (metric.block.kind === 'blank') {
      const remainingHeight = safeColumnHeight - currentColumnHeight;
      const nextMinimumHeight = nextMeaningfulMetric
        ? getMinimumRenderableHeight(nextMeaningfulMetric, safeColumnHeight)
        : null;
      const shouldSkipBlankSpacer = currentColumnHeight === 0
        || metric.height > remainingHeight + 0.5
        || (
          nextMinimumHeight !== null
          && remainingHeight + 0.5 >= nextMinimumHeight
          && metric.height + nextMinimumHeight > remainingHeight + 0.5
        );
      if (shouldSkipBlankSpacer) {
        continue;
      }

      const blankHeight = currentColumnHeight === 0
        ? Math.min(metric.height, safeColumnHeight)
        : metric.height;
      const blankItem = {
        blockIndex: metric.block.blockIndex,
        chapterIndex: metric.block.chapterIndex,
        height: blankHeight,
        key: `${metric.block.key}:blank`,
        kind: 'blank' as const,
      };
      getCurrentColumn().items.push(blankItem);
      getCurrentColumn().height += blankHeight;
      currentColumnHeight += blankHeight;
      continue;
    }

    if (metric.block.kind === 'image') {
      const captionHeight = metric.captionHeight ?? 0;
      const captionSpacing = captionHeight > 0 ? (metric.captionSpacing ?? 0) : 0;
      let displayHeight = metric.displayHeight ?? metric.contentHeight;
      let displayWidth = metric.displayWidth ?? measuredLayout.textWidth;
      const maxImageHeight = safeColumnHeight
        - metric.marginBefore
        - metric.marginAfter
        - captionSpacing
        - captionHeight;
      if (displayHeight > maxImageHeight && maxImageHeight > 0) {
        const scale = maxImageHeight / displayHeight;
        displayHeight *= scale;
        displayWidth *= scale;
      }
      const imageContentHeight =
        metric.marginBefore
        + displayHeight
        + captionSpacing
        + captionHeight;
      ensureRoom(imageContentHeight);
      let remainingHeight = safeColumnHeight - currentColumnHeight;
      if (remainingHeight <= 0) {
        advanceColumn();
        remainingHeight = safeColumnHeight;
      }

      let { marginAfter } = metric;
      const nextMinimumHeight = nextMeaningfulMetric
        ? getMinimumRenderableHeight(nextMeaningfulMetric, safeColumnHeight)
        : null;
      if (
        marginAfter > 0
        && (
          imageContentHeight + marginAfter > remainingHeight + 0.5
          || (
            nextMinimumHeight !== null
            && remainingHeight + 0.5 >= imageContentHeight + nextMinimumHeight
            && imageContentHeight + marginAfter + nextMinimumHeight > remainingHeight + 0.5
          )
        )
      ) {
        marginAfter = 0;
      }

      const imageHeight = imageContentHeight + marginAfter;
      const item = {
        align: metric.block.align,
        anchorId: metric.block.anchorId,
        blockIndex: metric.block.blockIndex,
        captionFont: metric.captionFont,
        captionFontSizePx: metric.captionFontSizePx,
        captionHeight,
        captionLineHeightPx: metric.captionLineHeightPx,
        captionLines: metric.captionLines,
        captionRichLineFragments: metric.captionRichLineFragments,
        captionSpacing,
        chapterIndex: metric.block.chapterIndex,
        displayHeight,
        displayWidth,
        edge: 'start' as const,
        height: imageHeight,
        imageKey: metric.block.imageKey ?? '',
        key: `${metric.block.key}:image`,
        kind: 'image' as const,
        marginAfter,
        marginBefore: metric.marginBefore,
        sourceBlockType: metric.block.sourceBlockType,
      };
      getCurrentColumn().items.push(item);
      getCurrentColumn().height += imageHeight;
      currentColumnHeight += imageHeight;
      continue;
    }

    if (metric.block.kind === 'text' && metric.block.renderRole === 'table') {
      const tableContentHeight = metric.marginBefore + metric.contentHeight;
      ensureRoom(tableContentHeight);
      let remainingHeight = safeColumnHeight - currentColumnHeight;
      if (remainingHeight <= 0) {
        advanceColumn();
        remainingHeight = safeColumnHeight;
      }

      let { marginAfter } = metric;
      const nextMinimumHeight = nextMeaningfulMetric
        ? getMinimumRenderableHeight(nextMeaningfulMetric, safeColumnHeight)
        : null;
      if (
        marginAfter > 0
        && (
          tableContentHeight + marginAfter > remainingHeight + 0.5
          || (
            nextMinimumHeight !== null
            && remainingHeight + 0.5 >= tableContentHeight + nextMinimumHeight
            && tableContentHeight + marginAfter + nextMinimumHeight > remainingHeight + 0.5
          )
        )
      ) {
        marginAfter = 0;
      }

      if (tableContentHeight + marginAfter > remainingHeight + 0.5 && currentColumnHeight > 0) {
        advanceColumn();
        continue;
      }

      const item = {
        align: metric.block.align,
        anchorId: metric.block.anchorId,
        blockquoteDepth: metric.block.blockquoteDepth,
        blockIndex: metric.block.blockIndex,
        chapterIndex: metric.block.chapterIndex,
        container: metric.block.container,
        contentHeight: metric.contentHeight,
        font: metric.font,
        fontSizePx: metric.fontSizePx,
        height: tableContentHeight + marginAfter,
        key: `${metric.block.key}:table`,
        kind: 'text' as const,
        lineHeightPx: metric.lineHeightPx,
        lineStartIndex: 0,
        lines: [],
        listContext: metric.block.listContext,
        marginAfter,
        marginBefore: metric.marginBefore,
        renderRole: 'table' as const,
        showListMarker: metric.block.showListMarker,
        sourceBlockType: metric.block.sourceBlockType,
        tableRowHeights: metric.tableRowHeights,
        tableRows: metric.block.tableRows,
        text: metric.block.text ?? '',
      };
      getCurrentColumn().items.push(item);
      getCurrentColumn().height += item.height;
      currentColumnHeight += item.height;
      continue;
    }

    let lineIndex = 0;
    while (lineIndex < metric.lines.length) {
      const marginBefore = lineIndex === 0 ? metric.marginBefore : 0;
      ensureRoom(marginBefore + metric.lineHeightPx);
      let remainingHeight = safeColumnHeight - currentColumnHeight;
      if (remainingHeight <= 0) {
        advanceColumn();
        remainingHeight = safeColumnHeight;
      }

      const availableLineHeight = remainingHeight - marginBefore;
      let lineCount = Math.max(1, Math.floor(availableLineHeight / metric.lineHeightPx));
      lineCount = Math.min(lineCount, metric.lines.length - lineIndex);
      const isLastFragment = lineIndex + lineCount >= metric.lines.length;
      let marginAfter = isLastFragment ? metric.marginAfter : 0;
      const fragmentContentHeight = marginBefore + lineCount * metric.lineHeightPx;
      const nextMinimumHeight = isLastFragment && nextMeaningfulMetric
        ? getMinimumRenderableHeight(nextMeaningfulMetric, safeColumnHeight)
        : null;

      if (
        isLastFragment
        && marginAfter > 0
        && (
          fragmentContentHeight + marginAfter > remainingHeight + 0.5
          || (
            nextMinimumHeight !== null
            && remainingHeight + 0.5 >= fragmentContentHeight + nextMinimumHeight
            && fragmentContentHeight + marginAfter + nextMinimumHeight > remainingHeight + 0.5
          )
        )
      ) {
        marginAfter = 0;
      }

      if (fragmentContentHeight + marginAfter > remainingHeight + 0.5 && currentColumnHeight > 0) {
        advanceColumn();
        continue;
      }

      const lines = metric.lines.slice(lineIndex, lineIndex + lineCount);
      const item = {
        align: metric.block.align,
        anchorId: metric.block.anchorId,
        blockquoteDepth: metric.block.blockquoteDepth,
        blockIndex: metric.block.blockIndex,
        chapterIndex: metric.block.chapterIndex,
        container: metric.block.container,
        contentHeight: lines.length * metric.lineHeightPx,
        font: metric.font,
        fontSizePx: metric.fontSizePx,
        headingLevel: metric.block.headingLevel,
        height: fragmentContentHeight + marginAfter,
        indent: metric.block.indent,
        key: `${metric.block.key}:${lineIndex}`,
        kind: metric.block.kind,
        lineHeightPx: metric.lineHeightPx,
        lineStartIndex: lineIndex,
        lines,
        listContext: metric.block.listContext,
        marginAfter,
        marginBefore,
        originalTag: metric.block.originalTag,
        renderRole: metric.block.renderRole,
        richLineFragments: metric.richLineFragments
          ? metric.richLineFragments.slice(lineIndex, lineIndex + lineCount)
          : createRichLineFragments(metric.block.richChildren, lines),
        showListMarker: metric.block.showListMarker,
        sourceBlockType: metric.block.sourceBlockType,
        text: metric.block.text ?? '',
      };
      getCurrentColumn().items.push(item);
      getCurrentColumn().height += item.height;
      currentColumnHeight += item.height;
      lineIndex += lineCount;
    }
  }

  if (currentPage.columns.some((column) => column.items.length > 0) || pages.length === 0) {
    finalizePageLocators(currentPage);
    pages.push(currentPage);
  }

  return {
    chapterIndex: measuredLayout.chapterIndex,
    columnCount: safeColumnCount,
    columnGap,
    columnWidth: measuredLayout.textWidth,
    pageHeight: safeColumnHeight,
    pageSlices: pages,
  };
}

export function buildStaticPagedChapterTree(
  chapter: ChapterContent,
  columnWidth: number,
  columnHeight: number,
  columnCount: number,
  columnGap: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  textLayoutEngine?: ReaderTextLayoutEngine,
): StaticPagedChapterTree {
  const measuredLayout = measurePagedReaderChapterLayout(
    chapter,
    columnWidth,
    typography,
    imageDimensionsByKey,
    textLayoutEngine,
  );

  return composePaginatedChapterLayout(
    measuredLayout,
    columnHeight,
    columnCount,
    columnGap,
  );
}

export function buildStaticSummaryShellTree(
  chapter: Pick<ChapterContent, 'index' | 'title'>,
): StaticSummaryShellTree {
  return {
    chapterIndex: chapter.index,
    title: chapter.title,
    variant: 'summary-shell',
  };
}
