import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Chapter, ChapterContent, ReaderRestoreTarget } from '@shared/contracts/reader';
import type { ReaderChapterCacheApi } from '@domains/reader-content';
import type { ReaderSessionCommands, ReaderSessionSnapshot } from '@domains/reader-session';

import type { ScrollModeAnchor } from './useScrollModeChapters';
import {
  calculateVisibleScrollBlockRanges,
  resolveCurrentScrollLocator,
  resolveCurrentScrollLocatorOffset,
} from '../reader-layout/viewportLocators';
import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import { useReaderRenderCache } from './useReaderRenderCache';
import { useScrollModeChapters } from './useScrollModeChapters';
import { getChapterBoundaryLocator } from '../utils/readerLayout';
import {
  canSkipReaderRestore,
  SCROLL_READING_ANCHOR_RATIO,
} from '@shared/utils/readerPosition';

interface ScrollReaderControllerPreferences {
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

interface UseScrollReaderControllerParams {
  enabled: boolean;
  novelId: number;
  chapters: Chapter[];
  currentChapter: ChapterContent | null;
  chapterDataRevision: number;
  sessionSnapshot: Pick<ReaderSessionSnapshot, 'chapterIndex'>;
  sessionCommands: Pick<
    ReaderSessionCommands,
    'persistReaderState' | 'setChapterIndex'
  >;
  cache: Pick<
    ReaderChapterCacheApi,
    'getCachedChapter' | 'hasCachedChapter' | 'setCachedChapter'
  >;
  fetchChapterContent: (
    index: number,
    options?: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    },
  ) => Promise<ChapterContent>;
  preloadAdjacent: (index: number, prune?: boolean) => void;
  preferences: ScrollReaderControllerPreferences;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  clearPendingRestoreTarget: () => void;
  stopRestoreMask: () => void;
}

type ScrollReaderRenderCache = ReturnType<typeof useReaderRenderCache>;
type ScrollReaderLayout =
  ScrollReaderRenderCache['scrollLayouts'] extends Map<number, infer Layout>
    ? Layout
    : never;
type VisibleScrollBlockRangeByChapter = ReturnType<
  typeof calculateVisibleScrollBlockRanges
>;
type VisibleScrollBlockRange =
  VisibleScrollBlockRangeByChapter extends Map<number, infer Range>
    ? Range
    : never;

const EMPTY_PAGED_CHAPTERS: ChapterContent[] = [];
const EMPTY_SCROLL_READER_CHAPTERS: Array<{ index: number; chapter: ChapterContent }> = [];

function areVisibleScrollBlockRangesEqual(
  previousRanges: ReadonlyMap<number, VisibleScrollBlockRange>,
  nextRanges: ReadonlyMap<number, VisibleScrollBlockRange>,
): boolean {
  if (previousRanges.size !== nextRanges.size) {
    return false;
  }

  for (const [chapterIndex, nextRange] of nextRanges) {
    const previousRange = previousRanges.get(chapterIndex);
    if (
      !previousRange
      || previousRange.startIndex !== nextRange.startIndex
      || previousRange.endIndex !== nextRange.endIndex
    ) {
      return false;
    }
  }

  return true;
}

export interface UseScrollReaderControllerResult {
  handleContentScroll: () => void;
  handleScrollChapterBodyElement: (
    index: number,
    element: HTMLDivElement | null,
  ) => void;
  handleScrollChapterElement: (index: number, element: HTMLDivElement | null) => void;
  renderableScrollLayouts: Array<{
    chapter: ChapterContent;
    index: number;
    layout: ScrollReaderLayout;
  }>;
  syncViewportState: (options?: { force?: boolean }) => void;
  visibleScrollBlockRangeByChapter: Map<number, VisibleScrollBlockRange>;
}

function buildScrollWindow(
  chapterIndex: number,
  totalChapters: number,
): number[] {
  const nextWindow: number[] = [];
  for (let index = chapterIndex - 2; index <= chapterIndex + 2; index += 1) {
    if (index >= 0 && index < totalChapters) {
      nextWindow.push(index);
    }
  }

  return nextWindow;
}

