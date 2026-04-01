import type { Chapter, ChapterContent } from '../api/readerApi';
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
import type { ReaderRenderStorageKind } from '../utils/readerRenderCache';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  debugFeatureSubscribe,
  debugLog,
  isDebugFeatureEnabled,
} from '@app/debug/service';

import { extractImageKeysFromText } from '../utils/chapterImages';
import {
  createChapterContentHash,
  createReaderLayoutSignature,
  createReaderTypographyMetrics,
  createReaderViewportMetrics,
  getPagedContentHeight,
  serializeReaderLayoutSignature,
} from '../utils/readerLayout';
import {
  buildReaderRenderCacheKey,
  buildStaticRenderManifest,
  buildStaticRenderTree,
  clearReaderRenderCacheMemoryForNovel,
  coercePagedTree,
  coerceScrollTree,
  coerceSummaryShellTree,
  getReaderRenderCacheRecordFromDexie,
  getReaderRenderCacheEntryFromMemory,
  isMaterializedReaderRenderCacheEntry,
  persistReaderRenderCacheEntry,
  primeReaderRenderCacheEntry,
  warmReaderRenderImages,
} from '../utils/readerRenderCache';
import {
  peekReaderImageDimensions,
  preloadReaderImageResources,
} from '../utils/readerImageResourceCache';

interface UseReaderRenderCacheParams {
  chapters: Chapter[];
  contentRef: React.RefObject<HTMLDivElement | null>;
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

interface UseReaderRenderCacheResult {
  pagedLayouts: Map<number, StaticPagedChapterTree>;
  scrollLayouts: Map<number, StaticScrollChapterTree>;
  summaryShells: Map<number, StaticSummaryShellTree>;
  typography: ReaderTypographyMetrics;
  viewportMetrics: ReaderViewportMetrics;
  cacheSourceByKey: Map<string, ReaderRenderCacheSource>;
  isPreheating: boolean;
  pendingPreheatCount: number;
}

interface ViewportSize {
  height: number;
  width: number;
}

interface VisibleRenderTarget {
  chapter: ChapterContent;
  exactKey: string;
  variantFamily: ReaderRenderVariant;
}

interface VisibleRenderResult {
  entry: ReturnType<typeof buildStaticRenderTree>;
  exactKey: string;
  source: ReaderRenderCacheSource;
  variantFamily: ReaderRenderVariant;
}

interface PreheatTarget {
  chapterIndex: number;
  storageKind: ReaderRenderStorageKind;
  variantFamily: ReaderRenderVariant;
}

interface ReaderVisibleLayoutSnapshot {
  activeVariant: ReaderRenderVariant;
  cacheModel: 'layered-render-cache';
  currentPagedPageCount: number;
  currentPagedPageItemCount: number;
  scrollBlockCount: number;
  scrollChapterCount: number;
  visibleCacheSources: Record<ReaderRenderCacheSource, number>;
}

interface ReaderLayoutSnapshot extends ReaderVisibleLayoutSnapshot {
  pendingPreheatCount: number;
}

const EMPTY_VIEWPORT_SIZE: ViewportSize = {
  height: 0,
  width: 0,
};
const FALLBACK_VIEWPORT_HEIGHT = 800;
const FALLBACK_VIEWPORT_WIDTH = 1024;
const RENDER_VARIANTS: ReaderRenderVariant[] = [
  'original-scroll',
  'original-paged',
  'summary-shell',
];
const EMPTY_CACHE_SOURCE_COUNTS: Record<ReaderRenderCacheSource, number> = {
  built: 0,
  dexie: 0,
  memory: 0,
};

function readViewportSize(element: HTMLDivElement): ViewportSize {
  const rect = element.getBoundingClientRect();
  return {
    height: element.clientHeight || rect.height || FALLBACK_VIEWPORT_HEIGHT,
    width: element.clientWidth || rect.width || FALLBACK_VIEWPORT_WIDTH,
  };
}

function scheduleIdleTask(callback: () => void): number {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(() => {
      callback();
    });
  }

  return window.setTimeout(callback, 16);
}

function cancelIdleTask(handle: number): void {
  if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle);
    return;
  }

  window.clearTimeout(handle);
}

function buildChapterImageDimensionsMap(
  novelId: number,
  chapter: ChapterContent,
): Map<string, ReturnType<typeof peekReaderImageDimensions>> {
  const dimensions = new Map<string, ReturnType<typeof peekReaderImageDimensions>>();
  for (const imageKey of extractImageKeysFromText(chapter.content)) {
    dimensions.set(imageKey, peekReaderImageDimensions(novelId, imageKey));
  }
  return dimensions;
}

