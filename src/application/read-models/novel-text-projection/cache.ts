import type {
  NovelProjectionDerivedBucket,
  NovelProjectionSourceBucket,
} from './types';

const MAX_CACHED_NOVELS = 2;

const sourceCacheByNovelId = new Map<number, NovelProjectionSourceBucket>();
const derivedCacheByNovelId = new Map<number, NovelProjectionDerivedBucket>();
const novelContentVersionById = new Map<number, number>();

function trimNovelCache<T>(cache: Map<number, T>): void {
  while (cache.size > MAX_CACHED_NOVELS) {
    const oldestNovelId = cache.keys().next().value;
    if (oldestNovelId === undefined) {
      return;
    }
    cache.delete(oldestNovelId);
  }
}

function getOrCreateNovelBucket<T>(
  cache: Map<number, T>,
  novelId: number,
  createBucket: () => T,
): T {
  const existing = cache.get(novelId);
  if (existing) {
    cache.delete(novelId);
    cache.set(novelId, existing);
    return existing;
  }

  const created = createBucket();
  cache.set(novelId, created);
  trimNovelCache(cache);
  return created;
}

export function getSourceBucket(novelId: number): NovelProjectionSourceBucket {
  return getOrCreateNovelBucket(sourceCacheByNovelId, novelId, () => ({
    rawChaptersByIndex: new Map(),
    richChaptersByIndex: new Map(),
  }));
}

export function getDerivedBucket(novelId: number): NovelProjectionDerivedBucket {
  return getOrCreateNovelBucket(derivedCacheByNovelId, novelId, () => ({
    chapterBaseByKey: new Map(),
    chapterContentByKey: new Map(),
    projectedBooksByKey: new Map(),
    titlesByKey: new Map(),
  }));
}

export function memoizePromise<K, TValue>(
  map: Map<K, Promise<TValue>>,
  key: K,
  loadValue: () => Promise<TValue>,
): Promise<TValue> {
  const cached = map.get(key);
  if (cached) {
    return cached;
  }

  const promise = loadValue().catch((error) => {
    map.delete(key);
    throw error;
  });
  map.set(key, promise);
  return promise;
}

export function getCurrentNovelContentVersion(novelId: number): number {
  return novelContentVersionById.get(novelId) ?? 0;
}

export function invalidateNovelTextProjectionCache(novelId: number): void {
  sourceCacheByNovelId.delete(novelId);
  derivedCacheByNovelId.delete(novelId);
  novelContentVersionById.set(novelId, getCurrentNovelContentVersion(novelId) + 1);
}

export function resetNovelTextProjectionCacheForTests(): void {
  sourceCacheByNovelId.clear();
  derivedCacheByNovelId.clear();
  novelContentVersionById.clear();
}
