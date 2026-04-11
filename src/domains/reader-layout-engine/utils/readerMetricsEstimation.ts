import type { ReaderImageDimensions } from '@domains/reader-media';
import type {
  ReaderBlock,
  ReaderImageLayoutConstraints,
  ReaderRenderQueryManifest,
  ReaderTypographyMetrics,
} from './readerLayoutTypes';

import {
  getApproximateMaxCharsPerLine,
  resolveReaderImageSize,
} from './readerLayoutShared';
import { getRichScrollHorizontalTextWidth } from './richScroll';
import { READER_CONTENT_TOKEN_DEFAULTS } from '@shared/reader-content';
import { getRichInlinePlainText } from '@shared/text-processing';

export interface EstimatedReaderBlockMetric {
  block: ReaderBlock;
  captionHeight?: number;
  captionSpacing?: number;
  contentHeight: number;
  displayHeight?: number;
  displayWidth?: number;
  height: number;
  lineCount: number;
  lineHeightPx: number;
  marginAfter: number;
  marginBefore: number;
}

export function findNextMeaningfulEstimatedMetricAfter(
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

export function getEstimatedMinimumRenderableHeight(
  metric: EstimatedReaderBlockMetric,
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

function estimateTableContentHeight(
  tableRows: NonNullable<ReaderBlock['tableRows']>,
  maxWidth: number,
  lineHeightPx: number,
  fontSizePx: number,
): { contentHeight: number; rowHeights: number[] } {
  if (tableRows.length === 0) {
    return {
      contentHeight: 0,
      rowHeights: [],
    };
  }

  const columnCount = Math.max(...tableRows.map((row) => row.length), 1);
  const totalHorizontalPadding =
    columnCount * READER_CONTENT_TOKEN_DEFAULTS.tableCellPaddingXPx * 2
    + (columnCount + 1) * READER_CONTENT_TOKEN_DEFAULTS.tableBorderWidthPx;
  const cellMaxWidth = Math.max(
    READER_CONTENT_TOKEN_DEFAULTS.tableMinCellWidthPx,
    (maxWidth - totalHorizontalPadding) / columnCount,
  );
  const rowHeights = tableRows.map((row) => {
    const maxCellHeight = Math.max(...row.map((cell) => {
      const lineCount = Math.max(
        estimateTextLineCount(getRichInlinePlainText(cell.children), cellMaxWidth, fontSizePx),
        1,
      );
      return lineCount * lineHeightPx + READER_CONTENT_TOKEN_DEFAULTS.tableCellPaddingYPx * 2;
    }), lineHeightPx + READER_CONTENT_TOKEN_DEFAULTS.tableCellPaddingYPx * 2);

    return maxCellHeight;
  });
  const borderHeight =
    (tableRows.length + 1) * READER_CONTENT_TOKEN_DEFAULTS.tableBorderWidthPx;

  return {
    contentHeight: rowHeights.reduce((total, height) => total + height, 0) + borderHeight,
    rowHeights,
  };
}

function estimateTextLineCount(text: string, maxWidth: number, fontSizePx: number): number {
  if (!text) {
    return 0;
  }

  const maxCharsPerLine = getApproximateMaxCharsPerLine(maxWidth, fontSizePx);
  return Math.max(1, Math.ceil(text.length / maxCharsPerLine));
}

export function estimateReaderBlockMetric(
  block: ReaderBlock,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  richAware = false,
  imageLayoutConstraints?: ReaderImageLayoutConstraints,
): EstimatedReaderBlockMetric {
  if (block.kind === 'heading' || block.kind === 'text') {
    const maxWidth = richAware
      ? getRichScrollHorizontalTextWidth(block, width)
      : width;
    const fontSizePx = block.kind === 'heading'
      ? typography.headingFontSize
      : typography.bodyFontSize;
    const lineHeightPx = block.kind === 'heading'
      ? typography.headingLineHeightPx
      : typography.bodyLineHeightPx;
    if (block.renderRole === 'table' && block.tableRows) {
      const tableMetrics = estimateTableContentHeight(
        block.tableRows,
        maxWidth,
        lineHeightPx,
        fontSizePx,
      );
      return {
        block,
        contentHeight: tableMetrics.contentHeight,
        height: block.marginBefore + tableMetrics.contentHeight + block.marginAfter,
        lineCount: 0,
        lineHeightPx,
        marginAfter: block.marginAfter,
        marginBefore: block.marginBefore,
      };
    }

    const lineCount = block.renderRole === 'hr'
      ? 0
      : estimateTextLineCount(block.text ?? '', maxWidth, fontSizePx);
    const contentHeight = block.renderRole === 'hr'
      ? 1
      : lineCount * lineHeightPx;
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
    const availableWidth = richAware
      ? getRichScrollHorizontalTextWidth(block, width)
      : width;
    const resolvedImageSize = resolveReaderImageSize(
      availableWidth,
      block.imageKey,
      imageDimensionsByKey,
      imageLayoutConstraints,
    );
    const displayWidth = resolvedImageSize.width;
    const displayHeight = resolvedImageSize.height;
    const captionHeight = estimateTextLineCount(
      getRichInlinePlainText(block.imageCaption ?? []),
      displayWidth,
      typography.bodyFontSize,
    ) * typography.bodyLineHeightPx;
    const captionSpacing = captionHeight > 0 ? 8 : 0;

    return {
      block,
      captionHeight,
      captionSpacing,
      contentHeight: displayHeight + captionSpacing + captionHeight,
      displayHeight,
      displayWidth,
      height:
        block.marginBefore
        + displayHeight
        + captionSpacing
        + captionHeight
        + block.marginAfter,
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

export function createEstimatedMetricStartLocator(
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

export function createEstimatedMetricEndLocator(
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

export function estimatePaginatedManifestPageCount(
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
      const captionHeight = metric.captionHeight ?? 0;
      const captionSpacing = captionHeight > 0 ? (metric.captionSpacing ?? 0) : 0;
      let displayHeight = metric.displayHeight ?? metric.contentHeight;
      const maxImageHeight = safeColumnHeight
        - metric.marginBefore
        - metric.marginAfter
        - captionSpacing
        - captionHeight;
      if (displayHeight > maxImageHeight && maxImageHeight > 0) {
        displayHeight = maxImageHeight;
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
        ? getEstimatedMinimumRenderableHeight(nextMeaningfulMetric, safeColumnHeight)
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

      currentColumnHeight += tableContentHeight + marginAfter;
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