function buildFocusedScrollWindow(
  chapterIndex: number,
  totalChapters: number,
): number[] {
  if (chapterIndex < 0 || chapterIndex >= totalChapters) {
    return [];
  }

  return [chapterIndex];
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
  const [visibleScrollBlockRangeByChapter, setVisibleScrollBlockRangeByChapter] =
    useState<Map<number, VisibleScrollBlockRange>>(new Map());
  const scrollAnchorSnapshotRef = useRef<{
    chapterIndex: number | null;
    chapterOffsetTop: number | null;
    firstRenderableChapterIndex: number | null;
    scrollTop: number;
  }>({
    chapterIndex: null,
    chapterOffsetTop: null,
    firstRenderableChapterIndex: null,
    scrollTop: 0,
  });

  useEffect(() => {
    if (!enabled) {
      setScrollModeChapters((previousWindow) => (
        previousWindow.length === 0 ? previousWindow : []
      ));
      setVisibleScrollBlockRangeByChapter((previousRanges) => (
        previousRanges.size === 0 ? previousRanges : new Map()
      ));
      scrollAnchorSnapshotRef.current = {
        chapterIndex: null,
        chapterOffsetTop: null,
        firstRenderableChapterIndex: null,
        scrollTop: 0,
      };
      scrollChapterBodyElementsRef.current.clear();
      layoutQueries.clearScrollChapterElements();
      layoutQueries.clearScrollChapterBodyElements();
    }
  }, [enabled, layoutQueries]);

  useEffect(() => {
    if (!enabled || !currentChapter || currentChapter.index !== chapterIndex) {
      return;
    }

    const activePendingTarget = pendingRestoreTargetRef.current;
    const shouldFocusRestoreWindow =
      activePendingTarget?.mode === 'scroll'
      && activePendingTarget.chapterIndex === chapterIndex;
    const nextWindow = shouldFocusRestoreWindow
      ? buildFocusedScrollWindow(chapterIndex, chapters.length)
      : buildScrollWindow(chapterIndex, chapters.length);
    setScrollModeChapters((previousWindow) => (
      previousWindow.length === nextWindow.length
      && previousWindow.every((index, position) => index === nextWindow[position])
        ? previousWindow
        : nextWindow
    ));

    nextWindow.forEach((windowIndex) => {
      if (!cache.hasCachedChapter(windowIndex)) {
        fetchChapterContent(windowIndex)
          .then((chapter) => {
            cache.setCachedChapter(chapter);
          })
          .catch(() => {});
      }
    });
  }, [
    cache,
    chapterIndex,
    chapters.length,
    currentChapter,
    enabled,
    fetchChapterContent,
    pendingRestoreTargetRef,
  ]);

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

  const fetchScrollChapterContent = useCallback((index: number) => {
    return fetchChapterContent(index);
  }, [fetchChapterContent]);

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

  const scrollReaderChapterCacheVersion = chapterDataRevision;
  const scrollReaderChapters = useMemo(() => {
    if (!enabled) {
      return EMPTY_SCROLL_READER_CHAPTERS;
    }

    // Recompute against the mutable chapter cache when chapter hydration advances.
    if (scrollReaderChapterCacheVersion < 0) {
      return EMPTY_SCROLL_READER_CHAPTERS;
    }

    return scrollModeChapters
      .map((index) => {
        const chapter = cache.getCachedChapter(index);
        return chapter ? { index, chapter } : null;
      })
      .filter((item): item is { index: number; chapter: ChapterContent } => Boolean(item));
  }, [cache, enabled, scrollModeChapters, scrollReaderChapterCacheVersion]);

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

  const ensureScrollRestoreWindow = useCallback((target: ReaderRestoreTarget) => {
    const targetChapterIndex = target.locator?.chapterIndex ?? target.chapterIndex;
    if (targetChapterIndex < 0 || targetChapterIndex >= chapters.length) {
      return;
    }

    setScrollModeChapters((previousWindow) => {
      const nextWindow = buildFocusedScrollWindow(targetChapterIndex, chapters.length);
      return previousWindow.length === nextWindow.length
        && previousWindow.every((index, position) => index === nextWindow[position])
        ? previousWindow
        : nextWindow;
    });
  }, [chapters.length]);

  const resolvePendingRestoreLocator = useCallback((target: ReaderRestoreTarget) => {
    if (target.locator) {
      return target.locator;
    }

    if (target.locatorBoundary === undefined) {
      return null;
    }

    const chapterLayout = renderCache.scrollLayouts.get(target.chapterIndex) ?? null;
    return getChapterBoundaryLocator(chapterLayout, target.locatorBoundary);
  }, [renderCache.scrollLayouts]);

  const resolvePendingScrollTarget = useCallback((target: ReaderRestoreTarget) => {
    const container = viewport.contentRef.current;
    if (!container) {
      return { status: 'pending' as const };
    }

    const targetChapterIndex = target.locator?.chapterIndex ?? target.chapterIndex;
    const targetElement = scrollChapterElementsRef.current.get(targetChapterIndex) ?? null;
    const resolvedLocator = resolvePendingRestoreLocator(target);

    if (target.locatorBoundary !== undefined && resolvedLocator === null) {
      const hasResolvedBoundaryLayout = renderCache.scrollLayouts.has(target.chapterIndex)
        && scrollChapterBodyElementsRef.current.has(target.chapterIndex);
      if (!hasResolvedBoundaryLayout) {
        return { status: 'pending' as const };
      }
    }

    if (resolvedLocator) {
      if (target.locatorBoundary === 'start' && targetElement) {
        return {
          status: 'resolved' as const,
          locator: resolvedLocator,
          scrollTop: Math.max(0, Math.round(targetElement.offsetTop)),
        };
      }

      const nextScrollTop = layoutQueries.resolveScrollLocatorOffset(resolvedLocator);
      if (nextScrollTop !== null) {
        return {
          status: 'resolved' as const,
          locator: resolvedLocator,
          scrollTop: Math.max(
            0,
            Math.round(nextScrollTop - container.clientHeight * SCROLL_READING_ANCHOR_RATIO),
          ),
        };
      }

      const hasResolvedChapterLayout = renderCache.scrollLayouts.has(resolvedLocator.chapterIndex)
        && scrollChapterBodyElementsRef.current.has(resolvedLocator.chapterIndex);
      if (!hasResolvedChapterLayout) {
        return { status: 'pending' as const };
      }
    }

    if (resolvedLocator || target.locatorBoundary !== undefined) {
      return { status: 'invalid' as const };
    }

    if (!targetElement) {
      return { status: 'pending' as const };
    }

    return { status: 'invalid' as const };
  }, [
    layoutQueries,
    renderCache.scrollLayouts,
    resolvePendingRestoreLocator,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    viewport.contentRef,
  ]);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    const container = viewport.contentRef.current;
    const activeChapterElement = scrollChapterElementsRef.current.get(chapterIndex) ?? null;
    const nextChapterOffsetTop = activeChapterElement?.offsetTop ?? null;
    const nextFirstRenderableChapterIndex = renderableScrollLayouts[0]?.index ?? null;
    const nextScrollTop = container?.scrollTop ?? 0;
    const previousSnapshot = scrollAnchorSnapshotRef.current;

    if (
      container
      && previousSnapshot.chapterIndex === chapterIndex
      && previousSnapshot.chapterOffsetTop !== null
      && previousSnapshot.firstRenderableChapterIndex !== null
      && nextChapterOffsetTop !== null
      && nextFirstRenderableChapterIndex !== null
      && nextFirstRenderableChapterIndex < previousSnapshot.firstRenderableChapterIndex
    ) {
      const chapterOffsetDelta = nextChapterOffsetTop - previousSnapshot.chapterOffsetTop;
      if (chapterOffsetDelta > 0.5) {
        const scrollTopDelta = nextScrollTop - previousSnapshot.scrollTop;
        const uncompensatedOffsetDelta = chapterOffsetDelta - scrollTopDelta;

        if (Math.abs(uncompensatedOffsetDelta) > 0.5) {
          persistence.suppressScrollSyncTemporarily();
          container.scrollTop += uncompensatedOffsetDelta;
          syncViewportState({ force: true });
        }
      }
    }

    scrollAnchorSnapshotRef.current = {
      chapterIndex,
      chapterOffsetTop: nextChapterOffsetTop,
      firstRenderableChapterIndex: nextFirstRenderableChapterIndex,
      scrollTop: container?.scrollTop ?? nextScrollTop,
    };
  }, [
    chapterIndex,
    enabled,
    persistence,
    renderableScrollLayouts,
    scrollChapterElementsRef,
    syncViewportState,
    viewport.contentRef,
  ]);

  const getCurrentScrollLocator = useCallback(() => {
    return resolveCurrentScrollLocator({
      chapterIndex,
      contentElement: viewport.contentRef.current,
      isPagedMode: false,
      scrollLayouts: renderCache.scrollLayouts,
      scrollChapterBodyElements: scrollChapterBodyElementsRef.current,
      scrollReaderChapters,
      viewMode: 'original',
    });
  }, [
    chapterIndex,
    renderCache.scrollLayouts,
    scrollReaderChapters,
    viewport.contentRef,
  ]);

  const resolveScrollLocatorOffset = useCallback(
    (locator: Parameters<typeof resolveCurrentScrollLocatorOffset>[0]['locator']) => {
      return resolveCurrentScrollLocatorOffset({
        locator,
        scrollChapterBodyElements: scrollChapterBodyElementsRef.current,
        scrollLayouts: renderCache.scrollLayouts,
      });
    },
    [renderCache.scrollLayouts],
  );

  useEffect(() => {
    const unregisterLocator = layoutQueries.registerCurrentOriginalLocatorResolver(
      getCurrentScrollLocator,
    );
    const unregisterOffset = layoutQueries.registerScrollLocatorOffsetResolver(
      resolveScrollLocatorOffset,
    );
    return () => {
      unregisterLocator();
      unregisterOffset();
    };
  }, [getCurrentScrollLocator, layoutQueries, resolveScrollLocatorOffset]);

  useLayoutEffect(() => {
    const frameId = requestAnimationFrame(() => {
      if (!enabled) {
        setVisibleScrollBlockRangeByChapter((previousRanges) => (
          previousRanges.size === 0 ? previousRanges : new Map()
        ));
        return;
      }

      const viewportElement = viewport.contentRef.current;
      const nextRanges = calculateVisibleScrollBlockRanges({
        contentElement: viewportElement,
        isPagedMode: false,
        renderableScrollLayouts,
        scrollChapterBodyElements: scrollChapterBodyElementsRef.current,
        scrollViewportHeight: renderCache.viewportMetrics.scrollViewportHeight,
        scrollViewportTop,
        viewMode: 'original',
      });

      setVisibleScrollBlockRangeByChapter((previousRanges) => (
        areVisibleScrollBlockRangesEqual(previousRanges, nextRanges)
          ? previousRanges
          : nextRanges
      ));
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    enabled,
    renderCache.viewportMetrics.scrollViewportHeight,
    renderableScrollLayouts,
    viewport.contentRef,
    scrollViewportTop,
  ]);

  useEffect(() => {
    if (!enabled || currentChapter?.index !== chapterIndex) {
      return;
    }

    const pendingTarget = pendingRestoreTarget ?? pendingRestoreTargetRef.current;
    if (!pendingTarget || pendingTarget.mode !== 'scroll') {
      return;
    }

    if (canSkipReaderRestore(pendingTarget)) {
      navigation.setChapterChangeSource(null);
      clearPendingRestoreTarget();
      stopRestoreMask();
      persistence.notifyRestoreSettled('skipped');
      return;
    }

    let frameId = 0;
    let cancelled = false;

    const restoreScrollPosition = () => {
      if (cancelled) {
        return;
      }

      const container = viewport.contentRef.current;
      if (!container) {
        frameId = requestAnimationFrame(restoreScrollPosition);
        return;
      }

      const resolvedTarget = resolvePendingScrollTarget(pendingTarget);
      if (resolvedTarget.status === 'pending') {
        ensureScrollRestoreWindow(pendingTarget);
        frameId = requestAnimationFrame(restoreScrollPosition);
        return;
      }

      if (resolvedTarget.status === 'invalid') {
        navigation.setChapterChangeSource(null);
        clearPendingRestoreTarget();
        stopRestoreMask();
        persistence.notifyRestoreSettled('skipped');
        return;
      }

      navigation.setChapterChangeSource('restore');
      persistence.suppressScrollSyncTemporarily();
      container.scrollTop = resolvedTarget.scrollTop;
      if (resolvedTarget.locator) {
        persistReaderState({
          chapterIndex: resolvedTarget.locator.chapterIndex,
          mode: 'scroll',
          locator: resolvedTarget.locator,
        });
      }
      navigation.setChapterChangeSource(null);
      clearPendingRestoreTarget();
      stopRestoreMask();
      persistence.notifyRestoreSettled('completed');
    };

    frameId = requestAnimationFrame(restoreScrollPosition);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    chapterIndex,
    clearPendingRestoreTarget,
    currentChapter,
    enabled,
    ensureScrollRestoreWindow,
    navigation,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    persistence,
    persistReaderState,
    resolvePendingScrollTarget,
    stopRestoreMask,
    viewport.contentRef,
  ]);

  const handleScrollChapterElement = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (element) {
        scrollChapterElementsRef.current.set(index, element);
      } else {
        scrollChapterElementsRef.current.delete(index);
      }

      layoutQueries.registerScrollChapterElement(index, element);
    },
    [layoutQueries, scrollChapterElementsRef],
  );

  const handleScrollChapterBodyElement = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (element) {
        scrollChapterBodyElementsRef.current.set(index, element);
      } else {
        scrollChapterBodyElementsRef.current.delete(index);
      }

      layoutQueries.registerScrollChapterBodyElement(index, element);
    },
    [layoutQueries],
  );

  const handleContentScroll = useCallback(() => {
    if (!enabled) {
      return;
    }

    if (persistence.isScrollSyncSuppressed()) {
      syncViewportState({ force: true });
      return;
    }

    handleScroll();
  }, [enabled, handleScroll, persistence, syncViewportState]);

  return {
    handleContentScroll,
    handleScrollChapterBodyElement,
    handleScrollChapterElement,
    renderableScrollLayouts,
    syncViewportState,
    visibleScrollBlockRangeByChapter,
  };
}
