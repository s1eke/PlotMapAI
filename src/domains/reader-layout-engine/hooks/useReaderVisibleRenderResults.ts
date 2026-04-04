import type {
  ReaderLayoutSignature,
  ReaderRenderVariant,
  ReaderTypographyMetrics,
  StaticPagedChapterTree,
  StaticScrollChapterTree,
  StaticSummaryShellTree,
} from '../utils/readerLayout';
import type { ReaderRenderCacheSource } from '../utils/readerRenderCache';
import type { ReaderVisibleRenderTarget } from '../utils/readerRenderCachePlanning';
import type { ReaderVisibleRenderResultsResult } from './readerRenderCacheTypes';

import { useEffect, useMemo } from 'react';
import { debugLog } from '@shared/debug';

import {
  buildStaticRenderTree,
  coercePagedTree,
  coerceScrollTree,
  coerceSummaryShellTree,
  getReaderRenderCacheEntryFromMemory,
  persistReaderRenderCacheEntry,
  primeReaderRenderCacheEntry,
} from '../utils/readerRenderCache';
import {
  buildChapterImageDimensionsMap,
  countPageItems,
  summarizeCacheSources,
} from '../utils/readerRenderCachePlanning';

interface VisibleRenderResult {
  entry: ReturnType<typeof buildStaticRenderTree>;
  exactKey: string;
  source: ReaderRenderCacheSource;
  variantFamily: ReaderRenderVariant;
}

interface UseReaderVisibleRenderResultsParams {
  activeVariant: ReaderRenderVariant;
  currentChapterIndex: number | null;
  novelId: number;
  preferRichScrollRendering: boolean;
  revisionKey: string;
  scrollChapterCount: number;
  typography: ReaderTypographyMetrics;
  variantSignatures: Record<ReaderRenderVariant, ReaderLayoutSignature>;
  visibleTargets: ReaderVisibleRenderTarget[];
}

