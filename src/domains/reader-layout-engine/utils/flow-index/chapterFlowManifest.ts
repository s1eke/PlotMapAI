import type {
  ReaderLayoutFeatureSet,
  ReaderRenderCacheRecord,
} from '../render-cache/readerRenderCacheCore';
import type {
  PageSlice,
  ReaderLayoutSignature,
  ReaderPageItem,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  StaticSummaryShellTree,
  VirtualBlockMetrics,
} from '../layout/readerLayoutTypes';
import type {
  ChapterFlowBlockSummary,
  ChapterFlowManifest,
  ChapterFlowManifestStatus,
} from './novelFlowIndexTypes';

import {
  createMetricEndLocator,
  createMetricStartLocator,
  getItemEndLocator,
  getItemStartLocator,
} from '../locator/readerLocator';

export function createChapterFlowManifestFromScrollTree(params: {
  contentHash: string;
  contentVersion?: number;
  layoutFeatureSet?: ReaderLayoutFeatureSet;
  layoutKey: string;
  layoutSignature: ReaderLayoutSignature;
  rendererVersion?: number;
  status?: ChapterFlowManifestStatus;
  tree: StaticScrollChapterTree;
}): ChapterFlowManifest {
  const blockSummaries = params.tree.metrics.map(createScrollBlockSummary);
  const firstMeaningfulSummary = blockSummaries.find((summary) => summary.kind !== 'blank');
  const lastMeaningfulSummary = [...blockSummaries]
    .reverse()
    .find((summary) => summary.kind !== 'blank');
  const startLocator = firstMeaningfulSummary?.startLocator ?? null;
  const endLocator = lastMeaningfulSummary?.endLocator ?? null;

  return {
    blockCount: params.tree.blockCount,
    blockSummaries,
    chapterIndex: params.tree.chapterIndex,
    chapterKey: startLocator?.chapterKey ?? endLocator?.chapterKey,
    contentHash: params.contentHash,
    contentVersion: params.contentVersion,
    endLocator,
    layoutFeatureSet: params.layoutFeatureSet,
    layoutKey: params.layoutKey,
    layoutSignature: params.layoutSignature,
    pageCount: 0,
    rendererVersion: params.rendererVersion,
    scrollHeight: Math.max(0, params.tree.totalHeight),
    sourceVariants: ['original-scroll'],
    startLocator,
    status: params.status ?? 'materialized',
  };
}

export function createChapterFlowManifestFromRenderCacheRecord(
  record: ReaderRenderCacheRecord,
  status: ChapterFlowManifestStatus = record.storageKind === 'render-tree'
    ? 'materialized'
    : 'estimated',
): ChapterFlowManifest | null {
  if (record.variantFamily === 'summary-shell') {
    return null;
  }

  if (record.variantFamily === 'original-scroll' && isStaticScrollChapterTree(record.tree)) {
    return createChapterFlowManifestFromScrollTree({
      contentHash: record.contentHash,
      contentVersion: record.contentVersion,
      layoutFeatureSet: record.layoutFeatureSet,
      layoutKey: record.layoutKey,
      layoutSignature: record.layoutSignature,
      rendererVersion: record.rendererVersion,
      status,
      tree: record.tree,
    });
  }

  const pagedTree = isStaticPagedChapterTree(record.tree) ? record.tree : null;
  const blockSummaries = pagedTree ? createPagedBlockSummaries(pagedTree) : [];
  const startLocator = record.queryManifest.startLocator
    ?? pagedTree?.pageSlices[0]?.startLocator
    ?? null;
  const lastPage = pagedTree?.pageSlices[pagedTree.pageSlices.length - 1];
  const endLocator = record.queryManifest.endLocator
    ?? lastPage?.endLocator
    ?? null;

  return {
    blockCount: record.queryManifest.blockCount ?? blockSummaries.length,
    blockSummaries,
    chapterIndex: record.chapterIndex,
    chapterKey: startLocator?.chapterKey ?? endLocator?.chapterKey,
    contentHash: record.contentHash,
    contentVersion: record.contentVersion,
    endLocator,
    layoutFeatureSet: record.layoutFeatureSet,
    layoutKey: record.layoutKey,
    layoutSignature: record.layoutSignature,
    pageCount: normalizePageCount(record.queryManifest.pageCount ?? pagedTree?.pageSlices.length),
    rendererVersion: record.rendererVersion,
    scrollHeight: Math.max(0, record.queryManifest.totalHeight ?? 0),
    sourceVariants: [record.variantFamily],
    startLocator,
    status,
  };
}

