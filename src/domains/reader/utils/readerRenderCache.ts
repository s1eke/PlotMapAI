import type { ReaderRenderCache as PersistedReaderRenderCacheRecord } from '@infra/db';
import type { ChapterContent } from '../api/readerApi';
import type { ReaderImageDimensions } from './readerImageResourceCache';
import type {
  ReaderLayoutSignature,
  ReaderRenderQueryManifest,
  ReaderRenderVariant,
  ReaderTypographyMetrics,
  StaticChapterRenderTree,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  StaticSummaryShellTree,
} from './readerLayout';

import { db } from '@infra/db';

import { extractImageKeysFromText } from './chapterImages';
import {
  buildStaticPagedChapterTree,
  buildStaticScrollChapterTree,
  buildStaticSummaryShellTree,
  createChapterContentHash,
  createReaderRenderQueryManifest,
  serializeReaderLayoutSignature,
} from './readerLayout';
import { preloadReaderImageResources } from './readerImageResourceCache';

const MEMORY_CACHE_LIMIT = 36;

export type ReaderRenderCacheSource = 'memory' | 'dexie' | 'built';

export interface ReaderRenderCacheEntry<TTree extends StaticChapterRenderTree = StaticChapterRenderTree> {
  chapterIndex: number;
  contentHash: string;
  layoutKey: string;
  layoutSignature: ReaderLayoutSignature;
  novelId: number;
  queryManifest: ReaderRenderQueryManifest;
  tree: TTree;
  updatedAt: string;
  variantFamily: ReaderRenderVariant;
}

interface ReaderRenderCacheLookupParams {
  chapterIndex: number;
  contentHash: string;
  layoutKey: string;
  novelId: number;
  variantFamily: ReaderRenderVariant;
}

const memoryRenderCache = new Map<string, ReaderRenderCacheEntry>();

function buildFamilyKey(params: {
  chapterIndex: number;
  novelId: number;
  variantFamily: ReaderRenderVariant;
}): string {
  return `${params.novelId}:${params.chapterIndex}:${params.variantFamily}`;
}

export function buildReaderRenderCacheKey(params: ReaderRenderCacheLookupParams): string {
  return `${buildFamilyKey(params)}:${params.layoutKey}:${params.contentHash}`;
}

function evictMemoryRenderCacheIfNeeded(): void {
  while (memoryRenderCache.size > MEMORY_CACHE_LIMIT) {
    const oldestKey = memoryRenderCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    memoryRenderCache.delete(oldestKey);
  }
}

function touchMemoryEntry<TTree extends StaticChapterRenderTree>(
  cacheKey: string,
  entry: ReaderRenderCacheEntry<TTree>,
): ReaderRenderCacheEntry<TTree> {
  memoryRenderCache.delete(cacheKey);
  memoryRenderCache.set(cacheKey, entry);
  evictMemoryRenderCacheIfNeeded();
  return entry;
}

function dropFamilyEntriesFromMemory(params: {
  chapterIndex: number;
  novelId: number;
  variantFamily: ReaderRenderVariant;
}): void {
  const familyKey = buildFamilyKey(params);
  for (const cacheKey of memoryRenderCache.keys()) {
    if (cacheKey.startsWith(`${familyKey}:`)) {
      memoryRenderCache.delete(cacheKey);
    }
  }
}

export function getReaderRenderCacheEntryFromMemory<TTree extends StaticChapterRenderTree>(
  params: ReaderRenderCacheLookupParams,
): ReaderRenderCacheEntry<TTree> | null {
  const cacheKey = buildReaderRenderCacheKey(params);
  const cached = memoryRenderCache.get(cacheKey) as ReaderRenderCacheEntry<TTree> | undefined;
  if (!cached) {
    return null;
  }

  return touchMemoryEntry(cacheKey, cached);
}

function toDomainEntry<TTree extends StaticChapterRenderTree>(
  persisted: PersistedReaderRenderCacheRecord,
): ReaderRenderCacheEntry<TTree> {
  return {
    chapterIndex: persisted.chapterIndex,
    contentHash: persisted.contentHash,
    layoutKey: persisted.layoutKey,
    layoutSignature: persisted.layoutSignature,
    novelId: persisted.novelId,
    queryManifest: persisted.queryManifest,
    tree: persisted.tree as TTree,
    updatedAt: persisted.updatedAt,
    variantFamily: persisted.variantFamily,
  };
}

export async function getReaderRenderCacheEntryFromDexie<TTree extends StaticChapterRenderTree>(
  params: ReaderRenderCacheLookupParams,
): Promise<ReaderRenderCacheEntry<TTree> | null> {
  const familyRecord = await db.readerRenderCache
    .where('[novelId+chapterIndex+variantFamily]')
    .equals([params.novelId, params.chapterIndex, params.variantFamily])
    .first();
  if (
    !familyRecord
    || familyRecord.layoutKey !== params.layoutKey
    || familyRecord.contentHash !== params.contentHash
  ) {
    return null;
  }

  const entry = toDomainEntry<TTree>(familyRecord);
  primeReaderRenderCacheEntry(entry);
  return entry;
}

