import type { RefObject } from 'react';
import type { Chapter, ChapterContent } from '../readerContentService';
import type {
  ReaderLayoutSignature,
  ReaderRenderVariant,
  ReaderTypographyMetrics,
  ReaderViewportMetrics,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  StaticSummaryShellTree,
} from '../utils/readerLayout';
import type { ReaderRenderCacheSource } from '../utils/readerRenderCache';

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
  cacheModel: 'layered-render-cache';
  currentPagedPageCount: number;
  currentPagedPageItemCount: number;
  scrollBlockCount: number;
  scrollChapterCount: number;
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
