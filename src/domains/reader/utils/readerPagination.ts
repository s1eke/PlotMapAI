import type { ChapterContent } from '../readerContentService';
import type { ReaderImageDimensions } from './readerImageResourceCache';
import type { ReaderTextLayoutEngine } from './readerMeasurement';
import type {
  MeasuredChapterLayout,
  PageSlice,
  PaginatedChapterLayout,
  ReaderBlock,
  ReaderImageLayoutConstraints,
  ReaderLayoutSignature,
  ReaderRenderQueryManifest,
  ReaderRenderVariant,
  ReaderTypographyMetrics,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  StaticSummaryShellTree,
  VirtualBlockMetrics,
} from './readerLayoutTypes';

import { PAGED_VIEWPORT_TOP_PADDING_PX } from './readerLayoutTypes';
import {
  createMetricEndLocator,
  createMetricStartLocator,
  getItemEndLocator,
  getItemStartLocator,
} from './readerLocator';
import {
  buildReaderBlocks,
  getApproximateMaxCharsPerLine,
  resolveReaderImageSize,
} from './readerLayoutShared';
import { measureReaderChapterLayout } from './readerMeasurement';

interface EstimatedReaderBlockMetric {
  block: ReaderBlock;
  contentHeight: number;
  displayHeight?: number;
  displayWidth?: number;
  height: number;
  lineCount: number;
  lineHeightPx: number;
  marginAfter: number;
  marginBefore: number;
}

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
): StaticScrollChapterTree {
  return measureReaderChapterLayout(
    chapter,
    width,
    typography,
    imageDimensionsByKey,
    imageLayoutConstraints,
    textLayoutEngine,
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
        startLocator = getItemStartLocator(item);
      }
      endLocator = getItemEndLocator(item);
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

function findNextMeaningfulEstimatedMetricAfter(
  metrics: EstimatedReaderBlockMetric[],
  startIndex: number,
): EstimatedReaderBlockMetric | null {
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
    const displayHeight = metric.displayHeight ?? metric.contentHeight;
    const maxImageHeight = pageHeight - metric.marginBefore - metric.marginAfter;
    const resolvedDisplayHeight = displayHeight > maxImageHeight && maxImageHeight > 0
      ? maxImageHeight
      : displayHeight;
    return metric.marginBefore + resolvedDisplayHeight;
  }

  return metric.marginBefore + metric.lineHeightPx;
}

