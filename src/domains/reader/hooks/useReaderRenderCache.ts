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

import { useEffect, useMemo, useRef, useState } from 'react';
import { debugLog } from '@app/debug/service';

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
  buildStaticRenderTree,
  clearReaderRenderCacheMemoryForNovel,
  coercePagedTree,
  coerceScrollTree,
  coerceSummaryShellTree,
  getReaderRenderCacheEntryFromDexie,
  getReaderRenderCacheEntryFromMemory,
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
  variantFamily: ReaderRenderVariant;
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

function buildChapterImageDimensionsMap(novelId: number, chapter: ChapterContent): Map<string, ReturnType<typeof peekReaderImageDimensions>> {
  const dimensions = new Map<string, ReturnType<typeof peekReaderImageDimensions>>();
  for (const imageKey of extractImageKeysFromText(chapter.content)) {
    dimensions.set(imageKey, peekReaderImageDimensions(novelId, imageKey));
  }
  return dimensions;
}

function getActiveVariant(isPagedMode: boolean, viewMode: 'original' | 'summary'): ReaderRenderVariant {
  if (viewMode === 'summary') {
    return 'summary-shell';
  }

  return isPagedMode ? 'original-paged' : 'original-scroll';
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
  const loadedChaptersRef = useRef<Map<number, ChapterContent>>(new Map());

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
    const viewport = contentRef.current;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      setScrollViewportSize(readViewportSize(viewport));
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [contentRef]);

  useEffect(() => {
    const viewport = pagedViewportElement;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      setPagedViewportSize(readViewportSize(viewport));
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [pagedViewportElement]);

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
    return Array.from(keys.values());
  }, [currentChapter, pagedChapters, scrollChapters]);

  useEffect(() => {
    if (!novelId || loadedImageKeys.length === 0) {
      return;
    }

    let cancelled = false;
    void preloadReaderImageResources(novelId, loadedImageKeys)
      .finally(() => {
        if (!cancelled) {
          setImageRevision((previous) => previous + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadedImageKeys, novelId]);

  const visibleTargets = useMemo(() => {
    const targets: VisibleRenderTarget[] = [];

    if (viewMode === 'summary') {
      if (!currentChapter) {
        return targets;
      }
      const signature = variantSignatures['summary-shell'];
      const layoutKey = serializeReaderLayoutSignature(signature);
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
      const layoutKey = serializeReaderLayoutSignature(signature);
      for (const chapter of pagedChapters) {
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
    const layoutKey = serializeReaderLayoutSignature(signature);
    for (const renderableChapter of scrollChapters) {
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
  }, [
    currentChapter,
    isPagedMode,
    novelId,
    pagedChapters,
    scrollChapters,
    variantSignatures,
    viewMode,
  ]);
  const visibleResultsRevisionKey = `${cacheRevision}:${imageRevision}`;

  const visibleResults = useMemo<VisibleRenderResult[]>(() => {
    void visibleResultsRevisionKey;
    return visibleTargets.map((target) => {
      const signature = variantSignatures[target.variantFamily];
      const lookup = {
        chapterIndex: target.chapter.index,
        contentHash: createChapterContentHash(target.chapter),
        layoutKey: serializeReaderLayoutSignature(signature),
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
  }, [novelId, typography, variantSignatures, visibleResultsRevisionKey, visibleTargets]);

  useEffect(() => {
    for (const result of visibleResults) {
      if (result.source !== 'built') {
        continue;
      }

      primeReaderRenderCacheEntry(result.entry);
      void persistReaderRenderCacheEntry(result.entry).catch((error) => {
        debugLog('READER', 'Visible render cache persistence failed', {
          chapterIndex: result.entry.chapterIndex,
          variantFamily: result.entry.variantFamily,
        }, error);
      });
    }
  }, [visibleResults]);

  const preheatTargets = useMemo(() => {
    if (!currentChapter || chapters.length === 0) {
      return [] as PreheatTarget[];
    }

    const targets: PreheatTarget[] = [];
    const seen = new Set<string>();
    const pushTarget = (chapterIndex: number, variantFamily: ReaderRenderVariant) => {
      const key = `${chapterIndex}:${variantFamily}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      targets.push({ chapterIndex, variantFamily });
    };

    for (const variantFamily of RENDER_VARIANTS) {
      if (variantFamily !== activeVariant) {
        pushTarget(currentChapter.index, variantFamily);
      }
    }

    for (let distance = 1; distance < chapters.length; distance += 1) {
      const previousIndex = currentChapter.index - distance;
      const nextIndex = currentChapter.index + distance;

      if (previousIndex >= 0) {
        for (const variantFamily of RENDER_VARIANTS) {
          pushTarget(previousIndex, variantFamily);
        }
      }

      if (nextIndex < chapters.length) {
        for (const variantFamily of RENDER_VARIANTS) {
          pushTarget(nextIndex, variantFamily);
        }
      }
    }

    return targets;
  }, [activeVariant, chapters.length, currentChapter]);

  useEffect(() => {
    if (!novelId || !currentChapter || preheatTargets.length === 0) {
      setIsPreheating(false);
      setPendingPreheatCount(0);
      return;
    }

    let cancelled = false;
    let idleHandle: number | null = null;
    const controllers = new Set<AbortController>();
    const queue = [...preheatTargets];
    setIsPreheating(queue.length > 0);
    setPendingPreheatCount(queue.length);

    const runNext = () => {
      if (cancelled) {
        return;
      }

      const nextTarget = queue.shift();
      setPendingPreheatCount(queue.length);
      if (!nextTarget) {
        setIsPreheating(false);
        return;
      }

      void (async () => {
        try {
          let chapter = loadedChaptersRef.current.get(nextTarget.chapterIndex) ?? null;
          const signature = variantSignatures[nextTarget.variantFamily];

          if (!chapter) {
            const controller = new AbortController();
            controllers.add(controller);
            try {
              chapter = await fetchChapterContent(nextTarget.chapterIndex, {
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
          const lookup = {
            chapterIndex: chapter.index,
            contentHash,
            layoutKey: serializeReaderLayoutSignature(signature),
            novelId,
            variantFamily: nextTarget.variantFamily,
          } as const;
          if (getReaderRenderCacheEntryFromMemory(lookup)) {
            return;
          }

          const dexieEntry = await getReaderRenderCacheEntryFromDexie(lookup);
          if (dexieEntry) {
            if (!cancelled) {
              setCacheRevision((previous) => previous + 1);
            }
            return;
          }

          if (nextTarget.variantFamily !== 'summary-shell') {
            await warmReaderRenderImages(novelId, chapter);
          }

          const builtEntry = buildStaticRenderTree({
            chapter,
            imageDimensionsByKey: buildChapterImageDimensionsMap(novelId, chapter),
            layoutSignature: signature,
            novelId,
            typography,
            variantFamily: nextTarget.variantFamily,
          });
          primeReaderRenderCacheEntry(builtEntry);
          await persistReaderRenderCacheEntry(builtEntry);
          if (!cancelled) {
            setCacheRevision((previous) => previous + 1);
          }
        } catch (error) {
          debugLog('READER', 'Reader render preheat failed', {
            chapterIndex: nextTarget.chapterIndex,
            variantFamily: nextTarget.variantFamily,
          }, error);
        } finally {
          if (!cancelled) {
            idleHandle = scheduleIdleTask(runNext);
          }
        }
      })();
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
  }, [currentChapter, fetchChapterContent, novelId, preheatTargets, typography, variantSignatures]);

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
