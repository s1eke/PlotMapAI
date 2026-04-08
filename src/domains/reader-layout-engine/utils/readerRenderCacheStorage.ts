import type { Transaction } from 'dexie';

import type { ReaderRenderCacheRecord as PersistedReaderRenderCacheRecord } from '@infra/db/reader';
import type { ReaderRenderVariant, StaticChapterRenderTree } from './readerLayout';
import type {
  ReaderRenderCacheEntry,
  ReaderRenderCacheLookupParams,
  ReaderRenderCacheRecord,
} from './readerRenderCacheCore';

import { db } from '@infra/db';

import {
  buildFamilyKey,
  buildReaderRenderCacheKey,
  READER_RENDER_CACHE_PERSISTED_LIMIT,
  READER_RENDER_CACHE_TTL_MS,
} from './readerRenderCacheCore';
import {
  toDomainReaderRenderCacheRecord,
  toPersistedReaderRenderCacheRecord,
} from './readerRenderCacheMapper';

const MEMORY_CACHE_LIMIT = 36;
const READER_RENDER_CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const READER_RENDER_CACHE_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const memoryRenderCache = new Map<string, ReaderRenderCacheEntry>();
let lastReaderRenderCacheCleanupAt = 0;

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

async function prunePersistedReaderRenderCacheIfNeeded(
  readerRenderCacheTable: typeof db.readerRenderCache = db.readerRenderCache,
): Promise<void> {
  const overflow = await readerRenderCacheTable.count() - READER_RENDER_CACHE_PERSISTED_LIMIT;
  if (overflow <= 0) {
    return;
  }

  const oldestIds = await readerRenderCacheTable
    .orderBy('updatedAt')
    .limit(overflow)
    .primaryKeys();
  if (oldestIds.length === 0) {
    return;
  }

  await readerRenderCacheTable.bulkDelete(oldestIds as number[]);
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
    familyRecord.contentFormat !== params.contentFormat
    || familyRecord.contentVersion !== params.contentVersion
    || familyRecord.layoutFeatureSet !== params.layoutFeatureSet
    || familyRecord.layoutKey !== params.layoutKey
    || familyRecord.contentHash !== params.contentHash
    || familyRecord.rendererVersion !== params.rendererVersion
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
    await prunePersistedReaderRenderCacheIfNeeded(db.readerRenderCache);
  });
}

export function clearReaderRenderCacheMemoryForNovel(novelId: number): void {
  for (const cacheKey of memoryRenderCache.keys()) {
    if (cacheKey.startsWith(`${novelId}:`)) {
      memoryRenderCache.delete(cacheKey);
    }
  }
}

export async function deletePersistedReaderRenderCache(
  novelId: number,
  transaction?: Transaction,
): Promise<void> {
  const readerRenderCacheTable = transaction
    ? transaction.table('readerRenderCache')
    : db.readerRenderCache;

  await readerRenderCacheTable.where('novelId').equals(novelId).delete();
}