function buildChapterImageLayoutKey(
  novelId: number,
  chapter: Pick<ChapterContent, 'content'>,
  baseLayoutKey: string,
): string {
  const imageKeys = extractImageKeysFromText(chapter.content);
  if (imageKeys.length === 0) {
    return baseLayoutKey;
  }

  const imageFingerprint = imageKeys
    .map((imageKey) => {
      const dimensions = peekReaderImageDimensions(novelId, imageKey);
      if (dimensions === undefined) {
        return `${imageKey}:pending`;
      }
      if (dimensions === null) {
        return `${imageKey}:missing`;
      }

      return `${imageKey}:${Math.round(dimensions.width)}x${Math.round(dimensions.height)}`;
    })
    .join(',');

  return `${baseLayoutKey}::img:${imageFingerprint}`;
}

function getActiveVariant(isPagedMode: boolean, viewMode: 'original' | 'summary'): ReaderRenderVariant {
  if (viewMode === 'summary') {
    return 'summary-shell';
  }

  return isPagedMode ? 'original-paged' : 'original-scroll';
}

function countPageItems(tree: StaticPagedChapterTree): number {
  return tree.pageSlices.reduce((pageTotal, page) => (
    pageTotal + page.columns.reduce((columnTotal, column) => columnTotal + column.items.length, 0)
  ), 0);
}

function summarizeCacheSources(
  sources: Iterable<ReaderRenderCacheSource>,
): Record<ReaderRenderCacheSource, number> {
  const counts = { ...EMPTY_CACHE_SOURCE_COUNTS };
  for (const source of sources) {
    counts[source] += 1;
  }
  return counts;
}

function createVariantSignatures(params: {
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  viewportMetrics: ReaderViewportMetrics;
}): Record<ReaderRenderVariant, ReaderLayoutSignature> {
  return {
    'original-scroll': createReaderLayoutSignature({
      textWidth: params.viewportMetrics.scrollTextWidth,
      pageHeight: params.viewportMetrics.scrollViewportHeight,
      columnCount: 1,
      columnGap: 0,
      fontSize: params.fontSize,
      lineSpacing: params.lineSpacing,
      paragraphSpacing: params.paragraphSpacing,
    }),
    'original-paged': createReaderLayoutSignature({
      textWidth: params.viewportMetrics.pagedColumnWidth,
      pageHeight: getPagedContentHeight(params.viewportMetrics.pagedViewportHeight),
      columnCount: params.viewportMetrics.pagedColumnCount,
      columnGap: params.viewportMetrics.pagedColumnGap,
      fontSize: params.fontSize,
      lineSpacing: params.lineSpacing,
      paragraphSpacing: params.paragraphSpacing,
    }),
    'summary-shell': createReaderLayoutSignature({
      textWidth: params.viewportMetrics.scrollTextWidth,
      pageHeight: params.viewportMetrics.scrollViewportHeight,
      columnCount: 1,
      columnGap: 0,
      fontSize: params.fontSize,
      lineSpacing: params.lineSpacing,
      paragraphSpacing: params.paragraphSpacing,
    }),
  };
}