export function primeReaderRenderCacheEntry<TTree extends StaticChapterRenderTree>(
  entry: ReaderRenderCacheEntry<TTree>,
): ReaderRenderCacheEntry<TTree> {
  dropFamilyEntriesFromMemory(entry);
  const cacheKey = buildReaderRenderCacheKey(entry);
  return touchMemoryEntry(cacheKey, entry);
}

export async function persistReaderRenderCacheEntry<TTree extends StaticChapterRenderTree>(
  entry: ReaderRenderCacheEntry<TTree>,
): Promise<void> {
  await db.transaction('rw', db.readerRenderCache, async () => {
    await db.readerRenderCache
      .where('[novelId+chapterIndex+variantFamily]')
      .equals([entry.novelId, entry.chapterIndex, entry.variantFamily])
      .delete();

    await db.readerRenderCache.add({
      id: undefined as unknown as number,
      novelId: entry.novelId,
      chapterIndex: entry.chapterIndex,
      variantFamily: entry.variantFamily,
      layoutKey: entry.layoutKey,
      layoutSignature: entry.layoutSignature,
      contentHash: entry.contentHash,
      tree: entry.tree,
      queryManifest: entry.queryManifest,
      updatedAt: entry.updatedAt,
    });
  });
}

export function createReaderRenderCacheEntry<TTree extends StaticChapterRenderTree>(params: {
  chapter: ChapterContent;
  layoutSignature: ReaderLayoutSignature;
  tree: TTree;
  variantFamily: ReaderRenderVariant;
}): ReaderRenderCacheEntry<TTree> {
  return {
    chapterIndex: params.chapter.index,
    contentHash: createChapterContentHash(params.chapter),
    layoutKey: serializeReaderLayoutSignature(params.layoutSignature),
    layoutSignature: params.layoutSignature,
    novelId: 0,
    queryManifest: createReaderRenderQueryManifest(params.variantFamily, params.tree),
    tree: params.tree,
    updatedAt: new Date().toISOString(),
    variantFamily: params.variantFamily,
  };
}

export function buildStaticRenderTree(params: {
  chapter: ChapterContent;
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>;
  layoutSignature: ReaderLayoutSignature;
  novelId: number;
  typography: ReaderTypographyMetrics;
  variantFamily: ReaderRenderVariant;
}): ReaderRenderCacheEntry {
  let tree: StaticChapterRenderTree;
  if (params.variantFamily === 'original-scroll') {
    tree = buildStaticScrollChapterTree(
      params.chapter,
      params.layoutSignature.textWidth,
      params.typography,
      params.imageDimensionsByKey,
    );
  } else if (params.variantFamily === 'original-paged') {
    tree = buildStaticPagedChapterTree(
      params.chapter,
      params.layoutSignature.textWidth,
      params.layoutSignature.pageHeight,
      params.layoutSignature.columnCount,
      params.layoutSignature.columnGap,
      params.typography,
      params.imageDimensionsByKey,
    );
  } else {
    tree = buildStaticSummaryShellTree(params.chapter);
  }

  const entry = createReaderRenderCacheEntry({
    chapter: params.chapter,
    layoutSignature: params.layoutSignature,
    tree,
    variantFamily: params.variantFamily,
  });

  return {
    ...entry,
    novelId: params.novelId,
  };
}

export async function warmReaderRenderImages(
  novelId: number,
  chapter: Pick<ChapterContent, 'content'>,
): Promise<void> {
  const imageKeys = extractImageKeysFromText(chapter.content);
  if (imageKeys.length === 0) {
    return;
  }

  await preloadReaderImageResources(novelId, imageKeys);
}

export function clearReaderRenderCacheMemoryForNovel(novelId: number): void {
  for (const cacheKey of memoryRenderCache.keys()) {
    if (cacheKey.startsWith(`${novelId}:`)) {
      memoryRenderCache.delete(cacheKey);
    }
  }
}

export function coercePagedTree(
  entry: ReaderRenderCacheEntry | null | undefined,
): StaticPagedChapterTree | null {
  if (!entry || entry.variantFamily !== 'original-paged') {
    return null;
  }
  return entry.tree as StaticPagedChapterTree;
}

export function coerceScrollTree(
  entry: ReaderRenderCacheEntry | null | undefined,
): StaticScrollChapterTree | null {
  if (!entry || entry.variantFamily !== 'original-scroll') {
    return null;
  }
  return entry.tree as StaticScrollChapterTree;
}

export function coerceSummaryShellTree(
  entry: ReaderRenderCacheEntry | null | undefined,
): StaticSummaryShellTree | null {
  if (!entry || entry.variantFamily !== 'summary-shell') {
    return null;
  }
  return entry.tree as StaticSummaryShellTree;
}
