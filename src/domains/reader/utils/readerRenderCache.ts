import type { ReaderRenderCacheRecord as PersistedReaderRenderCacheRecord } from '@infra/db/reader';
import type { ChapterContent } from '../readerContentService';
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
  createScrollImageLayoutConstraints,
  createReaderRenderQueryManifest,
  estimateReaderRenderQueryManifest,
  serializeReaderLayoutSignature,
} from './readerLayout';
import {
  toDomainReaderRenderCacheRecord,
  toPersistedReaderRenderCacheRecord,
} from './readerRenderCacheMapper';
import { preloadReaderImageResources } from './readerImageResourceCache';

const MEMORY_CACHE_LIMIT = 36;
const READER_RENDER_CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const READER_RENDER_CACHE_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const READER_RENDER_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type ReaderRenderCacheSource = 'memory' | 'dexie' | 'built';
export type ReaderRenderStorageKind = 'render-tree' | 'manifest';

interface ReaderRenderCacheRecordBase {
  chapterIndex: number;
  contentHash: string;
  layoutKey: string;
  layoutSignature: ReaderLayoutSignature;
  novelId: number;
  queryManifest: ReaderRenderQueryManifest;
  storageKind: ReaderRenderStorageKind;
  updatedAt: string;
  variantFamily: ReaderRenderVariant;
}

export interface ReaderRenderCacheEntry<
  TTree extends StaticChapterRenderTree = StaticChapterRenderTree,
> extends ReaderRenderCacheRecordBase {
  storageKind: 'render-tree';
  tree: TTree;
}

export interface ReaderRenderCacheManifestEntry extends ReaderRenderCacheRecordBase {
  storageKind: 'manifest';
  tree: null;
}

export type ReaderRenderCacheRecord<
  TTree extends StaticChapterRenderTree = StaticChapterRenderTree,
> =
  | ReaderRenderCacheEntry<TTree>
  | ReaderRenderCacheManifestEntry;

interface ReaderRenderCacheLookupParams {
  chapterIndex: number;
  contentHash: string;
  layoutKey: string;
  novelId: number;
  variantFamily: ReaderRenderVariant;
}

const memoryRenderCache = new Map<string, ReaderRenderCacheEntry>();
let lastReaderRenderCacheCleanupAt = 0;

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

function getReaderRenderCacheTimestampMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function createReaderRenderCacheExpiresAt(updatedAt: string): string {
  return new Date(getReaderRenderCacheTimestampMs(updatedAt) + READER_RENDER_CACHE_TTL_MS)
    .toISOString();
}

function isPersistedReaderRenderCacheExpired(
  entry: PersistedReaderRenderCacheRecord,
  now = Date.now(),
): boolean {
  return getReaderRenderCacheTimestampMs(entry.expiresAt) <= now;
}

async function cleanupExpiredReaderRenderCacheIfNeeded(now = Date.now()): Promise<void> {
  if (now - lastReaderRenderCacheCleanupAt < READER_RENDER_CACHE_CLEANUP_INTERVAL_MS) {
    return;
  }

  lastReaderRenderCacheCleanupAt = now;
  await db.readerRenderCache.where('expiresAt').belowOrEqual(new Date(now).toISOString()).delete();
}

