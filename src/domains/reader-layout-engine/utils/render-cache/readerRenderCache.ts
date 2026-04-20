import type { ChapterContent } from '@shared/contracts/reader';
import type { ReaderImageDimensions } from '@domains/reader-media';
import type {
  ReaderLayoutSignature,
  ReaderRenderVariant,
  ReaderTypographyMetrics,
  StaticChapterRenderTree,
} from '../layout/readerLayout';

import {
  buildStaticPagedChapterTree,
  buildStaticScrollChapterTree,
  buildStaticSummaryShellTree,
  createScrollImageLayoutConstraints,
  estimateReaderRenderQueryManifest,
} from '../layout/readerLayout';
import type { ReaderRenderCacheEntry, ReaderRenderCacheManifestEntry } from './readerRenderCacheCore';

export {
  buildReaderRenderCacheKey,
  READER_RENDER_CACHE_PERSISTED_LIMIT,
  READER_RENDER_CACHE_TTL_MS,
  READER_RENDERER_VERSION,
  resolveReaderLayoutFeatureSet,
} from './readerRenderCacheCore';
export type {
  ReaderLayoutFeatureSet,
  ReaderRenderCacheEntry,
  ReaderRenderCacheLookupParams,
  ReaderRenderCacheManifestEntry,
  ReaderRenderCacheRecord,
  ReaderRenderCacheRecordBase,
  ReaderRenderCacheSource,
  ReaderRenderStorageKind,
} from './readerRenderCacheCore';
export {
  coercePagedTree,
  coerceScrollTree,
  coerceSummaryShellTree,
  createReaderRenderCacheEntry,
  createReaderRenderCacheManifestEntry,
  warmReaderRenderImages,
} from './readerRenderCacheEntries';
export {
  clearReaderRenderCacheMemoryForNovel,
  deletePersistedReaderRenderCache,
  getReaderRenderCacheEntryFromDexie,
  getReaderRenderCacheEntryFromMemory,
  getReaderRenderCacheRecordFromDexie,
  isMaterializedReaderRenderCacheEntry,
  persistReaderRenderCacheEntry,
  primeReaderRenderCacheEntry,
} from './readerRenderCacheStorage';
import {
  createReaderRenderCacheEntry,
  createReaderRenderCacheManifestEntry,
} from './readerRenderCacheEntries';
import { resolveReaderLayoutFeatureSet } from './readerRenderCacheCore';

export function buildStaticRenderTree(params: {
  chapter: ChapterContent;
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>;
  layoutKey?: string;
  layoutSignature: ReaderLayoutSignature;
  novelId: number;
  preferRichScrollRendering?: boolean;
  typography: ReaderTypographyMetrics;
  variantFamily: ReaderRenderVariant;
}): ReaderRenderCacheEntry {
  const layoutFeatureSet = resolveReaderLayoutFeatureSet({
    chapter: params.chapter,
    preferRichScrollRendering: params.preferRichScrollRendering,
    variantFamily: params.variantFamily,
  });
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
      undefined,
      params.preferRichScrollRendering,
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
    layoutFeatureSet,
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
    contentFormat: entry.contentFormat,
    contentVersion: entry.contentVersion,
    layoutFeatureSet: entry.layoutFeatureSet,
    layoutKey: entry.layoutKey,
    layoutSignature: entry.layoutSignature,
    novelId: entry.novelId,
    queryManifest: entry.queryManifest,
    rendererVersion: entry.rendererVersion,
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
  preferRichScrollRendering?: boolean;
  typography: ReaderTypographyMetrics;
  variantFamily: ReaderRenderVariant;
}): ReaderRenderCacheManifestEntry {
  const layoutFeatureSet = resolveReaderLayoutFeatureSet({
    chapter: params.chapter,
    preferRichScrollRendering: params.preferRichScrollRendering,
    variantFamily: params.variantFamily,
  });
  return createReaderRenderCacheManifestEntry({
    chapter: params.chapter,
    layoutFeatureSet,
    layoutKey: params.layoutKey,
    layoutSignature: params.layoutSignature,
    novelId: params.novelId,
    queryManifest: estimateReaderRenderQueryManifest({
      chapter: params.chapter,
      imageDimensionsByKey: params.imageDimensionsByKey,
      layoutSignature: params.layoutSignature,
      preferRichScrollRendering: params.preferRichScrollRendering,
      typography: params.typography,
      variantFamily: params.variantFamily,
    }),
    variantFamily: params.variantFamily,
  });
}
