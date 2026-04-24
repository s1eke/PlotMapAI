import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import { debugLog, setDebugSnapshot } from '@shared/debug';
import { toCanonicalPositionFromLocator } from '@shared/utils/readerStoredState';

import type {
  ScrollAnchorSnapshot,
  UseScrollReaderControllerParams,
  UseScrollReaderControllerResult,
  VisibleScrollBlockRange,
} from '../scroll-runtime/internal';
import type { ScrollModeAnchor } from '../scroll-runtime/internal';
import {
  buildNovelFlowIndex,
  EMPTY_PAGED_CHAPTERS,
  EMPTY_SCROLL_READER_CHAPTERS,
  resolveLocatorGlobalOffset,
} from '../scroll-runtime/internal';
import { useReaderRenderCache } from '../render-cache/internal';
import {
  useScrollModeChapters,
  useScrollReaderRestore,
  useScrollReaderViewportSync,
  useScrollReaderWindowing,
} from '../scroll-runtime/internal';
import { serializeReaderLayoutSignature } from '../layout-core/internal';

export type {
  UseScrollReaderControllerResult,
} from '../scroll-runtime/internal';

const SCROLL_FLOW_CHAPTER_OVERSCAN_PX = 1600;

function areNumberArraysEqual(left: number[], right: number[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function getVisibleFlowChapterIndices(params: {
  chapterIndex: number;
  novelFlowIndex: ReturnType<typeof buildNovelFlowIndex> | null;
  scrollTop: number;
  viewportHeight: number;
}): number[] {
  const { chapterIndex, novelFlowIndex, scrollTop, viewportHeight } = params;
  if (!novelFlowIndex || novelFlowIndex.totalScrollHeight <= 0) {
    return [chapterIndex];
  }

  const viewportStart = Math.max(0, scrollTop - SCROLL_FLOW_CHAPTER_OVERSCAN_PX);
  const viewportEnd = Math.min(
    novelFlowIndex.totalScrollHeight,
    scrollTop + Math.max(viewportHeight, 1) + SCROLL_FLOW_CHAPTER_OVERSCAN_PX,
  );
  const indices = novelFlowIndex.chapters
    .filter((entry) => (
      entry.manifestStatus !== 'missing'
      && entry.scrollEnd >= viewportStart
      && entry.scrollStart <= viewportEnd
    ))
    .map((entry) => entry.chapterIndex);

  return indices.length > 0 ? indices : [chapterIndex];
}

export function useScrollReaderController({
  enabled,
  novelId,
  chapters,
  currentChapter,
  chapterDataRevision,
  sessionSnapshot,
  sessionCommands,
  cache,
  fetchChapterContent,
  preloadAdjacent,
  preferences,
  pendingRestoreTarget,
  pendingRestoreTargetRef,
  getRestoreAttempt,
  recordRestoreResult,
  clearPendingRestoreTarget,
  stopRestoreMask,
}: UseScrollReaderControllerParams): UseScrollReaderControllerResult {
  const viewport = useReaderViewportContext();
  const navigation = useReaderNavigationRuntime();
  const layoutQueries = useReaderLayoutQueries();
  const persistence = useReaderPersistenceRuntime();
  const { chapterIndex } = sessionSnapshot;
  const {
    persistReaderState,
    setChapterIndex,
  } = sessionCommands;
  const scrollChapterBodyElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const [scrollModeChapters, setScrollModeChapters] = useState<number[]>([]);
  const [retainedFocusedWindowChapterIndex, setRetainedFocusedWindowChapterIndex] =
    useState<number | null>(null);
  const [, setVisibleScrollBlockRangeByChapter] =
    useState<Map<number, VisibleScrollBlockRange>>(new Map());
  const scrollAnchorSnapshotRef = useRef<ScrollAnchorSnapshot>({
    chapterIndex: null,
    chapterOffsetTop: null,
    firstRenderableChapterIndex: null,
    scrollTop: 0,
  });
  const novelFlowIndexRef = useRef<ReturnType<typeof buildNovelFlowIndex> | null>(null);
  const fetchScrollChapterContent = useCallback((index: number) => {
    return fetchChapterContent(index);
  }, [fetchChapterContent]);
  const retainFocusedWindowAfterRestore = useCallback((restoredChapterIndex: number) => {
    setRetainedFocusedWindowChapterIndex((previousChapterIndex) => (
      previousChapterIndex === restoredChapterIndex
        ? previousChapterIndex
        : restoredChapterIndex
    ));
  }, []);
  const clearRetainedFocusedWindow = useCallback(() => {
    setRetainedFocusedWindowChapterIndex((previousChapterIndex) => (
      previousChapterIndex === null ? previousChapterIndex : null
    ));
  }, []);

  useEffect(() => {
    if (!enabled || chapterIndex !== retainedFocusedWindowChapterIndex) {
      clearRetainedFocusedWindow();
    }
  }, [
    chapterIndex,
    clearRetainedFocusedWindow,
    enabled,
    retainedFocusedWindowChapterIndex,
  ]);

  useScrollReaderWindowing({
    cache,
    chapterIndex,
    chaptersLength: chapters.length,
    currentChapter,
    enabled,
    fetchChapterContent: fetchScrollChapterContent,
    layoutQueries,
    pendingRestoreTargetRef,
    retainedFocusedWindowChapterIndex,
    scrollAnchorSnapshotRef,
    scrollChapterBodyElementsRef,
    setScrollModeChapters,
    setVisibleScrollBlockRangeByChapter,
  });

  const handleReadingAnchorChange = useCallback((anchor: ScrollModeAnchor) => {
    if (!enabled) return;
    if (persistence.isScrollSyncSuppressed()) return;
    if (pendingRestoreTargetRef.current) return;
    if (pendingRestoreTarget && anchor.chapterProgress === 0) return;
    if (
      navigation.getChapterChangeSource() === 'navigation'
      || navigation.getChapterChangeSource() === 'restore'
    ) {
      return;
    }

    const locator = layoutQueries.getCurrentOriginalLocator();
    if (!locator) {
      const persistFallbackSnapshot = {
        source: 'useScrollReaderController.handleReadingAnchorChange',
        mode: 'scroll',
        chapterIndex: anchor.chapterIndex,
        fallbackReason: 'currentOriginalLocator-null -> persist-chapter-start-edge',
      };
      setDebugSnapshot('reader-position-persist', persistFallbackSnapshot);
      debugLog('Reader', 'scroll persist fallback to chapter start', persistFallbackSnapshot);
    }
    persistReaderState({
      canonical: toCanonicalPositionFromLocator(locator ?? undefined) ?? {
        chapterIndex: anchor.chapterIndex,
        edge: 'start',
      },
      hints: {
        chapterProgress: anchor.chapterProgress,
        pageIndex: undefined,
        contentMode: 'scroll',
      },
    });

    const nextChapterIndex = locator?.chapterIndex ?? anchor.chapterIndex;
    if (nextChapterIndex === chapterIndex) {
      return;
    }

    navigation.setChapterChangeSource('scroll');
    setChapterIndex(nextChapterIndex);
  }, [
    chapterIndex,
    enabled,
    layoutQueries,
    navigation,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    persistReaderState,
    persistence,
    setChapterIndex,
  ]);

  const scrollMode = useScrollModeChapters(
    viewport.contentRef,
    enabled,
    chapters,
    fetchScrollChapterContent,
    preloadAdjacent,
    scrollModeChapters,
    setScrollModeChapters,
    chapterDataRevision,
    () => novelFlowIndexRef.current,
    handleReadingAnchorChange,
    clearRetainedFocusedWindow,
  );
  const {
    getCurrentAnchor,
    handleScroll,
    scrollChapterElementsRef,
    scrollViewportTop,
    syncViewportState,
  } = scrollMode;

  useEffect(() => {
    return layoutQueries.registerCurrentAnchorResolver(getCurrentAnchor);
  }, [getCurrentAnchor, layoutQueries]);

  const scrollReaderChapters = useMemo(() => {
    if (!enabled || chapterDataRevision < 0) {
      return EMPTY_SCROLL_READER_CHAPTERS;
    }

    return scrollModeChapters
      .map((index) => {
        const chapter = cache.getCachedChapter(index);
        return chapter ? { index, chapter } : null;
      })
      .filter((item): item is { index: number; chapter: import('@shared/contracts/reader').ChapterContent } => Boolean(item));
  }, [cache, chapterDataRevision, enabled, scrollModeChapters]);

  const renderCache = useReaderRenderCache({
    chapters,
    currentChapter: enabled ? currentChapter : null,
    contentRef: viewport.contentRef,
    fetchChapterContent,
    fontSize: preferences.fontSize,
    isPagedMode: false,
    lineSpacing: preferences.lineSpacing,
    novelId,
    pagedChapters: EMPTY_PAGED_CHAPTERS,
    pagedViewportElement: null,
    paragraphSpacing: preferences.paragraphSpacing,
    scrollChapters: enabled ? scrollReaderChapters : EMPTY_SCROLL_READER_CHAPTERS,
    viewMode: 'original',
  });

  const novelFlowIndex = useMemo(() => {
    if (!enabled) {
      return null;
    }

    return buildNovelFlowIndex({
      chapterCount: chapters.length,
      layoutKey: serializeReaderLayoutSignature(renderCache.scrollLayoutSignature),
      layoutSignature: renderCache.scrollLayoutSignature,
      manifests: renderCache.scrollManifests.values(),
      novelId,
    });
  }, [
    chapters.length,
    enabled,
    novelId,
    renderCache.scrollLayoutSignature,
    renderCache.scrollManifests,
  ]);
  novelFlowIndexRef.current = novelFlowIndex;

  const previousNovelFlowIndexRef = useRef<typeof novelFlowIndex>(null);
  useEffect(() => {
    const previousIndex = previousNovelFlowIndexRef.current;
    previousNovelFlowIndexRef.current = novelFlowIndex;
    if (!enabled || !previousIndex || !novelFlowIndex || previousIndex === novelFlowIndex) {
      return;
    }

    const locator = layoutQueries.getCurrentOriginalLocator();
    if (!locator) {
      return;
    }

    const previousOffset = resolveLocatorGlobalOffset(previousIndex, locator);
    const nextOffset = resolveLocatorGlobalOffset(novelFlowIndex, locator);
    const container = viewport.contentRef.current;
    if (previousOffset === null || nextOffset === null || !container) {
      return;
    }

    const offsetDelta = nextOffset - previousOffset;
    if (Math.abs(offsetDelta) <= 0.5) {
      return;
    }

    persistence.suppressScrollSyncTemporarily();
    container.scrollTop += offsetDelta;
    syncViewportState({ force: true });
  }, [
    enabled,
    layoutQueries,
    novelFlowIndex,
    persistence,
    syncViewportState,
    viewport.contentRef,
  ]);

  const visibleFlowChapterIndices = useMemo(() => getVisibleFlowChapterIndices({
    chapterIndex,
    novelFlowIndex,
    scrollTop: scrollViewportTop,
    viewportHeight: renderCache.viewportMetrics.scrollViewportHeight,
  }), [
    chapterIndex,
    novelFlowIndex,
    renderCache.viewportMetrics.scrollViewportHeight,
    scrollViewportTop,
  ]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setScrollModeChapters((previousIndices) => {
      const merged = Array.from(new Set([
        ...previousIndices,
        ...visibleFlowChapterIndices,
      ])).sort((left, right) => left - right);
      return areNumberArraysEqual(previousIndices, merged) ? previousIndices : merged;
    });
  }, [enabled, visibleFlowChapterIndices]);

  const renderableScrollLayouts = useMemo(
    () => scrollReaderChapters.flatMap((renderableScrollChapter) => {
      const layout = renderCache.scrollLayouts.get(renderableScrollChapter.index);
      const flowEntry = novelFlowIndex?.chapters[renderableScrollChapter.index] ?? null;
      const isVisibleFlowChapter = visibleFlowChapterIndices.includes(
        renderableScrollChapter.index,
      );
      return layout && isVisibleFlowChapter
        ? [{ ...renderableScrollChapter, flowEntry, layout }]
        : [];
    }),
    [novelFlowIndex, renderCache.scrollLayouts, scrollReaderChapters, visibleFlowChapterIndices],
  );

  useScrollReaderRestore({
    chapterIndex,
    chaptersLength: chapters.length,
    clearPendingRestoreTarget,
    currentChapter,
    enabled,
    layoutQueries,
    navigation,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    getRestoreAttempt,
    recordRestoreResult,
    retainFocusedWindowAfterRestore,
    persistReaderState,
    persistence,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    scrollLayouts: renderCache.scrollLayouts,
    setScrollModeChapters,
    stopRestoreMask,
    viewportContentRef: viewport.contentRef,
  });

  const viewportSync = useScrollReaderViewportSync({
    chapterIndex,
    enabled,
    handleScroll,
    layoutQueries,
    novelFlowIndex,
    persistence,
    renderableScrollLayouts,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    scrollLayouts: renderCache.scrollLayouts,
    scrollReaderChapters,
    scrollViewportTop,
    syncViewportState,
    viewportContentRef: viewport.contentRef,
    viewportHeight: renderCache.viewportMetrics.scrollViewportHeight,
  });

  return {
    handleContentScroll: viewportSync.handleContentScroll,
    handleScrollChapterBodyElement: viewportSync.handleScrollChapterBodyElement,
    handleScrollChapterElement: viewportSync.handleScrollChapterElement,
    novelFlowIndex,
    renderableScrollLayouts,
    scrollFlowTotalHeight: novelFlowIndex?.totalScrollHeight ?? 0,
    syncViewportState,
    visibleScrollBlockRangeByChapter: viewportSync.visibleScrollBlockRangeByChapter,
  };
}