export function mergeChapterFlowManifests(
  ...manifests: Array<ChapterFlowManifest | null | undefined>
): ChapterFlowManifest | null {
  const candidates = manifests.filter((manifest): manifest is ChapterFlowManifest => (
    Boolean(manifest)
  ));
  if (candidates.length === 0) {
    return null;
  }

  const scrollSource = candidates.find((manifest) => (
    manifest.sourceVariants?.includes('original-scroll')
  )) ?? candidates.find((manifest) => manifest.scrollHeight > 0) ?? candidates[0];
  const pagedSource = candidates.find((manifest) => (
    manifest.sourceVariants?.includes('original-paged')
  )) ?? candidates.find((manifest) => manifest.pageCount > 0) ?? candidates[0];
  const startLocator = scrollSource?.startLocator ?? pagedSource?.startLocator ?? null;
  const endLocator = scrollSource?.endLocator ?? pagedSource?.endLocator ?? null;

  return {
    blockCount: Math.max(...candidates.map((manifest) => manifest.blockCount)),
    blockSummaries: mergeBlockSummaries(candidates),
    chapterIndex: scrollSource.chapterIndex,
    chapterKey: scrollSource.chapterKey ?? startLocator?.chapterKey ?? endLocator?.chapterKey,
    contentHash: scrollSource.contentHash,
    contentVersion: scrollSource.contentVersion,
    endLocator,
    layoutFeatureSet: scrollSource.layoutFeatureSet,
    layoutKey: scrollSource.layoutKey,
    layoutSignature: scrollSource.layoutSignature,
    pageCount: normalizePageCount(pagedSource?.pageCount),
    rendererVersion: scrollSource.rendererVersion,
    scrollHeight: Math.max(0, scrollSource?.scrollHeight ?? 0),
    sourceVariants: Array.from(new Set(
      candidates.flatMap((manifest) => manifest.sourceVariants ?? []),
    )),
    startLocator,
    status: mergeManifestStatus(candidates),
  };
}

function createScrollBlockSummary(metric: VirtualBlockMetrics): ChapterFlowBlockSummary {
  const lineCount = metric.block.kind === 'heading' || metric.block.kind === 'text'
    ? metric.lines.length
    : undefined;

  return {
    blockIndex: metric.block.blockIndex,
    blockKey: metric.block.blockKey,
    endLocator: createMetricEndLocator(metric),
    height: Math.max(0, metric.height),
    kind: metric.block.kind,
    lineCount,
    startLocator: createMetricStartLocator(metric),
    startOffset: Math.max(0, metric.top),
  };
}

