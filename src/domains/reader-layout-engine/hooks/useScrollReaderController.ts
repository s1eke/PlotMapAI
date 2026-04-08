import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';

import type {
  ScrollAnchorSnapshot,
  UseScrollReaderControllerParams,
  UseScrollReaderControllerResult,
  VisibleScrollBlockRange,
} from './scrollReaderControllerTypes';
import type { ScrollModeAnchor } from './useScrollModeChapters';
import {
  EMPTY_PAGED_CHAPTERS,
  EMPTY_SCROLL_READER_CHAPTERS,
} from './scrollReaderControllerTypes';
import { useReaderRenderCache } from './useReaderRenderCache';
import { useScrollModeChapters } from './useScrollModeChapters';
import { useScrollReaderRestore } from './scrollReaderRestore';
import { useScrollReaderViewportSync } from './scrollReaderViewportSync';
import { useScrollReaderWindowing } from './scrollReaderWindowing';

export type {
  UseScrollReaderControllerResult,
} from './scrollReaderControllerTypes';

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

  useScrollReaderWindowing({
    cache,
    chapterIndex,
    chaptersLength: chapters.length,
    currentChapter,
    enabled,
    fetchChapterContent: fetchScrollChapterContent,
    layoutQueries,
    pendingRestoreTargetRef,
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
    persistReaderState({
      chapterIndex: locator?.chapterIndex ?? anchor.chapterIndex,
      mode: 'scroll',
      locator: locator ?? undefined,
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
