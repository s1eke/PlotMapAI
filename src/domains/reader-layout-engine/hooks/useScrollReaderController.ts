import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import { debugLog, setDebugSnapshot } from '@shared/debug';
import { getContainerProgress } from '@shared/utils/readerPosition';
import { toCanonicalPositionFromLocator } from '@shared/utils/readerStoredState';

import type {
  ScrollAnchorSnapshot,
  UseScrollReaderControllerParams,
  UseScrollReaderControllerResult,
  VisibleScrollBlockRange,
} from '../scroll-runtime/internal';
import type { ScrollModeAnchor } from '../scroll-runtime/internal';
import {
  EMPTY_PAGED_CHAPTERS,
  EMPTY_SCROLL_READER_CHAPTERS,
} from '../scroll-runtime/internal';
import { useReaderRenderCache } from '../render-cache/internal';
import {
  useScrollModeChapters,
  useScrollReaderRestore,
  useScrollReaderViewportSync,
  useScrollReaderWindowing,
} from '../scroll-runtime/internal';

export type {
  UseScrollReaderControllerResult,
} from '../scroll-runtime/internal';

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
    if (
      navigation.getChapterChangeSource() === 'navigation'
      || navigation.getChapterChangeSource() === 'restore'
    ) {
      return;
    }

    const locator = layoutQueries.getCurrentOriginalLocator();
    const scrollProgress = getContainerProgress(viewport.contentRef.current);
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
        chapterProgress: scrollProgress,
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
    pendingRestoreTargetRef,
    persistReaderState,
    persistence,
    setChapterIndex,
    viewport.contentRef,
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

  const renderableScrollLayouts = useMemo(
    () => scrollReaderChapters.flatMap((renderableScrollChapter) => {
      const layout = renderCache.scrollLayouts.get(renderableScrollChapter.index);
      return layout ? [{ ...renderableScrollChapter, layout }] : [];
    }),
    [renderCache.scrollLayouts, scrollReaderChapters],
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
    renderableScrollLayouts,
    syncViewportState,
    visibleScrollBlockRangeByChapter: viewportSync.visibleScrollBlockRangeByChapter,
  };
}
