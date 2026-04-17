import type { RefObject } from 'react';
import type { Chapter, ChapterContent } from '@shared/contracts/reader';
import type {
  ReaderLayoutSignature,
  ReaderRenderVariant,
  ReaderTypographyMetrics,
  ReaderViewportMetrics,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  StaticSummaryShellTree,
} from '../layout-core/internal';
import type {
  ReaderLayoutFeatureSet,
  ReaderRenderCacheSource,
} from '../utils/render-cache/readerRenderCache';

export interface UseReaderRenderCacheParams {
  chapters: Chapter[];
  contentRef: RefObject<HTMLDivElement | null>;
  currentChapter: ChapterContent | null;
  fetchChapterContent: (
    index: number,
    options?: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    },
  ) => Promise<ChapterContent>;
  fontSize: number;
  isPagedMode: boolean;
  lineSpacing: number;
  novelId: number;
  pagedChapters: ChapterContent[];
  pagedViewportElement: HTMLDivElement | null;
  paragraphSpacing: number;
  scrollChapters: Array<{ chapter: ChapterContent; index: number }>;
  viewMode: 'original' | 'summary';
}

export interface UseReaderRenderCacheResult {
  pagedLayouts: Map<number, StaticPagedChapterTree>;
  scrollLayouts: Map<number, StaticScrollChapterTree>;
  summaryShells: Map<number, StaticSummaryShellTree>;
  typography: ReaderTypographyMetrics;
  viewportMetrics: ReaderViewportMetrics;
  cacheSourceByKey: Map<string, ReaderRenderCacheSource>;
  isPreheating: boolean;
  pendingPreheatCount: number;
}

export interface ReaderVisibleLayoutSnapshot {
  activeVariant: ReaderRenderVariant;
  activeContentFormat: ChapterContent['contentFormat'] | null;
  activeContentVersion: number | null;
  activeLayoutFeatureSet: ReaderLayoutFeatureSet | null;
  activeRendererVersion: number | null;
  cacheModel: 'layered-render-cache';
  contentFormat: ChapterContent['contentFormat'] | null;
  contentVersion: number | null;
  currentPagedPageCount: number;
  currentPagedPageItemCount: number;
  layoutFeatureSet: ReaderLayoutFeatureSet | null;
  novelId: number;
  pagedDowngradeCount: number;
  pagedFallbackCount: number;
  rendererVersion: number | null;
  richBlockCount: number;
  scrollBlockCount: number;
  scrollChapterCount: number;
  unsupportedBlockCount: number;
  visibleCacheSources: Record<ReaderRenderCacheSource, number>;
}

export interface ReaderLayoutSnapshot extends ReaderVisibleLayoutSnapshot {
  pendingPreheatCount: number;
}

export interface ReaderRenderViewportResult {
  typography: ReaderTypographyMetrics;
  variantSignatures: Record<ReaderRenderVariant, ReaderLayoutSignature>;
  viewportMetrics: ReaderViewportMetrics;
}

export interface ReaderVisibleRenderResultsResult {
  cacheSourceByKey: Map<string, ReaderRenderCacheSource>;
  layoutSnapshot: ReaderVisibleLayoutSnapshot;
  pagedLayouts: Map<number, StaticPagedChapterTree>;
  scrollLayouts: Map<number, StaticScrollChapterTree>;
  summaryShells: Map<number, StaticSummaryShellTree>;
}

export interface ReaderRenderPreheaterResult {
  isPreheating: boolean;
  pendingPreheatCount: number;
}
