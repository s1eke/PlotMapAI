import type { ReaderContentRuntimeValue } from '@shared/contracts/reader';

const RELEASE_DELAY_MS = 10_000;

export interface ReaderImageBlobLoader {
  getImageBlob: ReaderContentRuntimeValue['getImageBlob'];
}

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
  const resourceEntry = entry;
  if (resourceEntry.releaseTimerId !== null) {
    window.clearTimeout(resourceEntry.releaseTimerId);
    resourceEntry.releaseTimerId = null;
  }
}

function disposeEntry(cacheKey: string, entry: ReaderImageResourceEntry): void {
  const resourceEntry = entry;
  resourceEntry.isDisposed = true;
  clearReleaseTimer(resourceEntry);
  if (resourceEntry.url) {
    URL.revokeObjectURL(resourceEntry.url);
  }
  imageResourceCache.delete(cacheKey);
}

function scheduleRelease(cacheKey: string, entry: ReaderImageResourceEntry): void {
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

    disposeEntry(cacheKey, resourceEntry);
  }, RELEASE_DELAY_MS);
}

async function ensureLoaded(
  imageBlobLoader: ReaderImageBlobLoader,
  entry: ReaderImageResourceEntry,
): Promise<string | null> {
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

  const cacheKey = getCacheKey(resourceEntry.novelId, resourceEntry.imageKey);
  resourceEntry.loadPromise = imageBlobLoader.getImageBlob(
    resourceEntry.novelId,
    resourceEntry.imageKey,
  )
    .then((blob) => {
      if (!blob) {
        resourceEntry.url = null;
        resourceEntry.isDecoded = true;
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
        scheduleRelease(cacheKey, resourceEntry);
      }
    });

  return resourceEntry.loadPromise;
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

export async function acquireReaderImageResource(
  imageBlobLoader: ReaderImageBlobLoader,
  novelId: number,
  imageKey: string,
): Promise<string | null> {
  const entry = getOrCreateEntry(novelId, imageKey);
  const resourceEntry = entry;
  resourceEntry.refCount += 1;

  try {
    return await ensureLoaded(imageBlobLoader, resourceEntry);
  } catch (error) {
    resourceEntry.refCount = Math.max(0, resourceEntry.refCount - 1);
    if (resourceEntry.refCount === 0) {
      scheduleRelease(getCacheKey(novelId, imageKey), resourceEntry);
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

  const resourceEntry = entry;
  resourceEntry.refCount = Math.max(0, resourceEntry.refCount - 1);
  if (resourceEntry.refCount === 0) {
    scheduleRelease(cacheKey, resourceEntry);
  }
}

export function peekReaderImageResource(
  novelId: number,
  imageKey: string,
): string | null | undefined {
  return imageResourceCache.get(getCacheKey(novelId, imageKey))?.url;
}

export function peekReaderImageDimensions(
  novelId: number,
  imageKey: string,
): ReaderImageDimensions | null | undefined {
  return imageResourceCache.get(getCacheKey(novelId, imageKey))?.dimensions;
}

export function areReaderImageResourcesReady(
  novelId: number,
  imageKeys: Iterable<string>,
): boolean {
  const uniqueImageKeys = new Set(imageKeys);

  for (const imageKey of uniqueImageKeys) {
    const entry = imageResourceCache.get(getCacheKey(novelId, imageKey));
    if (!entry || !entry.isDecoded || entry.url === undefined) {
      return false;
    }
  }

  return true;
}

export function preloadReaderImageResources(
  imageBlobLoader: ReaderImageBlobLoader,
  novelId: number,
  imageKeys: Iterable<string>,
): Promise<void> {
  const uniqueImageKeys = Array.from(new Set(imageKeys));

  return Promise.all(uniqueImageKeys.map(async (imageKey) => {
    const entry = getOrCreateEntry(novelId, imageKey);
    const cacheKey = getCacheKey(novelId, imageKey);
    entry.refCount += 1;

    try {
      const url = await ensureLoaded(imageBlobLoader, entry);
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
      if (
        !entry.isDisposed &&
        entry.refCount === 0 &&
        !entry.loadPromise &&
        !entry.preloadPromise
      ) {
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