function getEstimatedMinimumRenderableHeight(
  metric: EstimatedReaderBlockMetric,
  pageHeight: number,
): number {
  if (metric.block.kind === 'image') {
    const displayHeight = metric.displayHeight ?? metric.contentHeight;
    const maxImageHeight = pageHeight - metric.marginBefore - metric.marginAfter;
    const resolvedDisplayHeight = displayHeight > maxImageHeight && maxImageHeight > 0
      ? maxImageHeight
      : displayHeight;
    return metric.marginBefore + resolvedDisplayHeight;
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
      let displayHeight = metric.displayHeight ?? metric.contentHeight;
      let displayWidth = metric.displayWidth ?? measuredLayout.textWidth;
      const maxImageHeight = safeColumnHeight - metric.marginBefore - metric.marginAfter;
      if (displayHeight > maxImageHeight && maxImageHeight > 0) {
        const scale = maxImageHeight / displayHeight;
        displayHeight *= scale;
        displayWidth *= scale;
      }
      const imageContentHeight = metric.marginBefore + displayHeight;
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
        blockIndex: metric.block.blockIndex,
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
      };
      getCurrentColumn().items.push(item);
      getCurrentColumn().height += imageHeight;
      currentColumnHeight += imageHeight;
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
        blockIndex: metric.block.blockIndex,
        chapterIndex: metric.block.chapterIndex,
        contentHeight: lines.length * metric.lineHeightPx,
        font: metric.font,
        fontSizePx: metric.fontSizePx,
        height: fragmentContentHeight + marginAfter,
        key: `${metric.block.key}:${lineIndex}`,
        kind: metric.block.kind,
        lineHeightPx: metric.lineHeightPx,
        lineStartIndex: lineIndex,
        lines,
        marginAfter,
        marginBefore,
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
  const measuredLayout = measureReaderChapterLayout(
    chapter,
    columnWidth,
    typography,
    imageDimensionsByKey,
    undefined,
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

function estimateTextLineCount(text: string, maxWidth: number, fontSizePx: number): number {
  if (!text) {
    return 0;
  }

  const maxCharsPerLine = getApproximateMaxCharsPerLine(maxWidth, fontSizePx);
  return Math.max(1, Math.ceil(text.length / maxCharsPerLine));
}

function estimateReaderBlockMetric(
  block: ReaderBlock,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  imageLayoutConstraints?: ReaderImageLayoutConstraints,
): EstimatedReaderBlockMetric {
  if (block.kind === 'heading' || block.kind === 'text') {
    const fontSizePx = block.kind === 'heading'
      ? typography.headingFontSize
      : typography.bodyFontSize;
    const lineHeightPx = block.kind === 'heading'
      ? typography.headingLineHeightPx
      : typography.bodyLineHeightPx;
    const lineCount = estimateTextLineCount(block.text ?? '', width, fontSizePx);
    const contentHeight = lineCount * lineHeightPx;
    return {
      block,
      contentHeight,
      height: block.marginBefore + contentHeight + block.marginAfter,
      lineCount,
      lineHeightPx,
      marginAfter: block.marginAfter,
      marginBefore: block.marginBefore,
    };
  }

  if (block.kind === 'image') {
    const resolvedImageSize = resolveReaderImageSize(
      width,
      block.imageKey,
      imageDimensionsByKey,
      imageLayoutConstraints,
    );
    const displayWidth = resolvedImageSize.width;
    const displayHeight = resolvedImageSize.height;

    return {
      block,
      contentHeight: displayHeight,
      displayHeight,
      displayWidth,
      height: block.marginBefore + displayHeight + block.marginAfter,
      lineCount: 0,
      lineHeightPx: typography.bodyLineHeightPx,
      marginAfter: block.marginAfter,
      marginBefore: block.marginBefore,
    };
  }

  return {
    block,
    contentHeight: 0,
    height: block.marginAfter,
    lineCount: 0,
    lineHeightPx: typography.bodyLineHeightPx,
    marginAfter: block.marginAfter,
    marginBefore: 0,
  };
}

function createEstimatedMetricStartLocator(
  metric: EstimatedReaderBlockMetric,
): ReaderRenderQueryManifest['startLocator'] {
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

  return {
    blockIndex: metric.block.blockIndex,
    chapterIndex: metric.block.chapterIndex,
    kind: metric.block.kind,
    lineIndex: 0,
  };
}

function createEstimatedMetricEndLocator(
  metric: EstimatedReaderBlockMetric,
): ReaderRenderQueryManifest['endLocator'] {
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

  return {
    blockIndex: metric.block.blockIndex,
    chapterIndex: metric.block.chapterIndex,
    kind: metric.block.kind,
    lineIndex: Math.max(metric.lineCount - 1, 0),
  };
}

function estimatePaginatedManifestPageCount(
  metrics: EstimatedReaderBlockMetric[],
  columnHeight: number,
  columnCount: number,
): number {
  const safeColumnCount = Math.max(columnCount, 1);
  const safeColumnHeight = Math.max(columnHeight, 1);
  let currentColumnIndex = 0;
  let currentColumnHeight = 0;
  let pageCount = 0;
  let pageHasContent = false;

  const advanceColumn = () => {
    currentColumnIndex += 1;
    currentColumnHeight = 0;
    if (currentColumnIndex < safeColumnCount) {
      return;
    }

    pageCount += 1;
    currentColumnIndex = 0;
    pageHasContent = false;
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

  for (let metricIndex = 0; metricIndex < metrics.length; metricIndex += 1) {
    const metric = metrics[metricIndex];
    const nextMeaningfulMetric = findNextMeaningfulEstimatedMetricAfter(metrics, metricIndex + 1);

    if (metric.block.kind === 'blank') {
      const remainingHeight = safeColumnHeight - currentColumnHeight;
      const nextMinimumHeight = nextMeaningfulMetric
        ? getEstimatedMinimumRenderableHeight(nextMeaningfulMetric, safeColumnHeight)
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
      currentColumnHeight += blankHeight;
      pageHasContent = true;
      continue;
    }

    if (metric.block.kind === 'image') {
      let displayHeight = metric.displayHeight ?? metric.contentHeight;
      const maxImageHeight = safeColumnHeight - metric.marginBefore - metric.marginAfter;
      if (displayHeight > maxImageHeight && maxImageHeight > 0) {
        displayHeight = maxImageHeight;
      }

      const imageContentHeight = metric.marginBefore + displayHeight;
      ensureRoom(imageContentHeight);
      let remainingHeight = safeColumnHeight - currentColumnHeight;
      if (remainingHeight <= 0) {
        advanceColumn();
        remainingHeight = safeColumnHeight;
      }

      let { marginAfter } = metric;
      const nextMinimumHeight = nextMeaningfulMetric
        ? getEstimatedMinimumRenderableHeight(nextMeaningfulMetric, safeColumnHeight)
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

      currentColumnHeight += imageContentHeight + marginAfter;
      pageHasContent = true;
      continue;
    }

    let remainingLines = metric.lineCount;
    let isFirstFragment = true;
    while (remainingLines > 0) {
      const marginBefore = isFirstFragment ? metric.marginBefore : 0;
      ensureRoom(marginBefore + metric.lineHeightPx);
      let remainingHeight = safeColumnHeight - currentColumnHeight;
      if (remainingHeight <= 0) {
        advanceColumn();
        remainingHeight = safeColumnHeight;
      }

      const availableLineHeight = remainingHeight - marginBefore;
      let lineCount = Math.max(1, Math.floor(availableLineHeight / metric.lineHeightPx));
      lineCount = Math.min(lineCount, remainingLines);
      const isLastFragment = lineCount === remainingLines;
      let marginAfter = isLastFragment ? metric.marginAfter : 0;
      const fragmentContentHeight = marginBefore + lineCount * metric.lineHeightPx;
      const nextMinimumHeight = isLastFragment && nextMeaningfulMetric
        ? getEstimatedMinimumRenderableHeight(nextMeaningfulMetric, safeColumnHeight)
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

      currentColumnHeight += fragmentContentHeight + marginAfter;
      pageHasContent = true;
      remainingLines -= lineCount;
      isFirstFragment = false;
    }
  }

  if (pageHasContent || pageCount === 0) {
    pageCount += 1;
  }

  return pageCount;
}

export function estimateReaderRenderQueryManifest(params: {
  chapter: ChapterContent;
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>;
  layoutSignature: ReaderLayoutSignature;
  typography: ReaderTypographyMetrics;
  variantFamily: ReaderRenderVariant;
}): ReaderRenderQueryManifest {
  if (params.variantFamily === 'summary-shell') {
    return {};
  }

  const blocks = buildReaderBlocks(params.chapter, params.typography.paragraphSpacing);
  const scrollImageLayoutConstraints = params.variantFamily === 'original-scroll'
    ? createScrollImageLayoutConstraints(
      params.layoutSignature.textWidth,
      params.layoutSignature.pageHeight,
    )
    : undefined;
  const estimatedMetrics = blocks.map((block) => estimateReaderBlockMetric(
    block,
    params.layoutSignature.textWidth,
    params.typography,
    params.imageDimensionsByKey,
    scrollImageLayoutConstraints,
  ));
  const firstMeaningfulMetric = estimatedMetrics.find((metric) => metric.block.kind !== 'blank');
  const lastMeaningfulMetric = [...estimatedMetrics]
    .reverse()
    .find((metric) => metric.block.kind !== 'blank');
  const lineCount = estimatedMetrics.reduce((total, metric) => total + metric.lineCount, 0);

  if (params.variantFamily === 'original-scroll') {
    const totalHeight = estimatedMetrics.reduce((total, metric) => total + metric.height, 0);
    return {
      blockCount: blocks.length,
      endLocator: lastMeaningfulMetric
        ? createEstimatedMetricEndLocator(lastMeaningfulMetric)
        : null,
      lineCount,
      startLocator: firstMeaningfulMetric
        ? createEstimatedMetricStartLocator(firstMeaningfulMetric)
        : null,
      totalHeight,
    };
  }

  return {
    blockCount: blocks.length,
    endLocator: lastMeaningfulMetric
      ? createEstimatedMetricEndLocator(lastMeaningfulMetric)
      : null,
    lineCount,
    pageCount: estimatePaginatedManifestPageCount(
      estimatedMetrics,
      params.layoutSignature.pageHeight,
      params.layoutSignature.columnCount,
    ),
    startLocator: firstMeaningfulMetric
      ? createEstimatedMetricStartLocator(firstMeaningfulMetric)
      : null,
  };
}

export function createReaderRenderQueryManifest(
  variant: ReaderRenderVariant,
  tree: StaticScrollChapterTree | StaticPagedChapterTree | StaticSummaryShellTree,
): ReaderRenderQueryManifest {
  if (variant === 'original-scroll') {
    const scrollTree = tree as StaticScrollChapterTree;
    const firstMeaningfulMetric = scrollTree.metrics.find((metric) => metric.block.kind !== 'blank');
    const lastMeaningfulMetric = [...scrollTree.metrics]
      .reverse()
      .find((metric) => metric.block.kind !== 'blank');
    const lineCount = scrollTree.metrics.reduce((total, metric) => (
      total + (
        metric.block.kind === 'heading' || metric.block.kind === 'text'
          ? metric.lines.length
          : 0
      )
    ), 0);
    return {
      blockCount: scrollTree.blockCount,
      endLocator: lastMeaningfulMetric ? createMetricEndLocator(lastMeaningfulMetric) : null,
      lineCount,
      startLocator: firstMeaningfulMetric ? createMetricStartLocator(firstMeaningfulMetric) : null,
      totalHeight: scrollTree.totalHeight,
    };
  }

  if (variant === 'original-paged') {
    const pagedTree = tree as StaticPagedChapterTree;
    const firstPage = pagedTree.pageSlices[0];
    const lastPage = pagedTree.pageSlices[pagedTree.pageSlices.length - 1];
    const blockIndices = new Set<number>();
    let lineCount = 0;
    for (const page of pagedTree.pageSlices) {
      for (const column of page.columns) {
        for (const item of column.items) {
          blockIndices.add(item.blockIndex);
          if (item.kind === 'heading' || item.kind === 'text') {
            lineCount += item.lines.length;
          }
        }
      }
    }
    return {
      blockCount: blockIndices.size,
      endLocator: lastPage?.endLocator ?? null,
      lineCount,
      pageCount: pagedTree.pageSlices.length,
      startLocator: firstPage?.startLocator ?? null,
    };
  }

  return {};
}