export function useReaderVisibleRenderResults({
  activeVariant,
  currentChapterIndex,
  novelId,
  preferRichScrollRendering,
  revisionKey,
  scrollChapterCount,
  typography,
  variantSignatures,
  visibleTargets,
}: UseReaderVisibleRenderResultsParams): ReaderVisibleRenderResultsResult {
  const visibleResults = useMemo<VisibleRenderResult[]>(() => {
    if (revisionKey === '__never__') {
      return [];
    }

    return visibleTargets.map((target) => {
      const memoryEntry = getReaderRenderCacheEntryFromMemory({
        chapterIndex: target.chapter.index,
        contentHash: target.contentHash,
        contentFormat: target.contentFormat,
        contentVersion: target.contentVersion,
        layoutFeatureSet: target.layoutFeatureSet,
        layoutKey: target.layoutKey,
        novelId,
        rendererVersion: target.rendererVersion,
        variantFamily: target.variantFamily,
      });

      if (memoryEntry) {
        return {
          entry: memoryEntry,
          exactKey: target.exactKey,
          source: 'memory',
          variantFamily: target.variantFamily,
        };
      }

      return {
        entry: buildStaticRenderTree({
          chapter: target.chapter,
          imageDimensionsByKey: buildChapterImageDimensionsMap(novelId, target.chapter),
          layoutKey: target.layoutKey,
          layoutSignature: variantSignatures[target.variantFamily],
          novelId,
          preferRichScrollRendering,
          typography,
          variantFamily: target.variantFamily,
        }),
        exactKey: target.exactKey,
        source: 'built',
        variantFamily: target.variantFamily,
      };
    });
  }, [
    novelId,
    preferRichScrollRendering,
    revisionKey,
    typography,
    variantSignatures,
    visibleTargets,
  ]);

  useEffect(() => {
    for (const result of visibleResults) {
      if (result.source !== 'built') {
        continue;
      }

      primeReaderRenderCacheEntry(result.entry);
      persistReaderRenderCacheEntry(result.entry).catch((error) => {
        debugLog('READER', 'Visible render cache persistence failed', {
          chapterIndex: result.entry.chapterIndex,
          variantFamily: result.entry.variantFamily,
        }, error);
      });
    }
  }, [visibleResults]);

  const layoutMetrics = useMemo(() => {
    let scrollBlockCount = 0;
    let currentPagedPageCount = 0;
    let currentPagedPageItemCount = 0;
    const visibleCacheSources = summarizeCacheSources(
      visibleResults.map((result) => result.source),
    );

    for (const result of visibleResults) {
      if (result.variantFamily === 'original-scroll') {
        const tree = coerceScrollTree(result.entry);
        if (tree) {
          scrollBlockCount += tree.metrics.length;
        }
        continue;
      }

      if (result.variantFamily === 'original-paged' && result.entry.chapterIndex === currentChapterIndex) {
        const tree = coercePagedTree(result.entry);
        if (tree) {
          currentPagedPageCount = tree.pageSlices.length;
          currentPagedPageItemCount = countPageItems(tree);
        }
      }
    }

    return {
      currentPagedPageCount,
      currentPagedPageItemCount,
      scrollBlockCount,
      visibleCacheSources,
    };
  }, [currentChapterIndex, visibleResults]);

  const pagedLayouts = useMemo(() => {
    const layouts = new Map<number, StaticPagedChapterTree>();

    for (const result of visibleResults) {
      const tree = coercePagedTree(result.entry);
      if (tree) {
        layouts.set(result.entry.chapterIndex, tree);
      }
    }

    return layouts;
  }, [visibleResults]);

  const scrollLayouts = useMemo(() => {
    const layouts = new Map<number, StaticScrollChapterTree>();

    for (const result of visibleResults) {
      const tree = coerceScrollTree(result.entry);
      if (tree) {
        layouts.set(result.entry.chapterIndex, tree);
      }
    }

    return layouts;
  }, [visibleResults]);

  const summaryShells = useMemo(() => {
    const shells = new Map<number, StaticSummaryShellTree>();

    for (const result of visibleResults) {
      const tree = coerceSummaryShellTree(result.entry);
      if (tree) {
        shells.set(result.entry.chapterIndex, tree);
      }
    }

    return shells;
  }, [visibleResults]);

  const cacheSourceByKey = useMemo(() => {
    const sources = new Map<string, ReaderRenderCacheSource>();

    for (const result of visibleResults) {
      sources.set(result.exactKey, result.source);
    }

    return sources;
  }, [visibleResults]);

  const layoutSnapshot = useMemo(() => {
    const activeTarget = visibleTargets.find(
      (target) => target.chapter.index === currentChapterIndex,
    )
      ?? visibleTargets[0]
      ?? null;

    return {
      activeVariant,
      activeContentFormat: activeTarget?.contentFormat ?? null,
      activeContentVersion: activeTarget?.contentVersion ?? null,
      activeLayoutFeatureSet: activeTarget?.layoutFeatureSet ?? null,
      activeRendererVersion: activeTarget?.rendererVersion ?? null,
      cacheModel: 'layered-render-cache' as const,
      currentPagedPageCount: layoutMetrics.currentPagedPageCount,
      currentPagedPageItemCount: layoutMetrics.currentPagedPageItemCount,
      scrollBlockCount: layoutMetrics.scrollBlockCount,
      scrollChapterCount,
      visibleCacheSources: {
        built: layoutMetrics.visibleCacheSources.built,
        dexie: layoutMetrics.visibleCacheSources.dexie,
        memory: layoutMetrics.visibleCacheSources.memory,
      },
    };
  }, [
    activeVariant,
    currentChapterIndex,
    layoutMetrics.currentPagedPageCount,
    layoutMetrics.currentPagedPageItemCount,
    layoutMetrics.scrollBlockCount,
    layoutMetrics.visibleCacheSources.built,
    layoutMetrics.visibleCacheSources.dexie,
    layoutMetrics.visibleCacheSources.memory,
    scrollChapterCount,
    visibleTargets,
  ]);

  return {
    cacheSourceByKey,
    layoutSnapshot,
    pagedLayouts,
    scrollLayouts,
    summaryShells,
  };
}
