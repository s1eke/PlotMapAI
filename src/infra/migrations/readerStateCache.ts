import {
  readReaderStateCacheSnapshot,
  replaceReaderStateCacheSnapshot,
} from '@infra/storage/readerStateCache';

interface LegacyReaderStateCacheSnapshot {
  chapterIndex?: unknown;
  mode?: unknown;
  chapterProgress?: unknown;
  scrollPosition?: unknown;
  lastContentMode?: unknown;
  locatorVersion?: unknown;
  locator?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasLegacyReaderPosition(snapshot: LegacyReaderStateCacheSnapshot): boolean {
  return isFiniteNumber(snapshot.scrollPosition) || snapshot.locatorVersion !== undefined;
}

function resolveCanonicalMode(mode: unknown): 'scroll' | 'paged' | 'summary' {
  return mode === 'scroll' || mode === 'paged' || mode === 'summary'
    ? mode
    : 'scroll';
}

function resolveCanonicalLastContentMode(
  lastContentMode: unknown,
  mode: 'scroll' | 'paged' | 'summary',
): 'scroll' | 'paged' {
  if (lastContentMode === 'scroll' || lastContentMode === 'paged') {
    return lastContentMode;
  }

  return mode === 'paged' ? 'paged' : 'scroll';
}

export function migrateLegacyReaderStateCacheSnapshot(novelId: number): void {
  const snapshot = readReaderStateCacheSnapshot(novelId) as LegacyReaderStateCacheSnapshot | null;
  if (!snapshot || !hasLegacyReaderPosition(snapshot)) {
    return;
  }

  const {
    scrollPosition: _scrollPosition,
    locatorVersion: _locatorVersion,
    chapterProgress: _chapterProgress,
    ...nextSnapshot
  } = snapshot;
  const mode = resolveCanonicalMode(nextSnapshot.mode);

  replaceReaderStateCacheSnapshot(novelId, {
    ...nextSnapshot,
    mode,
    lastContentMode: resolveCanonicalLastContentMode(nextSnapshot.lastContentMode, mode),
  });
}
