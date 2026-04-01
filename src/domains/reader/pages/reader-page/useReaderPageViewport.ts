import type { Chapter, ChapterContent } from '../../api/readerApi';
import type { PageTarget, ReaderRestoreTarget } from '../../hooks/useReaderStatePersistence';
import type { ReaderLocator } from '../../utils/readerLayout';
import type { ScrollModeAnchor } from '../../hooks/useScrollModeChapters';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import { useReaderRenderCache } from '../../hooks/useReaderRenderCache';
import { useScrollModeChapters } from '../../hooks/useScrollModeChapters';
import {
  findVisibleBlockRange,
  findLocatorForLayoutOffset,
  findPageIndexForLocator,
  getOffsetForLocator,
  getPageStartLocator,
} from '../../utils/readerLayout';
import {
  getPageIndexFromProgress,
  resolvePagedTargetPage,
  SCROLL_READING_ANCHOR_RATIO,
} from '../../utils/readerPosition';
import { useReaderPageContext } from './ReaderPageContext';

interface ReaderPageViewportChapterData {
  fetchChapterContent: (
    index: number,
    options?: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    },
  ) => Promise<ChapterContent>;
  preloadAdjacent: (index: number, prune?: boolean) => void;
}

interface ReaderPageViewportPreferences {
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

interface UseReaderPageViewportParams {
  chapterData: ReaderPageViewportChapterData;
  chapterIndex: number;
  chapters: Chapter[];
  currentChapter: ChapterContent | null;
  isPagedMode: boolean;
  pageIndex: number;
  pageCount: number;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  preferences: ReaderPageViewportPreferences;
  scrollModeChapters: number[];
  setScrollModeChapters: React.Dispatch<React.SetStateAction<number[]>>;
  setPageCount: React.Dispatch<React.SetStateAction<number>>;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  setPendingPagedPageTarget: React.Dispatch<React.SetStateAction<PageTarget | null>>;
  stopRestoreMask: () => void;
  clearPendingRestoreTarget: () => void;
  onChapterContentResolvedRef: React.MutableRefObject<(chapterIndex: number) => void>;
  viewMode: 'original' | 'summary';
}

type ReaderPageViewportRenderCache = ReturnType<typeof useReaderRenderCache>;
type ReaderPagePagedLayout =
  ReaderPageViewportRenderCache['pagedLayouts'] extends Map<number, infer Layout>
    ? Layout
    : never;
type ReaderPageScrollLayout =
  ReaderPageViewportRenderCache['scrollLayouts'] extends Map<number, infer Layout>
    ? Layout
    : never;

interface ReaderPageViewportResult {
  currentPagedLayout: ReaderPagePagedLayout | null;
  previousChapterPreview: ChapterContent | null;
  previousPagedLayout: ReaderPagePagedLayout | null;
  nextChapterPreview: ChapterContent | null;
  nextPagedLayout: ReaderPagePagedLayout | null;
  renderableScrollLayouts: Array<{
    chapter: ChapterContent;
    index: number;
    layout: ReaderPageScrollLayout;
  }>;
  scrollModeChapters: number[];
  visibleScrollBlockRangeByChapter: Map<number, ReturnType<typeof findVisibleBlockRange>>;
  handlePagedViewportRef: (element: HTMLDivElement | null) => void;
  handleScrollChapterBodyElement: (index: number, element: HTMLDivElement | null) => void;
  handleScrollChapterElement: (index: number, element: HTMLDivElement | null) => void;
  syncViewportState: (options?: { force?: boolean }) => void;
}

function areVisibleBlockRangesEqual(
  previousRanges: ReadonlyMap<number, ReturnType<typeof findVisibleBlockRange>>,
  nextRanges: ReadonlyMap<number, ReturnType<typeof findVisibleBlockRange>>,
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

export function resolveCurrentScrollLocator(params: {
  chapterIndex: number;
  contentElement: HTMLDivElement | null;
  isPagedMode: boolean;
  scrollLayouts: ReadonlyMap<number, ReaderPageScrollLayout>;
  scrollChapterBodyElements: ReadonlyMap<number, HTMLDivElement>;
  scrollReaderChapters: Array<{ index: number; chapter: ChapterContent }>;
  viewMode: 'original' | 'summary';
}): ReaderLocator | null {
  if (
    params.isPagedMode
    || params.viewMode !== 'original'
    || !params.contentElement
    || params.scrollReaderChapters.length === 0
  ) {
    return null;
  }

  const visibleMarker =
    params.contentElement.scrollTop
    + params.contentElement.clientHeight * SCROLL_READING_ANCHOR_RATIO;
  const initialChapterIndex = params.scrollReaderChapters[0]?.index ?? params.chapterIndex;
  let currentLayout = params.scrollLayouts.get(initialChapterIndex) ?? null;
  let currentBodyElement = params.scrollChapterBodyElements.get(initialChapterIndex) ?? null;
  let currentTop = Number.NEGATIVE_INFINITY;

  for (const renderableChapter of params.scrollReaderChapters) {
    const chapterBodyElement = params.scrollChapterBodyElements.get(renderableChapter.index);
    const chapterLayout = params.scrollLayouts.get(renderableChapter.index);
    if (!chapterBodyElement || !chapterLayout) {
      continue;
    }
    if (
      chapterBodyElement.offsetTop <= visibleMarker &&
      chapterBodyElement.offsetTop > currentTop
    ) {
      currentBodyElement = chapterBodyElement;
      currentLayout = chapterLayout;
      currentTop = chapterBodyElement.offsetTop;
    }
  }

  if (!currentLayout || !currentBodyElement) {
    return null;
  }

  return findLocatorForLayoutOffset(currentLayout, visibleMarker - currentBodyElement.offsetTop);
}

export function resolveCurrentPagedLocator(params: {
  currentPagedLayout: ReaderPagePagedLayout | null;
  isPagedMode: boolean;
  pageIndex: number;
  viewMode: 'original' | 'summary';
}): ReaderLocator | null {
  if (!params.isPagedMode || params.viewMode !== 'original' || !params.currentPagedLayout) {
    return null;
  }

  return getPageStartLocator(params.currentPagedLayout.pageSlices[params.pageIndex]);
}

export function resolveCurrentScrollLocatorOffset(params: {
  locator: ReaderLocator;
  scrollChapterBodyElements: ReadonlyMap<number, HTMLDivElement>;
  scrollLayouts: ReadonlyMap<number, ReaderPageScrollLayout>;
}): number | null {
  const chapterBodyElement = params.scrollChapterBodyElements.get(params.locator.chapterIndex);
  const chapterLayout = params.scrollLayouts.get(params.locator.chapterIndex);
  if (!chapterBodyElement || !chapterLayout) {
    return null;
  }

  const offset = getOffsetForLocator(chapterLayout, params.locator);
  if (offset === null) {
    return null;
  }

  return chapterBodyElement.offsetTop + offset;
}

export function resolvePagedViewportState(params: {
  chapterIndex: number;
  currentPagedLayout: ReaderPagePagedLayout;
  pageIndex: number;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingPageTarget: PageTarget | null;
}): {
    pageCount: number;
    targetPage: number;
  } {
  const pageCount = Math.max(1, params.currentPagedLayout.pageSlices.length);
  const restoredPageIndex = params.pendingRestoreTarget?.locator
    ? findPageIndexForLocator(params.currentPagedLayout, params.pendingRestoreTarget.locator)
    : null;
  const chapterProgress = params.pendingRestoreTarget?.chapterProgress;
  const hasRestorableProgress = params.pendingRestoreTarget?.chapterIndex === params.chapterIndex
    && typeof chapterProgress === 'number';
  let targetPage = resolvePagedTargetPage(params.pendingPageTarget, params.pageIndex, pageCount);
  if (hasRestorableProgress) {
    targetPage = getPageIndexFromProgress(
      chapterProgress,
      pageCount,
    );
  }
  if (restoredPageIndex !== null) {
    targetPage = restoredPageIndex;
  }

  return {
    pageCount,
    targetPage,
  };
}

export function calculateVisibleScrollBlockRanges(params: {
  contentElement: HTMLDivElement | null;
  isPagedMode: boolean;
  renderableScrollLayouts: Array<{
    chapter: ChapterContent;
    index: number;
    layout: ReaderPageScrollLayout;
  }>;
  scrollChapterBodyElements: ReadonlyMap<number, HTMLDivElement>;
  scrollViewportHeight: number;
  scrollViewportTop: number;
  viewMode: 'original' | 'summary';
}): Map<number, ReturnType<typeof findVisibleBlockRange>> {
  if (params.isPagedMode || params.viewMode !== 'original' || !params.contentElement) {
    return new Map();
  }

  const viewportRect = params.contentElement.getBoundingClientRect();
  const viewportHeight = params.contentElement.clientHeight
    || viewportRect.height
    || params.scrollViewportHeight;
  if (viewportHeight <= 0) {
    return new Map();
  }

  const nextRanges = new Map<number, ReturnType<typeof findVisibleBlockRange>>();
  const overscanPx = Math.max(240, Math.round(viewportHeight * 0.75));
  for (const renderableChapter of params.renderableScrollLayouts) {
    const chapterBodyElement = params.scrollChapterBodyElements.get(renderableChapter.index);
    if (!chapterBodyElement) {
      continue;
    }

    const chapterBodyRect = chapterBodyElement.getBoundingClientRect();
    const offsetTop = Number.isFinite(viewportRect.top) && Number.isFinite(chapterBodyRect.top)
      ? viewportRect.top - chapterBodyRect.top
      : params.scrollViewportTop - chapterBodyElement.offsetTop;
    nextRanges.set(
      renderableChapter.index,
      findVisibleBlockRange(
        renderableChapter.layout,
        offsetTop,
        viewportHeight,
        overscanPx,
      ),
    );
  }

  return nextRanges;
}

export function useReaderPageViewport({
  chapterData,
  chapterIndex,
  chapters,
  currentChapter,
  isPagedMode,
  pageIndex,
  pageCount,
  pendingRestoreTargetRef,
  preferences,
  scrollModeChapters,
  setScrollModeChapters,
  setPageCount,
  setPageIndex,
  setPendingPagedPageTarget,
  stopRestoreMask,
  clearPendingRestoreTarget,
  onChapterContentResolvedRef,
  viewMode,
}: UseReaderPageViewportParams): ReaderPageViewportResult {
  const {
    novelId,
    contentRef,
    pagedViewportRef,
    pageTargetRef,
    chapterCacheRef,
    scrollChapterElementsBridgeRef,
    scrollChapterBodyElementsBridgeRef,
    getCurrentAnchorRef,
    handleScrollModeScrollRef,
    readingAnchorHandlerRef,
    getCurrentOriginalLocatorRef,
    getCurrentPagedLocatorRef,
    resolveScrollLocatorOffsetRef,
  } = useReaderPageContext();
  const chapterContentResolvedBridgeRef = onChapterContentResolvedRef;
  const [scrollReaderChapters, setScrollReaderChapters] = useState<
    Array<{ index: number; chapter: ChapterContent }>
  >([]);
  const [visibleScrollBlockRangeByChapter, setVisibleScrollBlockRangeByChapter] =
    useState<Map<number, ReturnType<typeof findVisibleBlockRange>>>(new Map());
  const [chapterCacheSnapshotState, setChapterCacheSnapshotState] = useState<{
    novelId: number;
    snapshot: Map<number, ChapterContent>;
  }>({
    novelId,
    snapshot: new Map(),
  });
  const [scrollContentVersion, setScrollContentVersion] = useState(0);
  const [pagedViewportElement, setPagedViewportElement] = useState<HTMLDivElement | null>(null);

  const handleChapterContentResolved = useCallback(() => {
    setChapterCacheSnapshotState({
      novelId,
      snapshot: new Map(chapterCacheRef.current),
    });
    setScrollContentVersion((previousVersion) => previousVersion + 1);
  }, [chapterCacheRef, novelId]);

  useEffect(() => {
    chapterContentResolvedBridgeRef.current = handleChapterContentResolved;
    return () => {
      chapterContentResolvedBridgeRef.current = () => {};
    };
  }, [chapterContentResolvedBridgeRef, handleChapterContentResolved]);

  const handleReadingAnchorChange = useCallback((anchor: ScrollModeAnchor) => {
    readingAnchorHandlerRef.current(anchor);
  }, [readingAnchorHandlerRef]);

  const scrollMode = useScrollModeChapters(
    contentRef,
    !isPagedMode && viewMode === 'original',
    chapters,
    chapterData.fetchChapterContent,
    chapterData.preloadAdjacent,
    scrollModeChapters,
    setScrollModeChapters,
    scrollContentVersion,
    handleReadingAnchorChange,
  );
  const {
    getCurrentAnchor: getCurrentScrollAnchor,
    handleScroll: handleScrollMode,
    scrollChapterElementsRef,
    scrollViewportTop,
    syncViewportState,
  } = scrollMode;

  useEffect(() => {
    getCurrentAnchorRef.current = getCurrentScrollAnchor;
    handleScrollModeScrollRef.current = handleScrollMode;
    return () => {
      getCurrentAnchorRef.current = () => null;
      handleScrollModeScrollRef.current = () => {};
    };
  }, [getCurrentAnchorRef, getCurrentScrollAnchor, handleScrollMode, handleScrollModeScrollRef]);

  useEffect(() => {
    setScrollReaderChapters(
      scrollModeChapters
        .map((index) => {
          const chapter = chapterCacheRef.current.get(index);
          return chapter ? { index, chapter } : null;
        })
        .filter((item): item is { index: number; chapter: ChapterContent } => Boolean(item)),
    );
  }, [chapterCacheRef, currentChapter, scrollContentVersion, scrollModeChapters]);

  const chapterCacheSnapshot = chapterCacheSnapshotState.novelId === novelId
    ? chapterCacheSnapshotState.snapshot
    : new Map<number, ChapterContent>();
  const previousChapterPreview = currentChapter?.hasPrev
    ? chapterCacheSnapshot.get(chapterIndex - 1) ?? null
    : null;
  const nextChapterPreview = currentChapter?.hasNext
    ? chapterCacheSnapshot.get(chapterIndex + 1) ?? null
    : null;

  const handlePagedViewportRef = useCallback((element: HTMLDivElement | null) => {
    pagedViewportRef.current = element;
    setPagedViewportElement(element);
  }, [pagedViewportRef]);

  const pagedChapters = useMemo(() => {
    const chaptersToLayout = new Map<number, ChapterContent>();
    for (const renderableChapter of [previousChapterPreview, currentChapter, nextChapterPreview]) {
      if (renderableChapter) {
        chaptersToLayout.set(renderableChapter.index, renderableChapter);
      }
    }
    return Array.from(chaptersToLayout.values());
  }, [currentChapter, nextChapterPreview, previousChapterPreview]);

  const renderCache = useReaderRenderCache({
    chapters,
    currentChapter,
    contentRef,
    fetchChapterContent: chapterData.fetchChapterContent,
    fontSize: preferences.fontSize,
    isPagedMode,
    lineSpacing: preferences.lineSpacing,
    novelId,
    pagedChapters,
    pagedViewportElement,
    paragraphSpacing: preferences.paragraphSpacing,
    scrollChapters: scrollReaderChapters,
    viewMode,
  });

  const currentPagedLayout = currentChapter
    ? renderCache.pagedLayouts.get(currentChapter.index) ?? null
    : null;
  const isActiveChapterResolved = currentChapter?.index === chapterIndex;
  const previousPagedLayout = previousChapterPreview
    ? renderCache.pagedLayouts.get(previousChapterPreview.index) ?? null
    : null;
  const nextPagedLayout = nextChapterPreview
    ? renderCache.pagedLayouts.get(nextChapterPreview.index) ?? null
    : null;

  const getCurrentScrollLocator = useCallback((): ReaderLocator | null => {
    return resolveCurrentScrollLocator({
      chapterIndex,
      contentElement: contentRef.current,
      isPagedMode,
      scrollLayouts: renderCache.scrollLayouts,
      scrollChapterBodyElements: scrollChapterBodyElementsBridgeRef.current,
      scrollReaderChapters,
      viewMode,
    });
  }, [
    chapterIndex,
    contentRef,
    isPagedMode,
    renderCache.scrollLayouts,
    scrollChapterBodyElementsBridgeRef,
    scrollReaderChapters,
    viewMode,
  ]);

  const getCurrentPagedLocator = useCallback((): ReaderLocator | null => {
    return resolveCurrentPagedLocator({
      currentPagedLayout,
      isPagedMode,
      pageIndex,
      viewMode,
    });
  }, [currentPagedLayout, isPagedMode, pageIndex, viewMode]);

  const resolveScrollLocatorOffset = useCallback((locator: ReaderLocator): number | null => {
    return resolveCurrentScrollLocatorOffset({
      locator,
      scrollChapterBodyElements: scrollChapterBodyElementsBridgeRef.current,
      scrollLayouts: renderCache.scrollLayouts,
    });
  }, [renderCache.scrollLayouts, scrollChapterBodyElementsBridgeRef]);

  useEffect(() => {
    getCurrentOriginalLocatorRef.current = getCurrentScrollLocator;
    getCurrentPagedLocatorRef.current = getCurrentPagedLocator;
    resolveScrollLocatorOffsetRef.current = resolveScrollLocatorOffset;
    return () => {
      getCurrentOriginalLocatorRef.current = () => null;
      getCurrentPagedLocatorRef.current = () => null;
      resolveScrollLocatorOffsetRef.current = () => null;
    };
  }, [
    getCurrentOriginalLocatorRef,
    getCurrentPagedLocatorRef,
    getCurrentPagedLocator,
    getCurrentScrollLocator,
    resolveScrollLocatorOffset,
    resolveScrollLocatorOffsetRef,
  ]);

  useEffect(() => {
    if (!isPagedMode || !currentPagedLayout || !isActiveChapterResolved) {
      const frameId = requestAnimationFrame(() => {
        setPageCount(1);
      });
      return () => cancelAnimationFrame(frameId);
    }

    const frameId = requestAnimationFrame(() => {
      const pendingRestoreTarget = pendingRestoreTargetRef.current;
      const nextViewportState = resolvePagedViewportState({
        chapterIndex,
        currentPagedLayout,
        pageIndex,
        pendingRestoreTarget,
        pendingPageTarget: pageTargetRef.current,
      });

      setPageCount(nextViewportState.pageCount);
      setPageIndex(nextViewportState.targetPage);
      pageTargetRef.current = null;
      setPendingPagedPageTarget(null);
      if (pendingRestoreTarget) {
        clearPendingRestoreTarget();
      }
      stopRestoreMask();
    });

    return () => cancelAnimationFrame(frameId);
  }, [
    chapterIndex,
    clearPendingRestoreTarget,
    currentPagedLayout,
    isActiveChapterResolved,
    isPagedMode,
    pageCount,
    pageIndex,
    pageTargetRef,
    pendingRestoreTargetRef,
    setPageCount,
    setPageIndex,
    setPendingPagedPageTarget,
    stopRestoreMask,
  ]);

  const renderableScrollLayouts = useMemo(
    () => scrollReaderChapters.flatMap((renderableScrollChapter) => {
      const layout = renderCache.scrollLayouts.get(renderableScrollChapter.index);
      return layout ? [{ ...renderableScrollChapter, layout }] : [];
    }),
    [renderCache.scrollLayouts, scrollReaderChapters],
  );

  useLayoutEffect(() => {
    const frameId = requestAnimationFrame(() => {
      if (isPagedMode || viewMode !== 'original') {
        setVisibleScrollBlockRangeByChapter((previousRanges) => (
          previousRanges.size === 0 ? previousRanges : new Map()
        ));
        return;
      }

      const viewportElement = contentRef.current;
      const nextRanges = calculateVisibleScrollBlockRanges({
        contentElement: viewportElement,
        isPagedMode,
        renderableScrollLayouts,
        scrollChapterBodyElements: scrollChapterBodyElementsBridgeRef.current,
        scrollViewportHeight: renderCache.viewportMetrics.scrollViewportHeight,
        scrollViewportTop,
        viewMode,
      });

      setVisibleScrollBlockRangeByChapter((previousRanges) => (
        areVisibleBlockRangesEqual(previousRanges, nextRanges) ? previousRanges : nextRanges
      ));
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    contentRef,
    isPagedMode,
    renderCache.viewportMetrics.scrollViewportHeight,
    renderableScrollLayouts,
    scrollChapterBodyElementsBridgeRef,
    scrollViewportTop,
    viewMode,
  ]);

  const handleScrollChapterElement = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (element) {
        scrollChapterElementsRef.current.set(index, element);
        scrollChapterElementsBridgeRef.current.set(index, element);
        return;
      }

      scrollChapterElementsRef.current.delete(index);
      scrollChapterElementsBridgeRef.current.delete(index);
    },
    [scrollChapterElementsBridgeRef, scrollChapterElementsRef],
  );

  const handleScrollChapterBodyElement = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (element) {
        scrollChapterBodyElementsBridgeRef.current.set(index, element);
        return;
      }
      scrollChapterBodyElementsBridgeRef.current.delete(index);
    },
    [scrollChapterBodyElementsBridgeRef],
  );

  return {
    currentPagedLayout,
    previousChapterPreview,
    previousPagedLayout,
    nextChapterPreview,
    nextPagedLayout,
    renderableScrollLayouts,
    scrollModeChapters,
    visibleScrollBlockRangeByChapter,
    handlePagedViewportRef,
    handleScrollChapterBodyElement,
    handleScrollChapterElement,
    syncViewportState,
  };
}
