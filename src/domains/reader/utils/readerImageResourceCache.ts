import { readerApi } from '../api/readerApi';

const RELEASE_DELAY_MS = 10_000;

export interface ReaderImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

interface ReaderImageResourceEntry {
  dimensions?: ReaderImageDimensions | null;
  imageKey: string;
  isDecoded: boolean;
  isDisposed: boolean;
  novelId: number;
  url: string | null | undefined;
  refCount: number;
  loadPromise: Promise<string | null> | null;
  preloadPromise: Promise<void> | null;
  releaseTimerId: number | null;
}

function getCacheKey(novelId: number, imageKey: string): string {
  return `${novelId}:${imageKey}`;
}

const imageResourceCache = new Map<string, ReaderImageResourceEntry>();

function getOrCreateEntry(novelId: number, imageKey: string): ReaderImageResourceEntry {
  const cacheKey = getCacheKey(novelId, imageKey);
  const existing = imageResourceCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const nextEntry: ReaderImageResourceEntry = {
    imageKey,
    isDecoded: false,
    isDisposed: false,
    dimensions: undefined,
    novelId,
    url: undefined,
    refCount: 0,
    loadPromise: null,
    preloadPromise: null,
    releaseTimerId: null,
  };
  imageResourceCache.set(cacheKey, nextEntry);
  return nextEntry;
}

function clearReleaseTimer(entry: ReaderImageResourceEntry): void {
  if (entry.releaseTimerId !== null) {
    window.clearTimeout(entry.releaseTimerId);
    entry.releaseTimerId = null;
  }
}

function disposeEntry(cacheKey: string, entry: ReaderImageResourceEntry): void {
  entry.isDisposed = true;
  clearReleaseTimer(entry);
  if (entry.url) {
    URL.revokeObjectURL(entry.url);
  }
  imageResourceCache.delete(cacheKey);
}

function scheduleRelease(cacheKey: string, entry: ReaderImageResourceEntry): void {
  if (entry.releaseTimerId !== null || entry.refCount > 0 || entry.loadPromise) {
    return;
  }

  entry.releaseTimerId = window.setTimeout(() => {
    entry.releaseTimerId = null;
    if (entry.refCount > 0 || entry.loadPromise) {
      return;
    }

    disposeEntry(cacheKey, entry);
  }, RELEASE_DELAY_MS);
}

async function ensureLoaded(entry: ReaderImageResourceEntry): Promise<string | null> {
  if (entry.isDisposed) {
    return null;
  }

  clearReleaseTimer(entry);

  if (entry.url !== undefined) {
    return entry.url;
  }

  if (entry.loadPromise) {
    return entry.loadPromise;
  }

  const cacheKey = getCacheKey(entry.novelId, entry.imageKey);
  entry.loadPromise = readerApi.getImageBlob(entry.novelId, entry.imageKey)
    .then((blob) => {
      if (!blob) {
        entry.url = null;
        entry.isDecoded = true;
        return null;
      }

      if (entry.isDisposed) {
        return null;
      }

      const url = URL.createObjectURL(blob);
      if (entry.isDisposed) {
        URL.revokeObjectURL(url);
        return null;
      }

      entry.url = url;
      return url;
    })
    .finally(() => {
      entry.loadPromise = null;
      if (!entry.isDisposed && entry.refCount === 0) {
        scheduleRelease(cacheKey, entry);
      }
    });

  return entry.loadPromise;
}

async function decodeImage(url: string): Promise<ReaderImageDimensions | null> {
  const image = new Image();

  if (typeof image.decode === 'function') {
    try {
      image.src = url;
      await image.decode();
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        return {
          width: image.naturalWidth,
          height: image.naturalHeight,
          aspectRatio: image.naturalWidth / image.naturalHeight,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  return new Promise<ReaderImageDimensions | null>((resolve) => {
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          aspectRatio: image.naturalWidth / image.naturalHeight,
        });
        return;
      }
      resolve(null);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export async function acquireReaderImageResource(novelId: number, imageKey: string): Promise<string | null> {
  const entry = getOrCreateEntry(novelId, imageKey);
  entry.refCount += 1;

  try {
    return await ensureLoaded(entry);
  } catch (error) {
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0) {
      scheduleRelease(getCacheKey(novelId, imageKey), entry);
    }
    throw error;
  }
}

export function releaseReaderImageResource(novelId: number, imageKey: string): void {
  const cacheKey = getCacheKey(novelId, imageKey);
  const entry = imageResourceCache.get(cacheKey);
  if (!entry) {
    return;
  }

  entry.refCount = Math.max(0, entry.refCount - 1);
  if (entry.refCount === 0) {
    scheduleRelease(cacheKey, entry);
  }
}

export function peekReaderImageResource(novelId: number, imageKey: string): string | null | undefined {
  return imageResourceCache.get(getCacheKey(novelId, imageKey))?.url;
}

export function peekReaderImageDimensions(novelId: number, imageKey: string): ReaderImageDimensions | null | undefined {
  return imageResourceCache.get(getCacheKey(novelId, imageKey))?.dimensions;
}

export function areReaderImageResourcesReady(novelId: number, imageKeys: Iterable<string>): boolean {
  const uniqueImageKeys = new Set(imageKeys);

  for (const imageKey of uniqueImageKeys) {
    const entry = imageResourceCache.get(getCacheKey(novelId, imageKey));
    if (!entry || !entry.isDecoded || entry.url === undefined) {
      return false;
    }
  }

  return true;
}

export function preloadReaderImageResources(novelId: number, imageKeys: Iterable<string>): Promise<void> {
  const uniqueImageKeys = Array.from(new Set(imageKeys));

  return Promise.all(uniqueImageKeys.map(async (imageKey) => {
    const entry = getOrCreateEntry(novelId, imageKey);
    const cacheKey = getCacheKey(novelId, imageKey);
    entry.refCount += 1;

    try {
      const url = await ensureLoaded(entry);
      if (!url || entry.isDecoded) {
        return;
      }

      if (!entry.preloadPromise) {
        if (entry.isDisposed) {
          return;
        }

        entry.preloadPromise = decodeImage(url)
          .then((dimensions) => {
            entry.dimensions = dimensions;
            entry.isDecoded = true;
          })
          .catch(() => undefined)
          .finally(() => {
            entry.preloadPromise = null;
            if (!entry.isDisposed && entry.refCount === 0) {
              scheduleRelease(cacheKey, entry);
            }
          });
      }

      await entry.preloadPromise;
    } finally {
      entry.refCount = Math.max(0, entry.refCount - 1);
      if (!entry.isDisposed && entry.refCount === 0 && !entry.loadPromise && !entry.preloadPromise) {
        scheduleRelease(cacheKey, entry);
      }
    }
  })).then(() => undefined);
}

export function clearReaderImageResourcesForNovel(novelId: number): void {
  for (const [cacheKey, entry] of imageResourceCache.entries()) {
    if (entry.novelId === novelId) {
      disposeEntry(cacheKey, entry);
    }
  }
}

export function resetReaderImageResourceCacheForTests(): void {
  for (const [cacheKey, entry] of imageResourceCache.entries()) {
    disposeEntry(cacheKey, entry);
  }
}