export function useReaderRenderCache({
  chapters,
  contentRef,
  currentChapter,
  fetchChapterContent,
  fontSize,
  isPagedMode,
  lineSpacing,
  novelId,
  pagedChapters,
  pagedViewportElement,
  paragraphSpacing,
  scrollChapters,
  viewMode,
}: UseReaderRenderCacheParams): UseReaderRenderCacheResult {
  const [scrollViewportSize, setScrollViewportSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);
  const [pagedViewportSize, setPagedViewportSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);
  const [imageRevision, setImageRevision] = useState(0);
  const [cacheRevision, setCacheRevision] = useState(0);
  const [pendingPreheatCount, setPendingPreheatCount] = useState(0);
  const [isPreheating, setIsPreheating] = useState(false);
  const [readerTelemetryEnabled, setReaderTelemetryEnabled] = useState(() => isDebugFeatureEnabled('readerTelemetry'));
  const readerTelemetryEnabledRef = useRef(readerTelemetryEnabled);
  const pendingPreheatCountRef = useRef(pendingPreheatCount);
  const fetchChapterContentRef = useRef(fetchChapterContent);
  const loadedChaptersRef = useRef<Map<number, ChapterContent>>(new Map());
  const currentChapterIndex = currentChapter?.index ?? null;
  const hasRenderableContent = Boolean(currentChapter)
    || pagedChapters.length > 0
    || scrollChapters.length > 0;

  useEffect(() => {
    return debugFeatureSubscribe((featureFlags) => {
      setReaderTelemetryEnabled(featureFlags.readerTelemetry);
      readerTelemetryEnabledRef.current = featureFlags.readerTelemetry;
    });
  }, []);

  useEffect(() => {
    pendingPreheatCountRef.current = pendingPreheatCount;
  }, [pendingPreheatCount]);

  useEffect(() => {
    fetchChapterContentRef.current = fetchChapterContent;
  }, [fetchChapterContent]);

  useEffect(() => {
    const nextLoadedChapters = new Map<number, ChapterContent>();
    if (currentChapter) {
      nextLoadedChapters.set(currentChapter.index, currentChapter);
    }
    for (const chapter of pagedChapters) {
      nextLoadedChapters.set(chapter.index, chapter);
    }
    for (const renderableChapter of scrollChapters) {
      nextLoadedChapters.set(renderableChapter.index, renderableChapter.chapter);
    }
    loadedChaptersRef.current = nextLoadedChapters;
  }, [currentChapter, pagedChapters, scrollChapters]);

  useEffect(() => {
    if (!hasRenderableContent) {
      return;
    }

    const viewport = contentRef.current;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      const nextViewportSize = readViewportSize(viewport);
      setScrollViewportSize((previousViewportSize) => (
        previousViewportSize.width === nextViewportSize.width
          && previousViewportSize.height === nextViewportSize.height
          ? previousViewportSize
          : nextViewportSize
      ));
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [contentRef, hasRenderableContent]);

  useEffect(() => {
    if (!hasRenderableContent) {
      return;
    }

    const viewport = pagedViewportElement;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      const nextViewportSize = readViewportSize(viewport);
      setPagedViewportSize((previousViewportSize) => (
        previousViewportSize.width === nextViewportSize.width
          && previousViewportSize.height === nextViewportSize.height
          ? previousViewportSize
          : nextViewportSize
      ));
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [hasRenderableContent, pagedViewportElement]);

  const viewportMetrics = useMemo(() => createReaderViewportMetrics(
    scrollViewportSize.width,
    scrollViewportSize.height,
    pagedViewportSize.width || scrollViewportSize.width,
    pagedViewportSize.height || scrollViewportSize.height,
    fontSize,
  ), [
    fontSize,
    pagedViewportSize.height,
    pagedViewportSize.width,
    scrollViewportSize.height,
    scrollViewportSize.width,
  ]);

  const typography = useMemo(() => createReaderTypographyMetrics(
    fontSize,
    lineSpacing,
    paragraphSpacing,
    pagedViewportSize.width || scrollViewportSize.width,
  ), [
    fontSize,
    lineSpacing,
    pagedViewportSize.width,
    paragraphSpacing,
    scrollViewportSize.width,
  ]);

  const variantSignatures = useMemo(() => createVariantSignatures({
    fontSize,
    lineSpacing,
    paragraphSpacing,
    viewportMetrics,
  }), [fontSize, lineSpacing, paragraphSpacing, viewportMetrics]);
  const activeVariant = getActiveVariant(isPagedMode, viewMode);

  const loadedImageKeys = useMemo(() => {
    const keys = new Set<string>();
    if (currentChapter) {
      for (const imageKey of extractImageKeysFromText(currentChapter.content)) {
        keys.add(imageKey);
      }
    }
    for (const chapter of pagedChapters) {
      for (const imageKey of extractImageKeysFromText(chapter.content)) {
        keys.add(imageKey);
      }
    }
    for (const renderableChapter of scrollChapters) {
      for (const imageKey of extractImageKeysFromText(renderableChapter.chapter.content)) {
        keys.add(imageKey);
      }
    }
    return Array.from(keys.values()).sort();
  }, [currentChapter, pagedChapters, scrollChapters]);
  const loadedImageKeySignature = useMemo(
    () => loadedImageKeys.join('\u0000'),
    [loadedImageKeys],
  );
  const stableLoadedImageKeysRef = useRef(loadedImageKeys);
  const stableLoadedImageKeySignatureRef = useRef(loadedImageKeySignature);
  if (stableLoadedImageKeySignatureRef.current !== loadedImageKeySignature) {
    stableLoadedImageKeySignatureRef.current = loadedImageKeySignature;
    stableLoadedImageKeysRef.current = loadedImageKeys;
  }

  useEffect(() => {
    const imageKeys = stableLoadedImageKeysRef.current;
    if (!novelId || imageKeys.length === 0) {
      return;
    }

    let cancelled = false;
    preloadReaderImageResources(novelId, imageKeys)
      .finally(() => {
        if (!cancelled) {
          setImageRevision((previous) => previous + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadedImageKeySignature, novelId]);

  const visibleTargets = useMemo(() => {
    const targets: VisibleRenderTarget[] = [];

    if (viewMode === 'summary') {
      if (!currentChapter) {
        return targets;
      }
      const signature = variantSignatures['summary-shell'];
      const layoutKey = buildChapterImageLayoutKey(
        novelId,
        currentChapter,
        serializeReaderLayoutSignature(signature),
      );
      targets.push({
        chapter: currentChapter,
        exactKey: buildReaderRenderCacheKey({
          chapterIndex: currentChapter.index,
          contentHash: createChapterContentHash(currentChapter),
          layoutKey,
          novelId,
          variantFamily: 'summary-shell',
        }),
        variantFamily: 'summary-shell',
      });
      return targets;
    }

    if (isPagedMode) {
      const signature = variantSignatures['original-paged'];
      for (const chapter of pagedChapters) {
        const layoutKey = buildChapterImageLayoutKey(
          novelId,
          chapter,
          serializeReaderLayoutSignature(signature),
        );
        targets.push({
          chapter,
          exactKey: buildReaderRenderCacheKey({
            chapterIndex: chapter.index,
            contentHash: createChapterContentHash(chapter),
            layoutKey,
            novelId,
            variantFamily: 'original-paged',
          }),
          variantFamily: 'original-paged',
        });
      }
      return targets;
    }

    const signature = variantSignatures['original-scroll'];
    for (const renderableChapter of scrollChapters) {
      const layoutKey = buildChapterImageLayoutKey(
        novelId,
        renderableChapter.chapter,
        serializeReaderLayoutSignature(signature),
      );
      targets.push({
        chapter: renderableChapter.chapter,
        exactKey: buildReaderRenderCacheKey({
          chapterIndex: renderableChapter.index,
          contentHash: createChapterContentHash(renderableChapter.chapter),
          layoutKey,
          novelId,
          variantFamily: 'original-scroll',
        }),
        variantFamily: 'original-scroll',
      });
    }
    return targets;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh keys after image preload
  }, [
    currentChapter,
    isPagedMode,
    imageRevision,
    novelId,
    pagedChapters,
    scrollChapters,
    variantSignatures,
    viewMode,
  ]);
  const visibleResultsRevisionKey = `${cacheRevision}:${imageRevision}`;

  const visibleResults = useMemo<VisibleRenderResult[]>(() => {
    return visibleTargets.map((target) => {
      const signature = variantSignatures[target.variantFamily];
      const layoutKey = buildChapterImageLayoutKey(
        novelId,
        target.chapter,
        serializeReaderLayoutSignature(signature),
      );
      const lookup = {
        chapterIndex: target.chapter.index,
        contentHash: createChapterContentHash(target.chapter),
        layoutKey,
        novelId,
        variantFamily: target.variantFamily,
      } as const;
      const memoryEntry = getReaderRenderCacheEntryFromMemory(lookup);
      if (memoryEntry) {
        return {
          entry: memoryEntry,
          exactKey: target.exactKey,
          source: 'memory',
          variantFamily: target.variantFamily,
        };
      }

      const builtEntry = buildStaticRenderTree({
        chapter: target.chapter,
        imageDimensionsByKey: buildChapterImageDimensionsMap(novelId, target.chapter),
        layoutKey,
        layoutSignature: signature,
        novelId,
        typography,
        variantFamily: target.variantFamily,
      });
      return {
        entry: builtEntry,
        exactKey: target.exactKey,
        source: 'built',
        variantFamily: target.variantFamily,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh trees after cache/image updates
  }, [
    novelId,
    typography,
    variantSignatures,
    visibleResultsRevisionKey,
    visibleTargets,
  ]);
  const visibleLayoutMetrics = useMemo(() => {
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

      if (result.variantFamily === 'original-paged' && result.entry.chapterIndex === currentChapter?.index) {
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
  }, [currentChapter?.index, visibleResults]);

  const layoutSnapshot = useMemo<ReaderVisibleLayoutSnapshot>(() => {
    return {
      activeVariant,
      cacheModel: 'layered-render-cache',
      currentPagedPageCount: visibleLayoutMetrics.currentPagedPageCount,
      currentPagedPageItemCount: visibleLayoutMetrics.currentPagedPageItemCount,
      scrollBlockCount: visibleLayoutMetrics.scrollBlockCount,
      scrollChapterCount: scrollChapters.length,
      visibleCacheSources: {
        built: visibleLayoutMetrics.visibleCacheSources.built,
        dexie: visibleLayoutMetrics.visibleCacheSources.dexie,
        memory: visibleLayoutMetrics.visibleCacheSources.memory,
      },
    };
  }, [
    activeVariant,
    scrollChapters.length,
    visibleLayoutMetrics.currentPagedPageCount,
    visibleLayoutMetrics.currentPagedPageItemCount,
    visibleLayoutMetrics.scrollBlockCount,
    visibleLayoutMetrics.visibleCacheSources.built,
    visibleLayoutMetrics.visibleCacheSources.dexie,
    visibleLayoutMetrics.visibleCacheSources.memory,
  ]);

  useEffect(() => {
    if (!readerTelemetryEnabled) {
      return;
    }
    const snapshot: ReaderLayoutSnapshot = {
      ...layoutSnapshot,
      pendingPreheatCount: pendingPreheatCountRef.current,
    };
    debugLog('READER', 'Reader layout snapshot', snapshot);
  }, [layoutSnapshot, readerTelemetryEnabled]);

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

  const preheatTargets = useMemo(() => {
    if (currentChapterIndex === null || chapters.length === 0) {
      return [] as PreheatTarget[];
    }

    const targets: PreheatTarget[] = [];
    const seen = new Set<string>();
    const pushTarget = (
      chapterIndex: number,
      variantFamily: ReaderRenderVariant,
      storageKind: ReaderRenderStorageKind,
    ) => {
      const key = `${chapterIndex}:${variantFamily}:${storageKind}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      targets.push({ chapterIndex, storageKind, variantFamily });
    };

    for (const variantFamily of RENDER_VARIANTS) {
      if (variantFamily !== activeVariant) {
        pushTarget(currentChapterIndex, variantFamily, 'render-tree');
      }
    }

    if (activeVariant === 'summary-shell') {
      return targets;
    }

    for (let distance = 1; distance < chapters.length; distance += 1) {
      const previousIndex = currentChapterIndex - distance;
      const nextIndex = currentChapterIndex + distance;

      if (previousIndex >= 0) {
        pushTarget(previousIndex, activeVariant, 'manifest');
      }

      if (nextIndex < chapters.length) {
        pushTarget(nextIndex, activeVariant, 'manifest');
      }
    }

    return targets;
  }, [activeVariant, chapters.length, currentChapterIndex]);

  useEffect(() => {
    if (!novelId || currentChapterIndex === null || preheatTargets.length === 0) {
      setIsPreheating((previousState) => (previousState ? false : previousState));
      setPendingPreheatCount((previousCount) => (previousCount === 0 ? previousCount : 0));
      return;
    }

    let cancelled = false;
    let idleHandle: number | null = null;
    const controllers = new Set<AbortController>();
    const queue = [...preheatTargets];
    setIsPreheating((previousState) => (
      previousState === (queue.length > 0) ? previousState : queue.length > 0
    ));
    setPendingPreheatCount((previousCount) => (
      previousCount === queue.length ? previousCount : queue.length
    ));

    const runNext = () => {
      if (cancelled) {
        return;
      }

      const nextTarget = queue.shift();
      setPendingPreheatCount((previousCount) => (
        previousCount === queue.length ? previousCount : queue.length
      ));
      if (!nextTarget) {
        setIsPreheating((previousState) => (previousState ? false : previousState));
        return;
      }

      async function runPreheatTask(target: PreheatTarget): Promise<void> {
        try {
          let chapter = loadedChaptersRef.current.get(target.chapterIndex) ?? null;
          const signature = variantSignatures[target.variantFamily];

          if (!chapter) {
            const controller = new AbortController();
            controllers.add(controller);
            try {
              chapter = await fetchChapterContentRef.current(target.chapterIndex, {
                signal: controller.signal,
              });
              if (!cancelled) {
                loadedChaptersRef.current.set(chapter.index, chapter);
              }
            } catch {
              chapter = null;
            } finally {
              controllers.delete(controller);
            }
          }

          if (!chapter || cancelled) {
            return;
          }

          const contentHash = createChapterContentHash(chapter);
          const layoutKey = buildChapterImageLayoutKey(
            novelId,
            chapter,
            serializeReaderLayoutSignature(signature),
          );
          const lookup = {
            chapterIndex: chapter.index,
            contentHash,
            layoutKey,
            novelId,
            variantFamily: target.variantFamily,
          } as const;
          if (getReaderRenderCacheEntryFromMemory(lookup)) {
            if (readerTelemetryEnabledRef.current) {
              debugLog('READER', 'Reader preheat source', {
                chapterIndex: chapter.index,
                source: 'memory',
                storageKind: 'render-tree',
                variantFamily: target.variantFamily,
              });
            }
            return;
          }

          const dexieRecord = await getReaderRenderCacheRecordFromDexie(lookup);
          if (dexieRecord && (
            target.storageKind === 'manifest'
            || dexieRecord.storageKind === 'render-tree'
          )) {
            if (readerTelemetryEnabledRef.current) {
              debugLog('READER', 'Reader preheat source', {
                chapterIndex: chapter.index,
                source: 'dexie',
                storageKind: dexieRecord.storageKind,
                variantFamily: target.variantFamily,
              });
            }
            if (target.storageKind === 'render-tree' && isMaterializedReaderRenderCacheEntry(dexieRecord)) {
              primeReaderRenderCacheEntry(dexieRecord);
            }
            if (
              !cancelled
              && target.storageKind === 'render-tree'
              && isMaterializedReaderRenderCacheEntry(dexieRecord)
            ) {
              setCacheRevision((previous) => previous + 1);
            }
            return;
          }

          if (target.storageKind === 'manifest') {
            const manifestEntry = buildStaticRenderManifest({
              chapter,
              imageDimensionsByKey: buildChapterImageDimensionsMap(novelId, chapter),
              layoutKey,
              layoutSignature: signature,
              novelId,
              typography,
              variantFamily: target.variantFamily,
            });
            if (readerTelemetryEnabledRef.current) {
              debugLog('READER', 'Reader preheat source', {
                chapterIndex: chapter.index,
                source: 'built',
                storageKind: manifestEntry.storageKind,
                variantFamily: target.variantFamily,
              });
            }
            await persistReaderRenderCacheEntry(manifestEntry);
            return;
          }

          if (target.variantFamily !== 'summary-shell') {
            await warmReaderRenderImages(novelId, chapter);
          }

          const builtEntry = buildStaticRenderTree({
            chapter,
            imageDimensionsByKey: buildChapterImageDimensionsMap(novelId, chapter),
            layoutKey,
            layoutSignature: signature,
            novelId,
            typography,
            variantFamily: target.variantFamily,
          });
          if (readerTelemetryEnabledRef.current) {
            debugLog('READER', 'Reader preheat source', {
              chapterIndex: chapter.index,
              source: 'built',
              storageKind: builtEntry.storageKind,
              variantFamily: target.variantFamily,
            });
          }
          primeReaderRenderCacheEntry(builtEntry);
          await persistReaderRenderCacheEntry(builtEntry);
          if (!cancelled) {
            setCacheRevision((previous) => previous + 1);
          }
        } catch (error) {
          debugLog('READER', 'Reader render preheat failed', {
            chapterIndex: target.chapterIndex,
            variantFamily: target.variantFamily,
          }, error);
        } finally {
          if (!cancelled) {
            idleHandle = scheduleIdleTask(runNext);
          }
        }
      }

      runPreheatTask(nextTarget).catch((error) => {
        debugLog('READER', 'Reader render preheat scheduling failed', {
          chapterIndex: nextTarget.chapterIndex,
          variantFamily: nextTarget.variantFamily,
        }, error);
      });
    };

    idleHandle = scheduleIdleTask(runNext);

    return () => {
      cancelled = true;
      if (idleHandle !== null) {
        cancelIdleTask(idleHandle);
      }
      for (const controller of controllers) {
        controller.abort();
      }
    };
  }, [
    currentChapterIndex,
    novelId,
    preheatTargets,
    typography,
    variantSignatures,
  ]);

  useEffect(() => {
    return () => {
      clearReaderRenderCacheMemoryForNovel(novelId);
    };
  }, [novelId]);

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

  return {
    pagedLayouts,
    scrollLayouts,
    summaryShells,
    typography,
    viewportMetrics,
    cacheSourceByKey,
    isPreheating,
    pendingPreheatCount,
  };
}