function createPagedBlockSummaries(tree: StaticPagedChapterTree): ChapterFlowBlockSummary[] {
  const summaries = new Map<string, ChapterFlowBlockSummary>();

  for (const page of tree.pageSlices) {
    for (const item of getPageItems(page)) {
      const summaryKey = getBlockSummaryKey(item);
      const previous = summaries.get(summaryKey);
      const startLocator = getItemStartLocator(item, page.pageIndex);
      const endLocator = getItemEndLocator(item, page.pageIndex);
      const lineCount = item.kind === 'heading' || item.kind === 'text'
        ? item.lines.length
        : undefined;

      summaries.set(summaryKey, {
        blockIndex: item.blockIndex,
        blockKey: item.kind === 'blank' ? undefined : item.blockKey,
        endLocator: endLocator ?? previous?.endLocator ?? null,
        height: previous?.height ?? 0,
        kind: item.kind,
        lineCount: typeof lineCount === 'number'
          ? (previous?.lineCount ?? 0) + lineCount
          : previous?.lineCount,
        pageEnd: Math.max(previous?.pageEnd ?? 0, page.pageIndex + 1),
        pageStart: Math.min(previous?.pageStart ?? page.pageIndex, page.pageIndex),
        startLocator: previous?.startLocator ?? startLocator ?? null,
        startOffset: previous?.startOffset ?? 0,
      });
    }
  }

  return Array.from(summaries.values())
    .sort((left, right) => left.blockIndex - right.blockIndex);
}

function getPageItems(page: PageSlice): ReaderPageItem[] {
  return page.columns.flatMap((column) => column.items);
}

function getBlockSummaryKey(item: ReaderPageItem | ChapterFlowBlockSummary): string {
  const blockKey = 'blockKey' in item ? item.blockKey : undefined;
  return `${item.blockIndex}:${blockKey ?? ''}:${item.kind}`;
}

function mergeBlockSummaries(manifests: ChapterFlowManifest[]): ChapterFlowBlockSummary[] {
  const merged = new Map<string, ChapterFlowBlockSummary>();

  for (const manifest of manifests) {
    for (const summary of manifest.blockSummaries) {
      const key = getBlockSummaryKey(summary);
      const previous = merged.get(key);
      merged.set(key, mergeBlockSummary(previous, summary));
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => (
      left.startOffset - right.startOffset
      || left.blockIndex - right.blockIndex
    ));
}

function mergeBlockSummary(
  previous: ChapterFlowBlockSummary | undefined,
  next: ChapterFlowBlockSummary,
): ChapterFlowBlockSummary {
  if (!previous) {
    return { ...next };
  }

  const hasNextOffset = next.height > 0 || next.startOffset > 0;
  return {
    blockIndex: previous.blockIndex,
    blockKey: previous.blockKey ?? next.blockKey,
    endLocator: hasNextOffset
      ? next.endLocator ?? previous.endLocator
      : previous.endLocator ?? next.endLocator,
    height: hasNextOffset ? next.height : previous.height,
    kind: previous.kind,
    lineCount: previous.lineCount ?? next.lineCount,
    pageEnd: previous.pageEnd ?? next.pageEnd,
    pageStart: previous.pageStart ?? next.pageStart,
    startLocator: hasNextOffset
      ? next.startLocator ?? previous.startLocator
      : previous.startLocator ?? next.startLocator,
    startOffset: hasNextOffset ? next.startOffset : previous.startOffset,
  };
}

function mergeManifestStatus(manifests: ChapterFlowManifest[]): ChapterFlowManifestStatus {
  if (manifests.some((manifest) => manifest.status === 'stale')) {
    return 'stale';
  }

  if (manifests.some((manifest) => manifest.status === 'materialized')) {
    return 'materialized';
  }

  if (manifests.some((manifest) => manifest.status === 'estimated')) {
    return 'estimated';
  }

  return 'missing';
}

function isStaticScrollChapterTree(
  tree: StaticScrollChapterTree | StaticPagedChapterTree | StaticSummaryShellTree | null,
): tree is StaticScrollChapterTree {
  return Boolean(tree && 'metrics' in tree);
}

function isStaticPagedChapterTree(
  tree: StaticScrollChapterTree | StaticPagedChapterTree | StaticSummaryShellTree | null,
): tree is StaticPagedChapterTree {
  return Boolean(tree && 'pageSlices' in tree);
}

function normalizePageCount(pageCount: number | null | undefined): number {
  return Math.max(0, Math.floor(pageCount ?? 0));
}
