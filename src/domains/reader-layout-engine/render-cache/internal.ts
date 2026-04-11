export type {
  ReaderLayoutSnapshot,
  ReaderRenderPreheaterResult,
  ReaderRenderViewportResult,
  ReaderVisibleRenderResultsResult,
  UseReaderRenderCacheParams,
  UseReaderRenderCacheResult,
} from '../hooks/readerRenderCacheTypes';
export { useReaderRenderCache } from '../hooks/useReaderRenderCache';
export { useReaderRenderPreheater } from '../hooks/useReaderRenderPreheater';
export { useReaderRenderViewport } from '../hooks/useReaderRenderViewport';
export { useReaderVisibleRenderResults } from '../hooks/useReaderVisibleRenderResults';
export {
  buildChapterImageDimensionsMap,
  buildChapterImageLayoutKey,
  buildPreheatTargets,
  buildVisibleRenderTargets,
  collectLoadedImageKeys,
  countPageItems,
  getActiveVariant,
  summarizeCacheSources,
} from '../utils/readerRenderCachePlanning';
export type {
  ReaderRenderPreheatTarget,
  ReaderVisibleRenderTarget,
  ScrollRenderMode,
} from '../utils/readerRenderCachePlanning';
export {
  buildStaticRenderManifest,
  buildStaticRenderTree,
  clearReaderRenderCacheMemoryForNovel,
  coercePagedTree,
  coerceScrollTree,
  coerceSummaryShellTree,
  deletePersistedReaderRenderCache,
  getReaderRenderCacheEntryFromMemory,
  getReaderRenderCacheRecordFromDexie,
  isMaterializedReaderRenderCacheEntry,
  persistReaderRenderCacheEntry,
  primeReaderRenderCacheEntry,
  READER_RENDERER_VERSION,
  resolveReaderLayoutFeatureSet,
  warmReaderRenderImages,
} from '../utils/readerRenderCache';
export type {
  ReaderLayoutFeatureSet,
  ReaderRenderCacheSource,
} from '../utils/readerRenderCache';
