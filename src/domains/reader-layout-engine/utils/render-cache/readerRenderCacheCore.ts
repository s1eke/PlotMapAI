import type { ChapterContent } from '@shared/contracts/reader';
import type {
  ReaderLayoutSignature,
  ReaderRenderQueryManifest,
  ReaderRenderVariant,
  StaticChapterRenderTree,
} from '../layout/readerLayout';

import { shouldUseRichScrollBlocks } from '../layout/richScroll';

export const READER_RENDER_CACHE_PERSISTED_LIMIT = 240;
export const READER_RENDER_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const READER_RENDERER_VERSION = 7;

export type ReaderRenderCacheSource = 'memory' | 'dexie' | 'built';
export type ReaderRenderStorageKind = 'render-tree' | 'manifest';
export type ReaderLayoutFeatureSet =
  | 'scroll-plain'
  | 'scroll-rich-inline'
  | 'paged-pagination-block'
  | 'summary-shell';

export interface ReaderRenderCacheRecordBase {
  chapterIndex: number;
  contentHash: string;
  contentFormat: ChapterContent['contentFormat'];
  contentVersion: number;
  layoutFeatureSet: ReaderLayoutFeatureSet;
  layoutKey: string;
  layoutSignature: ReaderLayoutSignature;
  novelId: number;
  queryManifest: ReaderRenderQueryManifest;
  rendererVersion: number;
  storageKind: ReaderRenderStorageKind;
  updatedAt: string;
  variantFamily: ReaderRenderVariant;
}

export interface ReaderRenderCacheEntry<
  TTree extends StaticChapterRenderTree = StaticChapterRenderTree,
> extends ReaderRenderCacheRecordBase {
  storageKind: 'render-tree';
  tree: TTree;
}

export interface ReaderRenderCacheManifestEntry extends ReaderRenderCacheRecordBase {
  storageKind: 'manifest';
  tree: null;
}

export type ReaderRenderCacheRecord<
  TTree extends StaticChapterRenderTree = StaticChapterRenderTree,
> =
  | ReaderRenderCacheEntry<TTree>
  | ReaderRenderCacheManifestEntry;

export interface ReaderRenderCacheLookupParams {
  chapterIndex: number;
  contentHash: string;
  contentFormat: ChapterContent['contentFormat'];
  contentVersion: number;
  layoutFeatureSet: ReaderLayoutFeatureSet;
  layoutKey: string;
  novelId: number;
  rendererVersion: number;
  variantFamily: ReaderRenderVariant;
}

export function buildFamilyKey(params: {
  chapterIndex: number;
  novelId: number;
  variantFamily: ReaderRenderVariant;
}): string {
  return `${params.novelId}:${params.chapterIndex}:${params.variantFamily}`;
}

export function resolveReaderLayoutFeatureSet(params: {
  chapter: Pick<ChapterContent, 'contentFormat' | 'richBlocks'>;
  preferRichScrollRendering?: boolean;
  variantFamily: ReaderRenderVariant;
}): ReaderLayoutFeatureSet {
  if (params.variantFamily === 'summary-shell') {
    return 'summary-shell';
  }

  if (params.variantFamily === 'original-paged') {
    return 'paged-pagination-block';
  }

  return shouldUseRichScrollBlocks(
    params.chapter,
    params.preferRichScrollRendering,
  )
    ? 'scroll-rich-inline'
    : 'scroll-plain';
}

export function buildReaderRenderCacheKey(params: ReaderRenderCacheLookupParams): string {
  return [
    buildFamilyKey(params),
    params.contentFormat,
    params.contentVersion,
    params.rendererVersion,
    params.layoutFeatureSet,
    params.layoutKey,
    params.contentHash,
  ].join(':');
}
