import type { Chapter, ChapterContent } from '@shared/contracts/reader';
import type {
  ReaderLayoutSnapshot,
  UseReaderRenderCacheParams,
  UseReaderRenderCacheResult,
} from './readerRenderCacheTypes';
import type { ChapterFlowManifest } from '../layout-core/internal';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  debugFeatureSubscribe,
  debugLog,
  isDebugFeatureEnabled,
  setDebugSnapshot,
} from '@shared/debug';
import { useReaderContentRuntime } from '@shared/reader-runtime';

import {
  clearReaderRenderCacheMemoryForNovel,
  getReaderRenderCacheRecordsForNovelVariantFromDexie,
} from '../utils/render-cache/readerRenderCache';
import {
  buildPreheatTargets,
  buildVisibleRenderTargets,
  collectLoadedImageKeys,
  getActiveVariant,
} from '../utils/render-cache/readerRenderCachePlanning';
import {
  createChapterFlowManifestFromRenderCacheRecord,
  preloadReaderImageResources,
  serializeReaderLayoutSignature,
} from '../layout-core/internal';
import { useReaderRenderPreheater } from './useReaderRenderPreheater';
import { useReaderRenderViewport } from './useReaderRenderViewport';
import { useReaderVisibleRenderResults } from './useReaderVisibleRenderResults';

const MIN_FALLBACK_SCROLL_CHAPTER_HEIGHT_PX = 320;
const ESTIMATED_CHAR_WIDTH_RATIO = 0.55;

function createFallbackScrollManifest(params: {
  chapter: Chapter;
  layoutKey: string;
  layoutSignature: ChapterFlowManifest['layoutSignature'];
}): ChapterFlowManifest {
  const { chapter, layoutKey, layoutSignature } = params;
  const fontSize = Math.max(1, layoutSignature.fontSize || 18);
  const lineHeight = Math.max(fontSize, fontSize * Math.max(1, layoutSignature.lineSpacing || 1.6));
  const textWidth = Math.max(fontSize * 12, layoutSignature.textWidth || fontSize * 24);
  const charsPerLine = Math.max(8, Math.floor(textWidth / (fontSize * ESTIMATED_CHAR_WIDTH_RATIO)));
  const estimatedTextUnits = Math.max(1, chapter.wordCount || chapter.title.length || 1);
  const estimatedLineCount = Math.max(1, Math.ceil(estimatedTextUnits / charsPerLine));
  const paragraphSpacing = Math.max(0, layoutSignature.paragraphSpacing || 0);
  const headingHeight = lineHeight * 1.4 + paragraphSpacing;
  const bodyHeight = estimatedLineCount * lineHeight
    + Math.max(0, estimatedLineCount - 1) * paragraphSpacing * 0.15;
  const scrollHeight = Math.max(
    MIN_FALLBACK_SCROLL_CHAPTER_HEIGHT_PX,
    Math.ceil(headingHeight + bodyHeight + paragraphSpacing * 2),
  );

  return {
    blockCount: 0,
    blockSummaries: [],
    chapterIndex: chapter.index,
    chapterKey: chapter.chapterKey,
    contentHash: `toc:${chapter.chapterKey ?? chapter.index}:${chapter.wordCount}:${chapter.title}`,
    endLocator: null,
    layoutFeatureSet: 'scroll-plain',
    layoutKey,
    layoutSignature,
    pageCount: 0,
    scrollHeight,
    sourceVariants: ['original-scroll'],
    startLocator: null,
    status: 'estimated',
  };
}

