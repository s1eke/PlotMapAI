import type {
  LayoutCursor,
  LayoutLine,
  PreparedTextWithSegments,
} from '@chenglou/pretext';
import type { ChapterContent } from '../api/readerApi';
import type { ReaderImageDimensions } from './readerImageResourceCache';

import {
  layoutWithLines,
  prepareWithSegments,
} from '@chenglou/pretext';

import { parseParagraphSegments } from './chapterImages';

const MAX_PRETEXT_CACHE_SIZE = 256;
const PRETEXT_CACHE = new Map<string, PreparedTextWithSegments | null>();
const DEFAULT_IMAGE_ASPECT_RATIO = 4 / 3;
const IMAGE_BLOCK_MARGIN_PX = 16;
const HEADING_TOP_MARGIN_PX = 8;
const HEADING_BOTTOM_MARGIN_PX = 32;
const TEXT_FALLBACK_WIDTH_RATIO = 0.55;
const MIN_TWO_COLUMN_WIDTH_PX = 360;
const PORTRAIT_PAGED_RATIO_THRESHOLD = 1.1;
const TWO_COLUMN_TARGET_CHARS_PER_LINE = 20;
export const PAGED_VIEWPORT_TOP_PADDING_PX = 16;

export type ReaderRenderVariant = 'original-scroll' | 'original-paged' | 'summary-shell';

export interface ReaderLocator {
  chapterIndex: number;
  blockIndex: number;
  kind: 'heading' | 'text' | 'image';
  lineIndex?: number;
  startCursor?: LayoutCursor;
  endCursor?: LayoutCursor;
  edge?: 'start' | 'end';
}

export interface ReaderBlock {
  chapterIndex: number;
  blockIndex: number;
  key: string;
  kind: 'heading' | 'text' | 'image' | 'blank';
  text?: string;
  imageKey?: string;
  marginBefore: number;
  marginAfter: number;
  paragraphIndex: number;
}

export interface PreparedTextBlock {
  font: string;
  key: string;
  lineHeightPx: number;
  prepared: PreparedTextWithSegments | null;
  text: string;
}

export interface ReaderTypographyMetrics {
  bodyFont: string;
  bodyFontSize: number;
  bodyLineHeightPx: number;
  headingFont: string;
  headingFontSize: number;
  headingLineHeightPx: number;
  paragraphSpacing: number;
}

