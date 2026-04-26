import type { Chapter } from '@shared/contracts/reader';
import type { ChapterFlowManifest } from '../layout-core/internal';
import type { UseReaderRenderCacheResult } from './readerRenderCacheTypes';

export type ChapterPageCountStatus = 'estimated' | 'exact' | 'stale' | 'failed';

export interface ChapterPageCountEntry {
  chapterIndex: number;
  contentHash?: string;
  estimatedPageCount: number;
  exactPageCount?: number;
  layoutKey: string;
  pageCount: number;
  status: ChapterPageCountStatus;
  updatedAt: number;
}

export type ChapterPageCountTable = Map<number, ChapterPageCountEntry>;

export interface StableChapterPageCountSnapshot {
  exactEntries: ChapterPageCountTable;
  layoutKey: string;
  novelId: number;
}

export function buildChapterPageCountTable(params: {
  chapters: Chapter[];
  layoutKey: string;
  pagedLayouts: UseReaderRenderCacheResult['pagedLayouts'];
  pagedManifests: UseReaderRenderCacheResult['pagedManifests'];
}): ChapterPageCountTable {
  const table: ChapterPageCountTable = new Map();
  const updatedAt = Date.now();

  for (const chapter of params.chapters) {
    const layout = params.pagedLayouts.get(chapter.index);
    const manifest = params.pagedManifests.get(chapter.index) ?? null;
    const layoutPageCount = layout ? normalizePageCount(layout.pageSlices.length) : null;
    const manifestPageCount = manifest ? normalizePageCount(manifest.pageCount) : null;
    const manifestIsStale = manifest !== null && manifest.layoutKey !== params.layoutKey;
    const manifestIsFallback = manifest !== null && isFallbackPagedManifest(manifest);
    const hasExactPageCount = layoutPageCount !== null
      || isExactPagedManifestPageCount({
        manifest,
        manifestIsFallback,
        manifestIsStale,
        manifestPageCount,
      });
    const pageCount = layoutPageCount
      ?? manifestPageCount
      ?? 1;
    let status: ChapterPageCountStatus = 'estimated';
    if (hasExactPageCount) {
      status = 'exact';
    } else if (manifestIsStale) {
      status = 'stale';
    }

    table.set(chapter.index, {
      chapterIndex: chapter.index,
      contentHash: manifest?.contentHash,
      estimatedPageCount: pageCount,
      exactPageCount: status === 'exact' ? pageCount : undefined,
      layoutKey: params.layoutKey,
      pageCount,
      status,
      updatedAt,
    });
  }

  return table;
}

export function stabilizeChapterPageCountTable(params: {
  layoutKey: string;
  liveTable: ChapterPageCountTable;
  novelId: number;
  previousSnapshot: StableChapterPageCountSnapshot | null;
}): {
    snapshot: StableChapterPageCountSnapshot;
    table: ChapterPageCountTable;
  } {
  const previousExactEntries =
    params.previousSnapshot?.novelId === params.novelId
    && params.previousSnapshot.layoutKey === params.layoutKey
      ? params.previousSnapshot.exactEntries
      : new Map<number, ChapterPageCountEntry>();
  const exactEntries: ChapterPageCountTable = new Map(previousExactEntries);
  const table: ChapterPageCountTable = new Map();

  for (const [chapterIndex, liveEntry] of params.liveTable) {
    if (liveEntry.status === 'exact') {
      exactEntries.set(chapterIndex, liveEntry);
      table.set(chapterIndex, liveEntry);
      continue;
    }

    const stableExactEntry = exactEntries.get(chapterIndex);
    if (stableExactEntry && canReuseStableExactPageCount(stableExactEntry, liveEntry)) {
      const exactPageCount = normalizePageCount(
        stableExactEntry.exactPageCount ?? stableExactEntry.pageCount,
      ) ?? 1;
      table.set(chapterIndex, {
        ...liveEntry,
        contentHash: stableExactEntry.contentHash ?? liveEntry.contentHash,
        exactPageCount,
        layoutKey: stableExactEntry.layoutKey,
        pageCount: exactPageCount,
        status: 'exact',
        updatedAt: stableExactEntry.updatedAt,
      });
      continue;
    }

    table.set(chapterIndex, liveEntry);
  }

  return {
    snapshot: {
      exactEntries,
      layoutKey: params.layoutKey,
      novelId: params.novelId,
    },
    table,
  };
}

export function sumChapterPageCounts(table: ChapterPageCountTable): number {
  let total = 0;
  for (const entry of table.values()) {
    total += normalizePageCount(entry.pageCount) ?? 1;
  }
  return Math.max(1, total);
}

export function resolveDisplayPageIndexFromTable(params: {
  chapterIndex: number;
  localPageIndex: number;
  table: ChapterPageCountTable;
}): number {
  let pageOffset = 0;
  const orderedEntries = Array.from(params.table.values())
    .sort((left, right) => left.chapterIndex - right.chapterIndex);

  for (const entry of orderedEntries) {
    const pageCount = normalizePageCount(entry.pageCount) ?? 1;
    if (entry.chapterIndex === params.chapterIndex) {
      return pageOffset + clampPageIndex(params.localPageIndex, pageCount);
    }

    pageOffset += pageCount;
  }

  return Math.max(0, pageOffset - 1);
}

export function normalizePageCount(pageCount: number | null | undefined): number | null {
  if (typeof pageCount !== 'number' || !Number.isFinite(pageCount)) {
    return null;
  }

  return Math.max(1, Math.floor(pageCount));
}

export function clampPageIndex(pageIndex: number, pageCount: number): number {
  const normalizedPageCount = normalizePageCount(pageCount) ?? 1;
  if (!Number.isFinite(pageIndex)) {
    return 0;
  }

  return Math.min(normalizedPageCount - 1, Math.max(0, Math.floor(pageIndex)));
}

function isFallbackPagedManifest(manifest: ChapterFlowManifest): boolean {
  return manifest.status === 'estimated'
    && manifest.blockCount === 0
    && manifest.blockSummaries.length === 0
    && manifest.contentHash.startsWith('toc:')
    && (manifest.sourceVariants ?? []).includes('original-paged');
}

function isExactPagedManifestPageCount(params: {
  manifest: ChapterFlowManifest | null;
  manifestIsFallback: boolean;
  manifestIsStale: boolean;
  manifestPageCount: number | null;
}): boolean {
  return params.manifest !== null
    && params.manifest.status === 'materialized'
    && !params.manifestIsStale
    && !params.manifestIsFallback
    && params.manifestPageCount !== null;
}

function canReuseStableExactPageCount(
  stableEntry: ChapterPageCountEntry,
  liveEntry: ChapterPageCountEntry,
): boolean {
  const exactPageCount = normalizePageCount(stableEntry.exactPageCount ?? stableEntry.pageCount);
  if (stableEntry.status !== 'exact' || exactPageCount === null) {
    return false;
  }

  if (stableEntry.layoutKey !== liveEntry.layoutKey) {
    return false;
  }

  if (
    stableEntry.contentHash
    && liveEntry.contentHash
    && !isTocFallbackContentHash(liveEntry.contentHash)
    && stableEntry.contentHash !== liveEntry.contentHash
  ) {
    return false;
  }

  return true;
}

function isTocFallbackContentHash(contentHash: string): boolean {
  return contentHash.startsWith('toc:');
}
