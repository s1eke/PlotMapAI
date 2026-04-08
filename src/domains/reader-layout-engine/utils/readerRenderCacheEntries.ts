import type { ChapterContent, ReaderContentRuntimeValue } from '@shared/contracts/reader';
import { preloadReaderImageResources } from '@domains/reader-media';
import type {
  ReaderLayoutSignature,
  ReaderRenderQueryManifest,
  ReaderRenderVariant,
  StaticChapterRenderTree,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  StaticSummaryShellTree,
} from './readerLayout';
import type {
  ReaderLayoutFeatureSet,
  ReaderRenderCacheEntry,
  ReaderRenderCacheManifestEntry,
} from './readerRenderCacheCore';

import { extractImageKeysFromChapter } from '@shared/text-processing';
import {
  createChapterContentHash,
  createReaderRenderQueryManifest,
  serializeReaderLayoutSignature,
} from './readerLayout';
import { READER_RENDERER_VERSION } from './readerRenderCacheCore';

export function createReaderRenderCacheEntry<TTree extends StaticChapterRenderTree>(params: {
  chapter: ChapterContent;
  layoutFeatureSet: ReaderLayoutFeatureSet;
  layoutKey?: string;
  layoutSignature: ReaderLayoutSignature;
  tree: TTree;
  variantFamily: ReaderRenderVariant;
}): ReaderRenderCacheEntry<TTree> {
  return {
    chapterIndex: params.chapter.index,
    contentHash: createChapterContentHash(params.chapter),
    contentFormat: params.chapter.contentFormat,
    contentVersion: params.chapter.contentVersion,
    layoutFeatureSet: params.layoutFeatureSet,
    layoutKey: params.layoutKey ?? serializeReaderLayoutSignature(params.layoutSignature),
    layoutSignature: params.layoutSignature,
    novelId: 0,
    queryManifest: createReaderRenderQueryManifest(params.variantFamily, params.tree),
    rendererVersion: READER_RENDERER_VERSION,
    storageKind: 'render-tree',
    tree: params.tree,
    updatedAt: new Date().toISOString(),
    variantFamily: params.variantFamily,
  };
}

export function createReaderRenderCacheManifestEntry(params: {
  chapter: Pick<
    ChapterContent,
    'contentFormat' | 'contentVersion' | 'index' | 'plainText' | 'richBlocks' | 'title'
  >;
  layoutFeatureSet: ReaderLayoutFeatureSet;
  layoutKey?: string;
  layoutSignature: ReaderLayoutSignature;
  novelId: number;
  queryManifest: ReaderRenderQueryManifest;
  variantFamily: ReaderRenderVariant;
}): ReaderRenderCacheManifestEntry {
  return {
    chapterIndex: params.chapter.index,
    contentHash: createChapterContentHash(params.chapter),
    contentFormat: params.chapter.contentFormat,
    contentVersion: params.chapter.contentVersion,
    layoutFeatureSet: params.layoutFeatureSet,
    layoutKey: params.layoutKey ?? serializeReaderLayoutSignature(params.layoutSignature),
    layoutSignature: params.layoutSignature,
    novelId: params.novelId,
    queryManifest: params.queryManifest,
    rendererVersion: READER_RENDERER_VERSION,
    storageKind: 'manifest',
    tree: null,
    updatedAt: new Date().toISOString(),
    variantFamily: params.variantFamily,
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

export async function warmReaderRenderImages(
  readerContentRuntime: Pick<ReaderContentRuntimeValue, 'getImageBlob'>,
  novelId: number,
  chapter: Pick<ChapterContent, 'contentFormat' | 'plainText' | 'richBlocks'>,
): Promise<void> {
  const imageKeys = extractImageKeysFromChapter(chapter);
  if (imageKeys.length === 0) {
    return;
  }

  await preloadReaderImageResources(readerContentRuntime, novelId, imageKeys);
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
