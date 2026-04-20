import type { ChapterContent } from '@shared/contracts/reader';
import type { ReaderImageDimensions } from '@domains/reader-media';
import type {
  ReaderLayoutSignature,
  ReaderRenderQueryManifest,
  ReaderRenderVariant,
  ReaderTypographyMetrics,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  StaticSummaryShellTree,
} from './readerLayoutTypes';

import {
  createMetricEndLocator,
  createMetricStartLocator,
} from '../locator/readerLocator';
import {
  buildPagedReaderBlocks,
  buildReaderBlocks,
} from './readerLayoutShared';
import { shouldUseRichScrollBlocks } from './richScroll';
import {
  buildStaticScrollChapterTree,
  createScrollImageLayoutConstraints,
} from './readerStaticTree';
import {
  createEstimatedMetricEndLocator,
  createEstimatedMetricStartLocator,
  estimatePaginatedManifestPageCount,
  estimateReaderBlockMetric,
} from '../measurement/readerMetricsEstimation';

export function estimateReaderRenderQueryManifest(params: {
  chapter: ChapterContent;
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>;
  layoutSignature: ReaderLayoutSignature;
  preferRichScrollRendering?: boolean;
  typography: ReaderTypographyMetrics;
  variantFamily: ReaderRenderVariant;
}): ReaderRenderQueryManifest {
  if (params.variantFamily === 'summary-shell') {
    return {};
  }

  const preferRichScrollRendering = params.preferRichScrollRendering ?? true;

  if (
    params.variantFamily === 'original-scroll'
    && shouldUseRichScrollBlocks(params.chapter, preferRichScrollRendering)
  ) {
    const scrollTree = buildStaticScrollChapterTree(
      params.chapter,
      params.layoutSignature.textWidth,
      params.typography,
      params.imageDimensionsByKey,
      createScrollImageLayoutConstraints(
        params.layoutSignature.textWidth,
        params.layoutSignature.pageHeight,
      ),
      undefined,
      preferRichScrollRendering,
    );

    return createReaderRenderQueryManifest('original-scroll', scrollTree);
  }

  const richAwarePaged =
    params.variantFamily === 'original-paged'
    && shouldUseRichScrollBlocks(params.chapter);
  const blocks = params.variantFamily === 'original-paged'
    ? buildPagedReaderBlocks(params.chapter, params.typography.paragraphSpacing)
    : buildReaderBlocks(params.chapter, params.typography.paragraphSpacing);
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
    richAwarePaged,
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
