import type { CoverImageRecord } from '@infra/db/library';

import { db } from '@infra/db';

const RELEASE_DELAY_MS = 10_000;

interface NovelCoverResourceEntry {
  novelId: number;
  url: string | null | undefined;
  refCount: number;
  loadPromise: Promise<string | null> | null;
  releaseTimerId: number | null;
  isDisposed: boolean;
}

const coverResourceCache = new Map<number, NovelCoverResourceEntry>();

async function loadCoverBlob(novelId: number): Promise<Blob | null> {
  const cover = await db.coverImages
    .where('novelId')
    .equals(novelId)
    .first() as CoverImageRecord | undefined;

  return cover?.blob ?? null;
}

function getOrCreateEntry(novelId: number): NovelCoverResourceEntry {
  const existing = coverResourceCache.get(novelId);
  if (existing) {
    return existing;
  }

  const entry: NovelCoverResourceEntry = {
    novelId,
    url: undefined,
    refCount: 0,
    loadPromise: null,
    releaseTimerId: null,
    isDisposed: false,
  };
  coverResourceCache.set(novelId, entry);
  return entry;
}

function clearReleaseTimer(entry: NovelCoverResourceEntry): void {
  const resourceEntry = entry;
  if (resourceEntry.releaseTimerId !== null) {
    window.clearTimeout(resourceEntry.releaseTimerId);
    resourceEntry.releaseTimerId = null;
  }
}

function disposeEntry(novelId: number, entry: NovelCoverResourceEntry): void {
  const resourceEntry = entry;
  resourceEntry.isDisposed = true;
  clearReleaseTimer(resourceEntry);
  if (resourceEntry.url) {
    URL.revokeObjectURL(resourceEntry.url);
  }
  coverResourceCache.delete(novelId);
}

function scheduleRelease(novelId: number, entry: NovelCoverResourceEntry): void {
  const resourceEntry = entry;
  if (
    resourceEntry.releaseTimerId !== null
    || resourceEntry.refCount > 0
    || resourceEntry.loadPromise
  ) {
    return;
  }

  resourceEntry.releaseTimerId = window.setTimeout(() => {
    resourceEntry.releaseTimerId = null;
    if (resourceEntry.refCount > 0 || resourceEntry.loadPromise) {
      return;
    }

    disposeEntry(novelId, resourceEntry);
  }, RELEASE_DELAY_MS);
}

async function ensureLoaded(entry: NovelCoverResourceEntry): Promise<string | null> {
  const resourceEntry = entry;
  if (resourceEntry.isDisposed) {
    return null;
  }

  clearReleaseTimer(resourceEntry);

  if (resourceEntry.url !== undefined) {
    return resourceEntry.url;
  }

  if (resourceEntry.loadPromise) {
    return resourceEntry.loadPromise;
  }

  resourceEntry.loadPromise = loadCoverBlob(resourceEntry.novelId)
    .then((blob) => {
      if (!blob) {
        resourceEntry.url = null;
        return null;
      }

      if (resourceEntry.isDisposed) {
        return null;
      }

      const url = URL.createObjectURL(blob);
      if (resourceEntry.isDisposed) {
        URL.revokeObjectURL(url);
        return null;
      }

      resourceEntry.url = url;
      return url;
    })
    .finally(() => {
      resourceEntry.loadPromise = null;
      if (!resourceEntry.isDisposed && resourceEntry.refCount === 0) {
        scheduleRelease(resourceEntry.novelId, resourceEntry);
      }
    });

  return resourceEntry.loadPromise;
}

export async function acquireNovelCoverResource(novelId: number): Promise<string | null> {
  const entry = getOrCreateEntry(novelId);
  entry.refCount += 1;

  try {
    return await ensureLoaded(entry);
  } catch (error) {
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0) {
      scheduleRelease(novelId, entry);
    }
    throw error;
  }
}

export function releaseNovelCoverResource(novelId: number): void {
  const entry = coverResourceCache.get(novelId);
  if (!entry) {
    return;
  }

  entry.refCount = Math.max(0, entry.refCount - 1);
  if (entry.refCount === 0) {
    scheduleRelease(novelId, entry);
  }
}

export function peekNovelCoverResource(novelId: number): string | null | undefined {
  return coverResourceCache.get(novelId)?.url;
}

export function clearNovelCoverResourcesForNovel(novelId: number): void {
  const entry = coverResourceCache.get(novelId);
  if (!entry) {
    return;
  }

  disposeEntry(novelId, entry);
}

export function resetNovelCoverResourceCacheForTests(): void {
  for (const [novelId, entry] of coverResourceCache.entries()) {
    disposeEntry(novelId, entry);
  }
}
