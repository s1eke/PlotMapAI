import type {
  ReaderLayoutFeatureSet,
} from '../render-cache/readerRenderCacheCore';
import type {
  ReaderLayoutSignature,
  ReaderLocator,
  ReaderRenderVariant,
} from '../layout/readerLayoutTypes';

export type ChapterFlowManifestStatus = 'estimated' | 'materialized' | 'stale' | 'missing';

export interface ChapterFlowBlockSummary {
  blockIndex: number;
  blockKey?: string;
  endLocator: ReaderLocator | null;
  height: number;
  kind: 'heading' | 'text' | 'image' | 'blank';
  lineCount?: number;
  pageEnd?: number;
  pageStart?: number;
  startLocator: ReaderLocator | null;
  startOffset: number;
}

export interface ChapterFlowManifest {
  blockCount: number;
  blockSummaries: ChapterFlowBlockSummary[];
  chapterIndex: number;
  chapterKey?: string;
  contentHash: string;
  contentVersion?: number;
  endLocator: ReaderLocator | null;
  layoutFeatureSet?: ReaderLayoutFeatureSet;
  layoutKey: string;
  layoutSignature: ReaderLayoutSignature;
  pageCount: number;
  rendererVersion?: number;
  scrollHeight: number;
  sourceVariants?: ReaderRenderVariant[];
  startLocator: ReaderLocator | null;
  status: ChapterFlowManifestStatus;
}

export interface NovelFlowChapterEntry {
  blockSummaries: ChapterFlowBlockSummary[];
  chapterIndex: number;
  chapterKey?: string;
  endLocator: ReaderLocator | null;
  manifestStatus: ChapterFlowManifestStatus;
  pageEnd: number;
  pageStart: number;
  scrollEnd: number;
  scrollStart: number;
  startLocator: ReaderLocator | null;
}

export interface NovelFlowIndex {
  chapters: NovelFlowChapterEntry[];
  layoutKey: string;
  layoutSignature: ReaderLayoutSignature;
  novelId: number;
  totalPageCount: number;
  totalScrollHeight: number;
}

export interface GlobalScrollPosition {
  chapterIndex: number;
  chapterProgress: number;
  globalOffset: number;
  localOffset: number;
}

export interface GlobalPagedPosition {
  chapterIndex: number;
  globalPageIndex: number;
  localPageIndex: number;
  locator: ReaderLocator | null;
}

export interface ChapterFlowManifestIdentity {
  contentHash?: string;
  layoutFeatureSet?: ReaderLayoutFeatureSet;
  layoutKey?: string;
  rendererVersion?: number;
}
