import type { PersistedReadingProgress, StoredReaderState } from '@shared/contracts/reader';

import {
  buildPersistedReadingProgress,
  createLegacyPersistedReadingProgress,
  sanitizePersistedReadingProgress,
} from '@shared/utils/readerPersistedProgress';
import { sanitizeStoredReaderState } from '@shared/utils/readerStoredState';

import { CACHE_KEYS, storage } from './index';

const READER_BOOTSTRAP_SNAPSHOT_VERSION = 3 as const;

export interface ReaderBootstrapSnapshot {
  version: typeof READER_BOOTSTRAP_SNAPSHOT_VERSION;
  progress: PersistedReadingProgress;
}

function parseStoredReaderBootstrapState(raw: unknown): StoredReaderState | null {
  return sanitizeStoredReaderState(raw);
}

function parseReaderBootstrapSnapshot(raw: unknown): ReaderBootstrapSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = raw as Record<string, unknown>;
  if (parsed.version === 2) {
    const state = parseStoredReaderBootstrapState(parsed.state);
    if (!state) {
      return null;
    }

    return {
      version: READER_BOOTSTRAP_SNAPSHOT_VERSION,
      progress: createLegacyPersistedReadingProgress(state),
    };
  }

  if (parsed.version !== READER_BOOTSTRAP_SNAPSHOT_VERSION) {
    return null;
  }

  const progress = sanitizePersistedReadingProgress(parsed.progress);
  if (!progress) {
    return null;
  }

  return {
    version: READER_BOOTSTRAP_SNAPSHOT_VERSION,
    progress,
  };
}

export function readReaderBootstrapSnapshot(
  novelId: number,
): ReaderBootstrapSnapshot | null {
  if (!novelId) {
    return null;
  }

  return parseReaderBootstrapSnapshot(
    storage.cache.getJson<unknown>(CACHE_KEYS.readerBootstrap(novelId)),
  );
}

export function writeReaderBootstrapSnapshot(
  novelId: number,
  progress: PersistedReadingProgress,
): void {
  if (!novelId) {
    return;
  }

  storage.cache.set(CACHE_KEYS.readerBootstrap(novelId), {
    version: READER_BOOTSTRAP_SNAPSHOT_VERSION,
    progress: buildPersistedReadingProgress(progress),
  } satisfies ReaderBootstrapSnapshot);
}

export function clearReaderBootstrapSnapshot(novelId: number): void {
  if (!novelId) {
    return;
  }

  storage.cache.remove(CACHE_KEYS.readerBootstrap(novelId));
}