async function refreshPersistedReaderRenderCacheIfNeeded(
  entry: PersistedReaderRenderCacheRecord,
  now = Date.now(),
): Promise<PersistedReaderRenderCacheRecord> {
  if (
    now - getReaderRenderCacheTimestampMs(entry.updatedAt)
    < READER_RENDER_CACHE_TOUCH_INTERVAL_MS
  ) {
    return entry;
  }

  const updatedAt = new Date(now).toISOString();
  const expiresAt = createReaderRenderCacheExpiresAt(updatedAt);

  await db.readerRenderCache.update(entry.id, { expiresAt, updatedAt });

  return {
    ...entry,
    expiresAt,
    updatedAt,
  };
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

export function isMaterializedReaderRenderCacheEntry<TTree extends StaticChapterRenderTree>(
  entry: ReaderRenderCacheRecord<TTree> | null | undefined,
): entry is ReaderRenderCacheEntry<TTree> {
  return Boolean(entry && entry.storageKind === 'render-tree' && entry.tree);
}

export async function getReaderRenderCacheRecordFromDexie<TTree extends StaticChapterRenderTree>(
  params: ReaderRenderCacheLookupParams,
): Promise<ReaderRenderCacheRecord<TTree> | null> {
  await cleanupExpiredReaderRenderCacheIfNeeded();

  const familyRecord = await db.readerRenderCache
    .where('[novelId+chapterIndex+variantFamily]')
    .equals([params.novelId, params.chapterIndex, params.variantFamily])
    .first();
  if (!familyRecord) {
    return null;
  }

  if (isPersistedReaderRenderCacheExpired(familyRecord)) {
    await db.readerRenderCache.delete(familyRecord.id);
    return null;
  }

  if (
    familyRecord.layoutKey !== params.layoutKey
    || familyRecord.contentHash !== params.contentHash
  ) {
    return null;
  }

  return toDomainReaderRenderCacheRecord<TTree>(
    await refreshPersistedReaderRenderCacheIfNeeded(familyRecord),
  );
}

export async function getReaderRenderCacheEntryFromDexie<TTree extends StaticChapterRenderTree>(
  params: ReaderRenderCacheLookupParams,
): Promise<ReaderRenderCacheEntry<TTree> | null> {
  const record = await getReaderRenderCacheRecordFromDexie<TTree>(params);
  if (!isMaterializedReaderRenderCacheEntry(record)) {
    return null;
  }

  primeReaderRenderCacheEntry(record);
  return record;
}

export function primeReaderRenderCacheEntry<TTree extends StaticChapterRenderTree>(
  entry: ReaderRenderCacheEntry<TTree>,
): ReaderRenderCacheEntry<TTree> {
  dropFamilyEntriesFromMemory(entry);
  const cacheKey = buildReaderRenderCacheKey(entry);
  return touchMemoryEntry(cacheKey, entry);
}

export async function persistReaderRenderCacheEntry<TTree extends StaticChapterRenderTree>(
  entry: ReaderRenderCacheRecord<TTree>,
): Promise<void> {
  await cleanupExpiredReaderRenderCacheIfNeeded();

  await db.transaction('rw', db.readerRenderCache, async () => {
    await db.readerRenderCache
      .where('[novelId+chapterIndex+variantFamily]')
      .equals([entry.novelId, entry.chapterIndex, entry.variantFamily])
      .delete();

    await db.readerRenderCache.add(
      toPersistedReaderRenderCacheRecord(
        entry,
        createReaderRenderCacheExpiresAt(entry.updatedAt),
      ),
    );
  });
}

export function createReaderRenderCacheEntry<TTree extends StaticChapterRenderTree>(params: {
  chapter: ChapterContent;
  layoutKey?: string;
  layoutSignature: ReaderLayoutSignature;
  tree: TTree;
  variantFamily: ReaderRenderVariant;
}): ReaderRenderCacheEntry<TTree> {
  return {
    chapterIndex: params.chapter.index,
    contentHash: createChapterContentHash(params.chapter),
    layoutKey: params.layoutKey ?? serializeReaderLayoutSignature(params.layoutSignature),
    layoutSignature: params.layoutSignature,
    novelId: 0,
    queryManifest: createReaderRenderQueryManifest(params.variantFamily, params.tree),
    storageKind: 'render-tree',
    tree: params.tree,
    updatedAt: new Date().toISOString(),
    variantFamily: params.variantFamily,
  };
}

export function createReaderRenderCacheManifestEntry(params: {
  chapter: Pick<ChapterContent, 'content' | 'index' | 'title'>;
  layoutKey?: string;
  layoutSignature: ReaderLayoutSignature;
  novelId: number;
  queryManifest: ReaderRenderQueryManifest;
  variantFamily: ReaderRenderVariant;
}): ReaderRenderCacheManifestEntry {
  return {
    chapterIndex: params.chapter.index,
    contentHash: createChapterContentHash(params.chapter),
    layoutKey: params.layoutKey ?? serializeReaderLayoutSignature(params.layoutSignature),
    layoutSignature: params.layoutSignature,
    novelId: params.novelId,
    queryManifest: params.queryManifest,
    storageKind: 'manifest',
    tree: null,
    updatedAt: new Date().toISOString(),
    variantFamily: params.variantFamily,
  };
}

export function buildStaticRenderTree(params: {
  chapter: ChapterContent;
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>;
  layoutKey?: string;
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
      createScrollImageLayoutConstraints(
        params.layoutSignature.textWidth,
        params.layoutSignature.pageHeight,
      ),
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
    layoutKey: params.layoutKey,
    layoutSignature: params.layoutSignature,
    tree,
    variantFamily: params.variantFamily,
  });

  return {
    ...entry,
    novelId: params.novelId,
  };
}

export function createReaderRenderCacheManifestFromEntry<TTree extends StaticChapterRenderTree>(
  entry: ReaderRenderCacheEntry<TTree>,
): ReaderRenderCacheManifestEntry {
  return {
    chapterIndex: entry.chapterIndex,
    contentHash: entry.contentHash,
    layoutKey: entry.layoutKey,
    layoutSignature: entry.layoutSignature,
    novelId: entry.novelId,
    queryManifest: entry.queryManifest,
    storageKind: 'manifest',
    tree: null,
    updatedAt: entry.updatedAt,
    variantFamily: entry.variantFamily,
  };
}

export function buildStaticRenderManifest(params: {
  chapter: ChapterContent;
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>;
  layoutKey?: string;
  layoutSignature: ReaderLayoutSignature;
  novelId: number;
  typography: ReaderTypographyMetrics;
  variantFamily: ReaderRenderVariant;
}): ReaderRenderCacheManifestEntry {
  return createReaderRenderCacheManifestEntry({
    chapter: params.chapter,
    layoutKey: params.layoutKey,
    layoutSignature: params.layoutSignature,
    novelId: params.novelId,
    queryManifest: estimateReaderRenderQueryManifest({
      chapter: params.chapter,
      imageDimensionsByKey: params.imageDimensionsByKey,
      layoutSignature: params.layoutSignature,
      typography: params.typography,
      variantFamily: params.variantFamily,
    }),
    variantFamily: params.variantFamily,
  });
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
