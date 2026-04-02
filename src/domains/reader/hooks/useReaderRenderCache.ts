import type { ChapterContent } from '../readerContentService';
import type {
  ReaderLayoutSnapshot,
  UseReaderRenderCacheParams,
  UseReaderRenderCacheResult,
} from './readerRenderCacheTypes';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  debugFeatureSubscribe,
  debugLog,
  isDebugFeatureEnabled,
} from '@app/debug/service';

import { clearReaderRenderCacheMemoryForNovel } from '../utils/readerRenderCache';
import {
  buildPreheatTargets,
  buildVisibleRenderTargets,
  collectLoadedImageKeys,
  getActiveVariant,
} from '../utils/readerRenderCachePlanning';
import { preloadReaderImageResources } from '../utils/readerImageResourceCache';
import { useReaderRenderPreheater } from './useReaderRenderPreheater';
import { useReaderRenderViewport } from './useReaderRenderViewport';
import { useReaderVisibleRenderResults } from './useReaderVisibleRenderResults';

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
  const [imageRevision, setImageRevision] = useState(0);
  const [cacheRevision, setCacheRevision] = useState(0);
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

  const visibleTargets = useMemo(() => buildVisibleRenderTargets({
    currentChapter,
    isPagedMode,
    novelId,
    pagedChapters,
    scrollChapters,
    variantSignatures,
    viewMode,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh keys after image preload
  }), [
    currentChapter,
    imageRevision,
    isPagedMode,
    novelId,
    pagedChapters,
    scrollChapters,
    variantSignatures,
    viewMode,
  ]);

  const preheatTargets = useMemo(() => buildPreheatTargets({
    activeVariant,
    chaptersLength: chapters.length,
    currentChapterIndex,
  }), [activeVariant, chapters.length, currentChapterIndex]);

  const handleMaterializedEntry = useCallback(() => {
    setCacheRevision((previous) => previous + 1);
  }, []);

  const { isPreheating, pendingPreheatCount } = useReaderRenderPreheater({
    currentChapterIndex,
    fetchChapterContent,
    loadedChaptersRef,
    novelId,
    onMaterializedEntry: handleMaterializedEntry,
    preheatTargets,
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
    scrollLayouts,
    summaryShells,
  } = useReaderVisibleRenderResults({
    activeVariant,
    currentChapterIndex,
    novelId,
    revisionKey: `${cacheRevision}:${imageRevision}`,
    scrollChapterCount: scrollChapters.length,
    typography,
    variantSignatures,
    visibleTargets,
  });

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
    return () => {
      clearReaderRenderCacheMemoryForNovel(novelId);
    };
  }, [novelId]);

  return {
    cacheSourceByKey,
    isPreheating,
    pagedLayouts,
    pendingPreheatCount,
    scrollLayouts,
    summaryShells,
    typography,
    viewportMetrics,
  };
}