function createFallbackPagedManifest(params: {
  chapter: Chapter;
  layoutKey: string;
  layoutSignature: ChapterFlowManifest['layoutSignature'];
}): ChapterFlowManifest {
  const { chapter, layoutKey, layoutSignature } = params;
  const fontSize = Math.max(1, layoutSignature.fontSize || 18);
  const lineHeight = Math.max(fontSize, fontSize * Math.max(1, layoutSignature.lineSpacing || 1.6));
  const textWidth = Math.max(fontSize * 12, layoutSignature.textWidth || fontSize * 24);
  const charsPerLine = Math.max(8, Math.floor(textWidth / (fontSize * ESTIMATED_CHAR_WIDTH_RATIO)));
  const estimatedTextUnits = Math.max(1, chapter.wordCount || chapter.title.length || 1);
  const estimatedLineCount = Math.max(1, Math.ceil(estimatedTextUnits / charsPerLine));
  const paragraphSpacing = Math.max(0, layoutSignature.paragraphSpacing || 0);
  const estimatedHeight = estimatedLineCount * lineHeight
    + Math.max(0, estimatedLineCount - 1) * paragraphSpacing * 0.15
    + lineHeight * 1.4
    + paragraphSpacing * 2;
  const pageCapacity = Math.max(
    lineHeight,
    Math.max(1, layoutSignature.pageHeight || 1)
      * Math.max(1, layoutSignature.columnCount || 1),
  );

  return {
    blockCount: 0,
    blockSummaries: [],
    chapterIndex: chapter.index,
    chapterKey: chapter.chapterKey,
    contentHash: `toc:${chapter.chapterKey ?? chapter.index}:${chapter.wordCount}:${chapter.title}`,
    endLocator: null,
    layoutFeatureSet: 'paged-pagination-block',
    layoutKey,
    layoutSignature,
    pageCount: Math.max(1, Math.ceil(estimatedHeight / pageCapacity)),
    scrollHeight: 0,
    sourceVariants: ['original-paged'],
    startLocator: null,
    status: 'estimated',
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
  const readerContentRuntime = useReaderContentRuntime();
  const [imageRevision, setImageRevision] = useState(0);
  const [cacheRevision, setCacheRevision] = useState(0);
  const [persistedPagedManifests, setPersistedPagedManifests] =
    useState<Map<number, ChapterFlowManifest>>(new Map());
  const [persistedScrollManifests, setPersistedScrollManifests] =
    useState<Map<number, ChapterFlowManifest>>(new Map());
  const [readerTelemetryEnabled, setReaderTelemetryEnabled] = useState(() => isDebugFeatureEnabled('readerTelemetry'));
  const pendingPreheatCountRef = useRef(0);
  const loadedChaptersRef = useRef<Map<number, ChapterContent>>(new Map());
  const currentChapterIndex = currentChapter?.index ?? null;
  const hasRenderableContent = Boolean(currentChapter)
    || pagedChapters.length > 0
    || scrollChapters.length > 0;

  useEffect(() => {
    return debugFeatureSubscribe((featureFlags) => {
      setReaderTelemetryEnabled(featureFlags.readerTelemetry);
    });
  }, []);

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

  const { typography, variantSignatures, viewportMetrics } = useReaderRenderViewport({
    contentRef,
    fontSize,
    hasRenderableContent,
    lineSpacing,
    pagedViewportElement,
    paragraphSpacing,
  });
  const activeVariant = getActiveVariant(isPagedMode, viewMode);
  const scrollRenderMode = 'rich' as const;

  const loadedImageKeys = useMemo(() => collectLoadedImageKeys({
    currentChapter,
    pagedChapters,
    scrollChapters,
  }), [currentChapter, pagedChapters, scrollChapters]);
  const loadedImageKeySignature = useMemo(() => loadedImageKeys.join('\u0000'), [loadedImageKeys]);
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
    preloadReaderImageResources(readerContentRuntime, novelId, imageKeys)
      .finally(() => {
        if (!cancelled) {
          setImageRevision((previous) => previous + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadedImageKeySignature, novelId, readerContentRuntime]);

  const visibleTargets = useMemo(() => buildVisibleRenderTargets({
    currentChapter,
    isPagedMode,
    novelId,
    pagedChapters,
    scrollRenderMode,
    scrollChapters,
    variantSignatures,
    viewMode,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 图片预加载后刷新索引键
  }), [
    currentChapter,
    imageRevision,
    isPagedMode,
    novelId,
    pagedChapters,
    scrollRenderMode,
    scrollChapters,
    variantSignatures,
    viewMode,
  ]);

  const preheatTargets = useMemo(() => buildPreheatTargets({
    activeVariant,
    chaptersLength: chapters.length,
    currentChapterIndex,
  }), [activeVariant, chapters.length, currentChapterIndex]);

  const visibleTargetKeys = useMemo(() => new Set(
    visibleTargets.map((target) => `${target.chapter.index}:${target.variantFamily}`),
  ), [visibleTargets]);

  const handleMaterializedEntry = useCallback((entry: {
    chapterIndex: number;
    variantFamily: string;
  }) => {
    if (!visibleTargetKeys.has(`${entry.chapterIndex}:${entry.variantFamily}`)) {
      return;
    }

    setCacheRevision((previous) => previous + 1);
  }, [visibleTargetKeys]);
  const handleManifestEntry = useCallback((entry: {
    chapterIndex: number;
    variantFamily: string;
  }) => {
    if (entry.variantFamily !== 'original-scroll' && entry.variantFamily !== 'original-paged') {
      return;
    }

    if (!visibleTargetKeys.has(`${entry.chapterIndex}:${entry.variantFamily}`)) {
      return;
    }

    setCacheRevision((previous) => previous + 1);
  }, [visibleTargetKeys]);

  const { isPreheating, pendingPreheatCount } = useReaderRenderPreheater({
    currentChapterIndex,
    fetchChapterContent,
    loadedChaptersRef,
    novelId,
    onManifestEntry: handleManifestEntry,
    onMaterializedEntry: handleMaterializedEntry,
    preheatTargets,
    preferRichScrollRendering: true,
    readerTelemetryEnabled,
    typography,
    variantSignatures,
  });

  useEffect(() => {
    pendingPreheatCountRef.current = pendingPreheatCount;
  }, [pendingPreheatCount]);

  const {
    cacheSourceByKey,
    layoutSnapshot,
    pagedLayouts,
    pagedManifests: visiblePagedManifests,
    scrollLayouts,
    scrollManifests: visibleScrollManifests,
    summaryShells,
  } = useReaderVisibleRenderResults({
    activeVariant,
    currentChapterIndex,
    novelId,
    revisionKey: `${cacheRevision}:${imageRevision}:${scrollRenderMode}`,
    scrollChapterCount: scrollChapters.length,
    preferRichScrollRendering: true,
    typography,
    variantSignatures,
    visibleTargets,
  });

  useEffect(() => {
    if (!novelId) {
      setPersistedPagedManifests((previous) => (
        previous.size === 0 ? previous : new Map()
      ));
      return;
    }

    let cancelled = false;
    getReaderRenderCacheRecordsForNovelVariantFromDexie({
      novelId,
      variantFamily: 'original-paged',
    })
      .then((records) => {
        if (cancelled) {
          return;
        }

        const nextManifests = new Map<number, ChapterFlowManifest>();
        const expectedSignature = JSON.stringify(variantSignatures['original-paged']);
        for (const record of records) {
          const manifest = createChapterFlowManifestFromRenderCacheRecord(record);
          if (!manifest || JSON.stringify(manifest.layoutSignature) !== expectedSignature) {
            continue;
          }

          nextManifests.set(manifest.chapterIndex, manifest);
        }
        setPersistedPagedManifests(nextManifests);
      })
      .catch((error) => {
        debugLog('READER', 'Paged render cache manifest lookup failed', { novelId }, error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    cacheRevision,
    imageRevision,
    novelId,
    variantSignatures,
  ]);

  useEffect(() => {
    if (!novelId) {
      setPersistedScrollManifests((previous) => (
        previous.size === 0 ? previous : new Map()
      ));
      return;
    }

    let cancelled = false;
    getReaderRenderCacheRecordsForNovelVariantFromDexie({
      novelId,
      variantFamily: 'original-scroll',
    })
      .then((records) => {
        if (cancelled) {
          return;
        }

        const nextManifests = new Map<number, ChapterFlowManifest>();
        const expectedSignature = JSON.stringify(variantSignatures['original-scroll']);
        for (const record of records) {
          const manifest = createChapterFlowManifestFromRenderCacheRecord(record);
          if (!manifest || JSON.stringify(manifest.layoutSignature) !== expectedSignature) {
            continue;
          }

          nextManifests.set(manifest.chapterIndex, manifest);
        }
        setPersistedScrollManifests(nextManifests);
      })
      .catch((error) => {
        debugLog('READER', 'Scroll render cache manifest lookup failed', { novelId }, error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    cacheRevision,
    imageRevision,
    novelId,
    variantSignatures,
  ]);

  const pagedManifests = useMemo(() => {
    const merged = new Map(persistedPagedManifests);
    for (const [chapterIndex, manifest] of visiblePagedManifests) {
      merged.set(chapterIndex, manifest);
    }

    const layoutSignature = variantSignatures['original-paged'];
    const layoutKey = serializeReaderLayoutSignature(layoutSignature);
    for (const chapter of chapters) {
      if (merged.has(chapter.index)) {
        continue;
      }

      merged.set(chapter.index, createFallbackPagedManifest({
        chapter,
        layoutKey,
        layoutSignature,
      }));
    }

    return merged;
  }, [
    chapters,
    persistedPagedManifests,
    variantSignatures,
    visiblePagedManifests,
  ]);

  const scrollManifests = useMemo(() => {
    const merged = new Map(persistedScrollManifests);
    for (const [chapterIndex, manifest] of visibleScrollManifests) {
      merged.set(chapterIndex, manifest);
    }

    const layoutSignature = variantSignatures['original-scroll'];
    const layoutKey = serializeReaderLayoutSignature(layoutSignature);
    for (const chapter of chapters) {
      if (merged.has(chapter.index)) {
        continue;
      }

      merged.set(chapter.index, createFallbackScrollManifest({
        chapter,
        layoutKey,
        layoutSignature,
      }));
    }

    return merged;
  }, [
    chapters,
    persistedScrollManifests,
    variantSignatures,
    visibleScrollManifests,
  ]);

  useEffect(() => {
    const snapshot: ReaderLayoutSnapshot = {
      ...layoutSnapshot,
      novelId,
      pendingPreheatCount: pendingPreheatCountRef.current,
    };
    setDebugSnapshot('reader-layout', snapshot);
    if (readerTelemetryEnabled) {
      debugLog('READER', 'Reader layout snapshot', snapshot);
    }
  }, [layoutSnapshot, novelId, readerTelemetryEnabled]);

  useEffect(() => {
    return () => {
      clearReaderRenderCacheMemoryForNovel(novelId);
    };
  }, [novelId]);

  return {
    cacheSourceByKey,
    isPreheating,
    pagedLayouts,
    pagedManifests,
    pagedLayoutSignature: variantSignatures['original-paged'],
    pendingPreheatCount,
    scrollLayouts,
    scrollManifests,
    scrollLayoutSignature: variantSignatures['original-scroll'],
    summaryShells,
    typography,
    viewportMetrics,
  };
}