export interface ReaderLayoutSignature {
  textWidth: number;
  pageHeight: number;
  columnCount: number;
  columnGap: number;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

export interface ReaderViewportMetrics {
  scrollViewportHeight: number;
  scrollViewportWidth: number;
  scrollTextWidth: number;
  pagedViewportHeight: number;
  pagedViewportWidth: number;
  pagedColumnCount: number;
  pagedColumnWidth: number;
  pagedColumnGap: number;
  pagedFitsTwoColumns: boolean;
}

export interface ReaderMeasuredLine extends LayoutLine {
  lineIndex: number;
}

export interface VirtualBlockMetrics {
  block: ReaderBlock;
  contentHeight: number;
  displayHeight?: number;
  displayWidth?: number;
  font: string;
  fontSizePx: number;
  fontWeight: number;
  height: number;
  lineHeightPx: number;
  lines: ReaderMeasuredLine[];
  marginAfter: number;
  marginBefore: number;
  top: number;
}

export interface MeasuredChapterLayout {
  blockCount: number;
  chapterIndex: number;
  metrics: VirtualBlockMetrics[];
  textWidth: number;
  totalHeight: number;
}

export interface ReaderTextPageItem {
  blockIndex: number;
  chapterIndex: number;
  contentHeight: number;
  font: string;
  fontSizePx: number;
  height: number;
  key: string;
  kind: 'heading' | 'text';
  lineHeightPx: number;
  lineStartIndex: number;
  lines: ReaderMeasuredLine[];
  marginAfter: number;
  marginBefore: number;
}

export interface ReaderImagePageItem {
  blockIndex: number;
  chapterIndex: number;
  displayHeight: number;
  displayWidth: number;
  edge: 'start' | 'end';
  height: number;
  imageKey: string;
  key: string;
  kind: 'image';
  marginAfter: number;
  marginBefore: number;
}

export interface ReaderBlankPageItem {
  blockIndex: number;
  chapterIndex: number;
  height: number;
  key: string;
  kind: 'blank';
}

export type ReaderPageItem = ReaderTextPageItem | ReaderImagePageItem | ReaderBlankPageItem;

export interface ReaderPageColumn {
  height: number;
  items: ReaderPageItem[];
}

export interface PageSlice {
  columnCount: number;
  columns: ReaderPageColumn[];
  endLocator: ReaderLocator | null;
  pageIndex: number;
  startLocator: ReaderLocator | null;
}

export interface PaginatedChapterLayout {
  chapterIndex: number;
  columnCount: number;
  columnGap: number;
  columnWidth: number;
  pageHeight: number;
  pageSlices: PageSlice[];
}

export type StaticTextLine = ReaderMeasuredLine;
export type StaticScrollBlockNode = VirtualBlockMetrics;
export type StaticPagedNode = ReaderPageItem;
export type StaticReaderNode = StaticScrollBlockNode | StaticPagedNode;
export type StaticScrollChapterTree = MeasuredChapterLayout;
export type StaticPagedChapterTree = PaginatedChapterLayout;

export interface StaticSummaryShellTree {
  chapterIndex: number;
  title: string;
  variant: 'summary-shell';
}

export type StaticChapterRenderTree =
  | StaticScrollChapterTree
  | StaticPagedChapterTree
  | StaticSummaryShellTree;

export interface ReaderRenderQueryManifest {
  blockCount?: number;
  pageCount?: number;
  totalHeight?: number;
  startLocator?: ReaderLocator | null;
  endLocator?: ReaderLocator | null;
}

export function createReaderViewportMetrics(
  scrollViewportWidth: number,
  scrollViewportHeight: number,
  pagedViewportWidth: number,
  pagedViewportHeight: number,
  bodyFontSize: number = 18,
): ReaderViewportMetrics {
  const scrollHorizontalPadding = scrollViewportWidth >= 768
    ? 48
    : scrollViewportWidth >= 640
      ? 32
      : 16;
  const scrollAvailableWidth = Math.max(0, scrollViewportWidth - scrollHorizontalPadding * 2);
  const scrollTextWidth = scrollAvailableWidth <= 0
    ? 0
    : Math.min(scrollAvailableWidth, Math.max(scrollAvailableWidth * 0.78, 640), 920);

  const pagedColumnGap = pagedViewportWidth >= 960 ? 48 : 32;
  const minComfortableColumnWidth = Math.max(
    MIN_TWO_COLUMN_WIDTH_PX,
    bodyFontSize * TWO_COLUMN_TARGET_CHARS_PER_LINE,
  );
  const isPortraitPagedViewport = pagedViewportHeight > pagedViewportWidth * PORTRAIT_PAGED_RATIO_THRESHOLD;
  const pagedFitsTwoColumns = !isPortraitPagedViewport
    && pagedViewportWidth >= minComfortableColumnWidth * 2 + pagedColumnGap;
  const pagedColumnCount = pagedFitsTwoColumns ? 2 : 1;
  const pagedColumnWidth = pagedColumnCount === 2
    ? Math.max((pagedViewportWidth - pagedColumnGap) / 2, 0)
    : Math.max(pagedViewportWidth, 0);

  return {
    scrollViewportHeight,
    scrollViewportWidth,
    scrollTextWidth,
    pagedViewportHeight,
    pagedViewportWidth,
    pagedColumnCount,
    pagedColumnWidth,
    pagedColumnGap,
    pagedFitsTwoColumns,
  };
}

export function createReaderLayoutSignature({
  columnCount,
  columnGap,
  fontSize,
  lineSpacing,
  pageHeight,
  paragraphSpacing,
  textWidth,
}: ReaderLayoutSignature): ReaderLayoutSignature {
  return {
    columnCount,
    columnGap,
    fontSize,
    lineSpacing,
    pageHeight,
    paragraphSpacing,
    textWidth,
  };
}

export function getPagedContentHeight(pagedViewportHeight: number): number {
  return Math.max(0, pagedViewportHeight - PAGED_VIEWPORT_TOP_PADDING_PX);
}

export function serializeReaderLayoutSignature(signature: ReaderLayoutSignature): string {
  return [
    signature.textWidth,
    signature.pageHeight,
    signature.columnCount,
    signature.columnGap,
    signature.fontSize,
    signature.lineSpacing,
    signature.paragraphSpacing,
  ]
    .map((value) => Number.isFinite(value) ? value.toFixed(3) : '0')
    .join('|');
}

export function createReaderTypographyMetrics(
  fontSize: number,
  lineSpacing: number,
  paragraphSpacing: number,
  viewportWidth: number,
): ReaderTypographyMetrics {
  const fontFamily = resolveReaderFontFamily();
  const headingFontSize = Math.max(
    fontSize * 1.35,
    viewportWidth >= 640 ? 28 : 24,
  );

  return {
    bodyFont: `400 ${fontSize}px ${fontFamily}`,
    bodyFontSize: fontSize,
    bodyLineHeightPx: Math.max(1, fontSize * lineSpacing),
    headingFont: `700 ${headingFontSize}px ${fontFamily}`,
    headingFontSize,
    headingLineHeightPx: Math.max(1, headingFontSize * 1.4),
    paragraphSpacing,
  };
}

export function buildReaderBlocks(chapter: ChapterContent, paragraphSpacing: number): ReaderBlock[] {
  const lines = chapter.content.split('\n');
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
  const skipLineIndex = firstNonEmptyIndex !== -1 && lines[firstNonEmptyIndex].trim() === chapter.title.trim()
    ? firstNonEmptyIndex
    : -1;
  const blocks: ReaderBlock[] = [{
    chapterIndex: chapter.index,
    blockIndex: 0,
    key: `${chapter.index}:heading:0`,
    kind: 'heading',
    text: chapter.title,
    marginBefore: HEADING_TOP_MARGIN_PX,
    marginAfter: HEADING_BOTTOM_MARGIN_PX,
    paragraphIndex: -1,
  }];

  let nextBlockIndex = 1;
  const hasLaterNonEmptyLine = (startIndex: number): boolean => {
    for (let index = startIndex; index < lines.length; index += 1) {
      if (index === skipLineIndex) {
        continue;
      }
      if (lines[index]?.trim()) {
        return true;
      }
    }
    return false;
  };

  lines.forEach((line, paragraphIndex) => {
    if (paragraphIndex === skipLineIndex) {
      return;
    }

    if (!line.trim()) {
      const previousLine = paragraphIndex > 0 ? lines[paragraphIndex - 1] : '';
      if (!previousLine?.trim()) {
        return;
      }
      if (!hasLaterNonEmptyLine(paragraphIndex + 1)) {
        return;
      }

      blocks.push({
        chapterIndex: chapter.index,
        blockIndex: nextBlockIndex,
        key: `${chapter.index}:blank:${nextBlockIndex}`,
        kind: 'blank',
        marginBefore: 0,
        marginAfter: paragraphSpacing,
        paragraphIndex,
      });
      nextBlockIndex += 1;
      return;
    }

    const segments = parseParagraphSegments(line)
      .filter((segment) => segment.type === 'image' || segment.value.trim().length > 0);
    if (segments.length === 0) {
      return;
    }

    const hasImmediateBlankAfter = paragraphIndex < lines.length - 1 && !lines[paragraphIndex + 1]?.trim();

    segments.forEach((segment, segmentIndex) => {
      const isLastSegment = segmentIndex === segments.length - 1;
      if (segment.type === 'image') {
        blocks.push({
          chapterIndex: chapter.index,
          blockIndex: nextBlockIndex,
          key: `${chapter.index}:image:${nextBlockIndex}`,
          kind: 'image',
          imageKey: segment.value,
          marginBefore: IMAGE_BLOCK_MARGIN_PX,
          marginAfter: IMAGE_BLOCK_MARGIN_PX + (isLastSegment && !hasImmediateBlankAfter ? paragraphSpacing : 0),
          paragraphIndex,
        });
        nextBlockIndex += 1;
        return;
      }

      blocks.push({
        chapterIndex: chapter.index,
        blockIndex: nextBlockIndex,
        key: `${chapter.index}:text:${nextBlockIndex}`,
        kind: 'text',
        text: segment.value,
        marginBefore: 0,
        marginAfter: isLastSegment && !hasImmediateBlankAfter ? paragraphSpacing : 0,
        paragraphIndex,
      });
      nextBlockIndex += 1;
    });
  });

  return blocks;
}

export function createChapterContentHash(chapter: Pick<ChapterContent, 'content' | 'index' | 'title'>): string {
  const source = `${chapter.index}\u0000${chapter.title}\u0000${chapter.content}`;
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;

  for (let index = 0; index < source.length; index += 1) {
    const value = source.charCodeAt(index);
    hashA ^= value;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= value;
    hashB = Math.imul(hashB, 0x27d4eb2d);
  }

  return `${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0).toString(16).padStart(8, '0')}`;
}

export function measureReaderChapterLayout(
  chapter: ChapterContent,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
): MeasuredChapterLayout {
  const blocks = buildReaderBlocks(chapter, typography.paragraphSpacing);
  const metrics: VirtualBlockMetrics[] = [];
  let offsetTop = 0;

  for (const block of blocks) {
    let blockMetrics: VirtualBlockMetrics;
    if (block.kind === 'heading' || block.kind === 'text') {
      const prepared = createPreparedTextBlock(
        block.text ?? '',
        block.kind === 'heading' ? typography.headingFont : typography.bodyFont,
        block.kind === 'heading' ? typography.headingLineHeightPx : typography.bodyLineHeightPx,
      );
      const fontSizePx = block.kind === 'heading'
        ? typography.headingFontSize
        : typography.bodyFontSize;
      const lineHeightPx = block.kind === 'heading'
        ? typography.headingLineHeightPx
        : typography.bodyLineHeightPx;
      const lines = measurePreparedTextBlock(prepared, width, fontSizePx);
      const contentHeight = lines.length * lineHeightPx;

      blockMetrics = {
        block,
        contentHeight,
        font: prepared.font,
        fontSizePx,
        fontWeight: block.kind === 'heading' ? 700 : 400,
        height: block.marginBefore + contentHeight + block.marginAfter,
        lineHeightPx,
        lines,
        marginAfter: block.marginAfter,
        marginBefore: block.marginBefore,
        top: offsetTop,
      };
    } else if (block.kind === 'image') {
      const dimensions = block.imageKey
        ? imageDimensionsByKey.get(block.imageKey) ?? null
        : null;
      const naturalWidth = Math.max(dimensions?.width ?? width, 1);
      const aspectRatio = dimensions?.aspectRatio && Number.isFinite(dimensions.aspectRatio)
        ? dimensions.aspectRatio
        : DEFAULT_IMAGE_ASPECT_RATIO;
      const displayWidth = Math.min(width, naturalWidth);
      const displayHeight = Math.max(1, displayWidth / aspectRatio);

      blockMetrics = {
        block,
        contentHeight: displayHeight,
        displayHeight,
        displayWidth,
        font: typography.bodyFont,
        fontSizePx: typography.bodyFontSize,
        fontWeight: 400,
        height: block.marginBefore + displayHeight + block.marginAfter,
        lineHeightPx: typography.bodyLineHeightPx,
        lines: [],
        marginAfter: block.marginAfter,
        marginBefore: block.marginBefore,
        top: offsetTop,
      };
    } else {
      blockMetrics = {
        block,
        contentHeight: 0,
        font: typography.bodyFont,
        fontSizePx: typography.bodyFontSize,
        fontWeight: 400,
        height: block.marginAfter,
        lineHeightPx: typography.bodyLineHeightPx,
        lines: [],
        marginAfter: block.marginAfter,
        marginBefore: 0,
        top: offsetTop,
      };
    }

    metrics.push(blockMetrics);
    offsetTop += blockMetrics.height;
  }

  return {
    blockCount: blocks.length,
    chapterIndex: chapter.index,
    metrics,
    textWidth: width,
    totalHeight: offsetTop,
  };
}

export function buildStaticScrollChapterTree(
  chapter: ChapterContent,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
): StaticScrollChapterTree {
  return measureReaderChapterLayout(chapter, width, typography, imageDimensionsByKey);
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
    const nextMeaningfulMetric = findNextMeaningfulMetricAfter(measuredLayout.metrics, metricIndex + 1);

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
      const blankItem: ReaderBlankPageItem = {
        blockIndex: metric.block.blockIndex,
        chapterIndex: metric.block.chapterIndex,
        height: blankHeight,
        key: `${metric.block.key}:blank`,
        kind: 'blank',
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

      let marginAfter = metric.marginAfter;
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
      const item: ReaderImagePageItem = {
        blockIndex: metric.block.blockIndex,
        chapterIndex: metric.block.chapterIndex,
        displayHeight,
        displayWidth,
        edge: 'start',
        height: imageHeight,
        imageKey: metric.block.imageKey ?? '',
        key: `${metric.block.key}:image`,
        kind: 'image',
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
      const item: ReaderTextPageItem = {
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
): StaticPagedChapterTree {
  const measuredLayout = measureReaderChapterLayout(
    chapter,
    columnWidth,
    typography,
    imageDimensionsByKey,
  );

  return composePaginatedChapterLayout(
    measuredLayout,
    columnHeight,
    columnCount,
    columnGap,
  );
}

export function buildStaticSummaryShellTree(chapter: Pick<ChapterContent, 'index' | 'title'>): StaticSummaryShellTree {
  return {
    chapterIndex: chapter.index,
    title: chapter.title,
    variant: 'summary-shell',
  };
}

export function createReaderRenderQueryManifest(
  variant: ReaderRenderVariant,
  tree: StaticChapterRenderTree,
): ReaderRenderQueryManifest {
  if (variant === 'original-scroll') {
    const scrollTree = tree as StaticScrollChapterTree;
    const firstMeaningfulMetric = scrollTree.metrics.find((metric) => metric.block.kind !== 'blank');
    const lastMeaningfulMetric = [...scrollTree.metrics].reverse().find((metric) => metric.block.kind !== 'blank');
    return {
      blockCount: scrollTree.blockCount,
      endLocator: lastMeaningfulMetric ? createMetricEndLocator(lastMeaningfulMetric) : null,
      startLocator: firstMeaningfulMetric ? createMetricStartLocator(firstMeaningfulMetric) : null,
      totalHeight: scrollTree.totalHeight,
    };
  }

  if (variant === 'original-paged') {
    const pagedTree = tree as StaticPagedChapterTree;
    const firstPage = pagedTree.pageSlices[0];
    const lastPage = pagedTree.pageSlices[pagedTree.pageSlices.length - 1];
    return {
      endLocator: lastPage?.endLocator ?? null,
      pageCount: pagedTree.pageSlices.length,
      startLocator: firstPage?.startLocator ?? null,
    };
  }

  return {};
}

export function findPageIndexForLocator(
  paginatedLayout: PaginatedChapterLayout | null | undefined,
  locator: ReaderLocator | null | undefined,
): number | null {
  if (!paginatedLayout || !locator) {
    return null;
  }

  for (const page of paginatedLayout.pageSlices) {
    for (const column of page.columns) {
      for (const item of column.items) {
        if (item.chapterIndex !== locator.chapterIndex || item.blockIndex !== locator.blockIndex) {
          continue;
        }
        if (item.kind === 'image' && locator.kind === 'image') {
          return page.pageIndex;
        }
        if ((item.kind === 'heading' || item.kind === 'text') && locator.kind === item.kind) {
          const lineIndex = locator.lineIndex ?? 0;
          const startLineIndex = item.lineStartIndex;
          const endLineIndex = item.lineStartIndex + item.lines.length;
          if (lineIndex >= startLineIndex && lineIndex < endLineIndex) {
            return page.pageIndex;
          }
        }
      }
    }
  }

  return null;
}

export function findVisibleBlockRange(
  layout: MeasuredChapterLayout,
  offsetTop: number,
  viewportHeight: number,
  overscanPx: number,
): { startIndex: number; endIndex: number } {
  const viewportStart = Math.max(0, offsetTop - overscanPx);
  const viewportEnd = offsetTop + viewportHeight + overscanPx;
  let startIndex = 0;
  let endIndex = Math.max(0, layout.metrics.length - 1);

  for (let index = 0; index < layout.metrics.length; index += 1) {
    const metric = layout.metrics[index];
    if (metric.top + metric.height >= viewportStart) {
      startIndex = index;
      break;
    }
  }

  for (let index = startIndex; index < layout.metrics.length; index += 1) {
    const metric = layout.metrics[index];
    if (metric.top <= viewportEnd) {
      endIndex = index;
      continue;
    }
    break;
  }

  return { endIndex, startIndex };
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
    const meaningfulMetric = findNearestMeaningfulMetric(layout.metrics, matchedMetric.block.blockIndex);
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
            Math.max(0, clampedOffset - matchedMetric.top - matchedMetric.marginBefore) / matchedMetric.lineHeightPx,
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

  const metric = layout.metrics.find((candidate) => candidate.block.blockIndex === locator.blockIndex);
  if (!metric) {
    return null;
  }

  if (metric.block.kind === 'image') {
    return metric.top + (locator.edge === 'end' ? metric.height : metric.marginBefore);
  }

  if (metric.block.kind === 'blank') {
    return metric.top;
  }

  const lineIndex = Math.max(0, Math.min(locator.lineIndex ?? 0, Math.max(metric.lines.length - 1, 0)));
  return metric.top + metric.marginBefore + lineIndex * metric.lineHeightPx;
}

export function getPageStartLocator(page: PageSlice | null | undefined): ReaderLocator | null {
  return page?.startLocator ?? null;
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
  let startLocator: ReaderLocator | null = null;
  let endLocator: ReaderLocator | null = null;

  for (const column of page.columns) {
    for (const item of column.items) {
      if (!startLocator) {
        startLocator = getItemStartLocator(item);
      }
      endLocator = getItemEndLocator(item);
    }
  }

  page.startLocator = startLocator;
  page.endLocator = endLocator;
}

function createMetricStartLocator(metric: VirtualBlockMetrics): ReaderLocator | null {
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

function createMetricEndLocator(metric: VirtualBlockMetrics): ReaderLocator | null {
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

function getItemStartLocator(item: ReaderPageItem): ReaderLocator | null {
  if (item.kind === 'image') {
    return {
      blockIndex: item.blockIndex,
      chapterIndex: item.chapterIndex,
      edge: 'start',
      kind: 'image',
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
    startCursor: line?.start,
  };
}

function getItemEndLocator(item: ReaderPageItem): ReaderLocator | null {
  if (item.kind === 'image') {
    return {
      blockIndex: item.blockIndex,
      chapterIndex: item.chapterIndex,
      edge: 'end',
      kind: 'image',
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
    startCursor: line?.start,
  };
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
    const displayHeight = metric.displayHeight ?? metric.contentHeight;
    const maxImageHeight = pageHeight - metric.marginBefore - metric.marginAfter;
    const resolvedDisplayHeight = displayHeight > maxImageHeight && maxImageHeight > 0
      ? maxImageHeight
      : displayHeight;
    return metric.marginBefore + resolvedDisplayHeight;
  }

  return metric.marginBefore + metric.lineHeightPx;
}

function findNearestMeaningfulMetric(
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

function getPreparedTextFromCache(key: string): PreparedTextWithSegments | null | undefined {
  const prepared = PRETEXT_CACHE.get(key);
  if (prepared === undefined) {
    return undefined;
  }

  PRETEXT_CACHE.delete(key);
  PRETEXT_CACHE.set(key, prepared);
  return prepared;
}

function setPreparedTextInCache(key: string, prepared: PreparedTextWithSegments | null): void {
  if (PRETEXT_CACHE.has(key)) {
    PRETEXT_CACHE.delete(key);
  }

  PRETEXT_CACHE.set(key, prepared);
  while (PRETEXT_CACHE.size > MAX_PRETEXT_CACHE_SIZE) {
    const oldestKey = PRETEXT_CACHE.keys().next().value;
    if (!oldestKey) {
      return;
    }
    PRETEXT_CACHE.delete(oldestKey);
  }
}

function createPreparedTextBlock(text: string, font: string, lineHeightPx: number): PreparedTextBlock {
  const key = `${font}\u0000${text}`;
  let prepared = getPreparedTextFromCache(key);
  if (prepared === undefined) {
    prepared = prepareText(text, font);
    setPreparedTextInCache(key, prepared);
  }

  return {
    font,
    key,
    lineHeightPx,
    prepared,
    text,
  };
}

function prepareText(text: string, font: string): PreparedTextWithSegments | null {
  try {
    return prepareWithSegments(text, font);
  } catch {
    return null;
  }
}

function measurePreparedTextBlock(
  prepared: PreparedTextBlock,
  maxWidth: number,
  fontSizePx: number,
): ReaderMeasuredLine[] {
  if (maxWidth <= 0) {
    return [];
  }

  if (prepared.prepared) {
    try {
      return layoutWithLines(prepared.prepared, maxWidth, prepared.lineHeightPx).lines.map((line, index) => ({
        ...line,
        lineIndex: index,
      }));
    } catch {
      return fallbackLayoutLines(prepared.text, maxWidth, fontSizePx);
    }
  }

  return fallbackLayoutLines(prepared.text, maxWidth, fontSizePx);
}

function fallbackLayoutLines(text: string, maxWidth: number, fontSizePx: number): ReaderMeasuredLine[] {
  if (!text) {
    return [];
  }

  const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / Math.max(fontSizePx * TEXT_FALLBACK_WIDTH_RATIO, 1)));
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    chunks.push(text.slice(cursor, cursor + maxCharsPerLine));
    cursor += maxCharsPerLine;
  }

  return chunks.map((chunk, index) => ({
    end: {
      graphemeIndex: Math.min((index + 1) * maxCharsPerLine, text.length),
      segmentIndex: 0,
    },
    lineIndex: index,
    start: {
      graphemeIndex: index * maxCharsPerLine,
      segmentIndex: 0,
    },
    text: chunk,
    width: Math.min(maxWidth, chunk.length * fontSizePx * TEXT_FALLBACK_WIDTH_RATIO),
  }));
}

function resolveReaderFontFamily(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    return 'sans-serif';
  }

  const fontFamily = window.getComputedStyle(document.body).fontFamily.trim();
  return fontFamily || 'sans-serif';
}

export function getReaderLayoutPretextCacheSizeForTests(): number {
  return PRETEXT_CACHE.size;
}

export function resetReaderLayoutPretextCacheForTests(): void {
  PRETEXT_CACHE.clear();
}
