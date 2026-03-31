import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { appPaths } from '@app/router/paths';
import { useChapterAnalysis } from '@domains/analysis';
import { translateAppError, type AppError } from '@shared/errors';

import type { Chapter, ChapterContent } from '../api/readerApi';
import type { ReaderLocator } from '../utils/readerLayout';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
  ReaderImageViewerState,
} from '../utils/readerImageGallery';
import { readerApi } from '../api/readerApi';
import ReaderSidebar from '../components/reader/ReaderSidebar';
import ReaderImageViewer from '../components/reader/ReaderImageViewer';
import ReaderTopBar from '../components/reader/ReaderTopBar';
import ReaderViewport from '../components/reader/ReaderViewport';
import ReaderToolbar from '../components/ReaderToolbar';
import { isPagedPageTurnMode, type ReaderPageTurnMode } from '../constants/pageTurnMode';
import { cn } from '@shared/utils/cn';
import { useReaderPreferences } from '../hooks/useReaderPreferences';
import { useReaderStatePersistence } from '../hooks/useReaderStatePersistence';
import type { PageTarget } from '../hooks/useReaderStatePersistence';
import { useSidebarDrag } from '../hooks/useSidebarDrag';
import { useReaderNavigation } from '../hooks/useReaderNavigation';
import { useReaderInput } from '../hooks/useReaderInput';
import { useScrollModeChapters } from '../hooks/useScrollModeChapters';
import type { ScrollModeAnchor } from '../hooks/useScrollModeChapters';
import { useContentClick } from '../hooks/useContentClick';
import { useReaderRestoreFlow } from '../hooks/useReaderRestoreFlow';
import { useReaderChapterData } from '../hooks/useReaderChapterData';
import { useReaderRenderCache } from '../hooks/useReaderRenderCache';
import { useReaderMobileBack } from '../hooks/useReaderMobileBack';
import {
  getReaderSessionSnapshot,
  setChapterIndex as setSessionChapterIndex,
  setMode as setSessionMode,
  useReaderSessionSelector,
} from '../hooks/sessionStore';
import { clearReaderImageResourcesForNovel } from '../utils/readerImageResourceCache';
import {
  createReaderImageEntryId,
} from '../utils/readerImageGallery';
import {
  findVisibleBlockRange,
  findLocatorForLayoutOffset,
  findPageIndexForLocator,
  getOffsetForLocator,
  getPageStartLocator,
} from '../utils/readerLayout';
import { getPageIndexFromProgress, resolvePagedTargetPage } from '../utils/readerPosition';

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

const INITIAL_IMAGE_VIEWER_STATE: ReaderImageViewerState = {
  activeEntry: null,
  isIndexLoading: false,
  isOpen: false,
  originRect: null,
  scale: 1,
  translateX: 0,
  translateY: 0,
};

function createClosedImageViewerState(
  previousState: ReaderImageViewerState,
): ReaderImageViewerState {
  return {
    ...previousState,
    isIndexLoading: false,
    isOpen: false,
    scale: 1,
    translateX: 0,
    translateY: 0,
  };
}

export default function ReaderPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);
  const {
    hasHydratedReaderState,
    setHasHydratedReaderState,
    latestReaderStateRef,
    hasUserInteractedRef,
    markUserInteracted,
    persistReaderState,
    loadPersistedReaderState,
  } = useReaderStatePersistence(novelId);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<ChapterContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [readerError, setReaderError] = useState<AppError | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pendingPagedPageTarget, setPendingPagedPageTarget] = useState<PageTarget | null>(null);
  const [scrollModeChapters, setScrollModeChapters] = useState<number[]>([]);
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
  const [imageGalleryEntries, setImageGalleryEntries] = useState<ReaderImageGalleryEntry[]>([]);
  const [isImageGalleryIndexResolved, setIsImageGalleryIndexResolved] = useState(false);
  const [imageViewerState, setImageViewerState] = useState<ReaderImageViewerState>(
    INITIAL_IMAGE_VIEWER_STATE,
  );

  const contentRef = useRef<HTMLDivElement>(null);
  const pagedViewportRef = useRef<HTMLDivElement>(null);
  const pageTargetRef = useRef<PageTarget | null>(null);
  const wheelDeltaRef = useRef(0);
  const pageTurnLockedRef = useRef(false);
  const chapterCacheRef = useRef<Map<number, ChapterContent>>(new Map());
  const scrollChapterElementsBridgeRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollChapterBodyElementsBridgeRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const imageGalleryEntriesRef = useRef<ReaderImageGalleryEntry[]>([]);
  const imageElementRegistryRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const imageViewerFocusRestoreRef = useRef<HTMLElement | null>(null);
  const imageGalleryIndexLoadTokenRef = useRef(0);
  const imageGalleryIndexPromiseRef = useRef<Promise<boolean> | null>(null);
  const getCurrentAnchorRef = useRef<() => ScrollModeAnchor | null>(() => null);
  const getCurrentOriginalLocatorRef = useRef<() => ReaderLocator | null>(() => null);
  const getCurrentPagedLocatorRef = useRef<() => ReaderLocator | null>(() => null);
  const resolveScrollLocatorOffsetRef = useRef<
    (locator: ReaderLocator) => number | null
      >(() => null);
  const handleScrollModeScrollRef = useRef<() => void>(() => {});
  const readingAnchorHandlerRef = useRef<(anchor: ScrollModeAnchor) => void>(() => {});

  const preferences = useReaderPreferences();
  const sidebar = useSidebarDrag();
  const closeSidebar = useCallback(() => {
    sidebar.setIsSidebarOpen(false);
  }, [sidebar]);
  const chapterIndex = useReaderSessionSelector((state) => state.chapterIndex);
  const restoreStatus = useReaderSessionSelector((state) => state.restoreStatus);
  const viewMode = useReaderSessionSelector((state) => state.viewMode);
  const analysis = useChapterAnalysis(novelId, viewMode === 'summary' ? chapterIndex : -1);
  const isTwoColumn = isPagedPageTurnMode(preferences.pageTurnMode);
  const isPagedMode = isTwoColumn && viewMode === 'original';
  const { handleMobileBack } = useReaderMobileBack({
    isSidebarOpen: sidebar.isSidebarOpen,
    closeSidebar,
    novelId,
  });

  const setChapterIndex = useCallback((nextState: React.SetStateAction<number>) => {
    const current = getReaderSessionSnapshot().chapterIndex;
    const nextValue = typeof nextState === 'function'
      ? nextState(current)
      : nextState;
    setSessionChapterIndex(nextValue, { persistRemote: false });
  }, []);

  const setViewMode = useCallback((nextState: React.SetStateAction<'original' | 'summary'>) => {
    const currentViewMode = getReaderSessionSnapshot().viewMode;
    const nextValue = typeof nextState === 'function'
      ? nextState(currentViewMode)
      : nextState;
    if (nextValue === 'summary') {
      setImageViewerState((previousState) => (
        previousState.isOpen
          ? createClosedImageViewerState(previousState)
          : previousState
      ));
    }
    let nextMode: 'paged' | 'scroll' | 'summary' = 'summary';
    if (nextValue !== 'summary') {
      nextMode = isPagedPageTurnMode(preferences.pageTurnMode) ? 'paged' : 'scroll';
    }
    setSessionMode(nextMode, { persistRemote: false });
  }, [preferences.pageTurnMode]);

  const setIsTwoColumn = useCallback((nextState: React.SetStateAction<boolean>) => {
    const currentSnapshot = getReaderSessionSnapshot();
    const currentValue = currentSnapshot.isTwoColumn;
    const nextValue = typeof nextState === 'function'
      ? nextState(currentValue)
      : nextState;
    if (currentSnapshot.viewMode === 'summary') {
      return;
    }
    setSessionMode(nextValue ? 'paged' : 'scroll', { persistRemote: false });
  }, []);

  useEffect(() => {
    imageGalleryEntriesRef.current = imageGalleryEntries;
  }, [imageGalleryEntries]);

  useEffect(() => {
    imageGalleryEntriesRef.current = [];
    imageElementRegistryRef.current.clear();
    imageViewerFocusRestoreRef.current = null;
    imageGalleryIndexLoadTokenRef.current += 1;
    imageGalleryIndexPromiseRef.current = null;
    startTransition(() => {
      setIsImageGalleryIndexResolved(false);
      setImageGalleryEntries([]);
      setImageViewerState(INITIAL_IMAGE_VIEWER_STATE);
    });
  }, [novelId]);

  useEffect(() => () => {
    imageGalleryIndexLoadTokenRef.current += 1;
    imageGalleryIndexPromiseRef.current = null;
  }, []);

  const restoreFlow = useReaderRestoreFlow({
    novelId,
    chapterIndex,
    setChapterIndex,
    viewMode,
    setViewMode,
    isTwoColumn,
    setIsTwoColumn,
    isPagedMode,
    pageIndex,
    pageCount,
    currentChapter,
    isLoading,
    scrollModeChapters,
    contentRef,
    scrollChapterElementsRef: scrollChapterElementsBridgeRef,
    latestReaderStateRef,
    hasHydratedReaderState,
    markUserInteracted,
    persistReaderState,
    getCurrentAnchorRef,
    handleScrollModeScrollRef,
    readingAnchorHandlerRef,
    getCurrentOriginalLocatorRef,
    getCurrentPagedLocatorRef,
    resolveScrollLocatorOffsetRef,
    summaryRestoreSignal: analysis.chapterAnalysis,
    isChapterAnalysisLoading: analysis.isChapterAnalysisLoading,
  });
  const { clearPendingRestoreState, pendingRestoreStateRef, stopRestoreMask } = restoreFlow;

  const handleChapterContentResolved = useCallback(() => {
    setChapterCacheSnapshotState({
      novelId,
      snapshot: new Map(chapterCacheRef.current),
    });
    setScrollContentVersion((prev) => prev + 1);
  }, [novelId]);

  const chapterData = useReaderChapterData({
    novelId,
    chapterIndex,
    viewMode,
    isPagedMode,
    isTwoColumn,
    chapters,
    setChapters,
    setCurrentChapter,
    setCurrentChapterWindow: setScrollModeChapters,
    setIsLoading,
    setChapterIndex,
    setViewMode,
    setIsTwoColumn,
    setPageIndex,
    setPageCount,
    setReaderError,
    contentRef,
    pagedViewportRef,
    chapterCacheRef,
    latestReaderStateRef,
    hasUserInteractedRef,
    wheelDeltaRef,
    pageTurnLockedRef,
    pageTargetRef,
    chapterChangeSourceRef: restoreFlow.chapterChangeSourceRef,
    loadPersistedReaderState,
    setHasHydratedReaderState,
    setPendingRestoreState: restoreFlow.setPendingRestoreState,
    clearPendingRestoreState: restoreFlow.clearPendingRestoreState,
    suppressScrollSyncTemporarily: restoreFlow.suppressScrollSyncTemporarily,
    startRestoreMaskForState: restoreFlow.startRestoreMaskForState,
    stopRestoreMask: restoreFlow.stopRestoreMask,
    setLoadingMessage,
    onChapterContentResolved: handleChapterContentResolved,
  });

  const setImageViewerLoading = useCallback((isIndexLoading: boolean) => {
    setImageViewerState((previousState) => (
      previousState.isIndexLoading === isIndexLoading
        ? previousState
        : {
          ...previousState,
          isIndexLoading,
        }
    ));
  }, []);

  const syncImageViewerLoadingState = useCallback(() => {
    setImageViewerLoading(Boolean(imageGalleryIndexPromiseRef.current));
  }, [setImageViewerLoading]);

  const ensureImageGalleryEntriesLoaded = useCallback(async (): Promise<boolean> => {
    if (isImageGalleryIndexResolved) {
      return true;
    }

    const existingPromise = imageGalleryIndexPromiseRef.current;
    if (existingPromise) {
      return existingPromise;
    }

    const loadToken = imageGalleryIndexLoadTokenRef.current;

    const loadPromise = readerApi.getImageGalleryEntries(novelId)
      .then((entries) => {
        if (imageGalleryIndexLoadTokenRef.current !== loadToken) {
          return false;
        }

        imageGalleryEntriesRef.current = entries;
        setImageGalleryEntries(entries);
        setIsImageGalleryIndexResolved(true);
        return true;
      })
      .catch(() => false);

    const trackedPromise = loadPromise.finally(() => {
      if (imageGalleryIndexPromiseRef.current === trackedPromise) {
        imageGalleryIndexPromiseRef.current = null;
      }
      syncImageViewerLoadingState();
    });

    imageGalleryIndexPromiseRef.current = trackedPromise;
    syncImageViewerLoadingState();
    return trackedPromise;
  }, [isImageGalleryIndexResolved, novelId, syncImageViewerLoadingState]);

  useEffect(() => {
    ensureImageGalleryEntriesLoaded();
  }, [ensureImageGalleryEntriesLoaded]);

  const getImageOriginRect = useCallback(
    (entry: ReaderImageGalleryEntry | null): DOMRect | null => {
      if (!entry) {
        return null;
      }

      const element = imageElementRegistryRef.current.get(createReaderImageEntryId(entry));
      if (!element || !element.isConnected) {
        return null;
      }

      return element.getBoundingClientRect();
    },
    [],
  );

  const handleRegisterImageElement = useCallback((
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => {
    const entryId = createReaderImageEntryId(entry);
    if (element) {
      imageElementRegistryRef.current.set(entryId, element);
      return;
    }

    const registeredElement = imageElementRegistryRef.current.get(entryId);
    if (!registeredElement || !registeredElement.isConnected) {
      imageElementRegistryRef.current.delete(entryId);
    }
  }, []);

  const handleReadingAnchorChange = useCallback((anchor: ScrollModeAnchor) => {
    readingAnchorHandlerRef.current(anchor);
  }, []);

  const scrollMode = useScrollModeChapters(
    contentRef,
    isPagedMode,
    viewMode,
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
  }, [getCurrentScrollAnchor, handleScrollMode]);

  useEffect(() => {
    setScrollReaderChapters(
      scrollModeChapters
        .map((index) => {
          const chapter = chapterCacheRef.current.get(index);
          return chapter ? { index, chapter } : null;
        })
        .filter((item): item is { index: number; chapter: ChapterContent } => Boolean(item)),
    );
  }, [currentChapter, scrollContentVersion, scrollModeChapters]);

  useEffect(() => {
    return () => {
      clearReaderImageResourcesForNovel(novelId);
    };
  }, [novelId]);

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
  }, []);

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
  const activeImageEntryId = imageViewerState.activeEntry
    ? createReaderImageEntryId(imageViewerState.activeEntry)
    : null;
  const activeImageIndex = useMemo(() => (
    activeImageEntryId
      ? imageGalleryEntries.findIndex(
        (entry) => createReaderImageEntryId(entry) === activeImageEntryId,
      )
      : -1
  ), [activeImageEntryId, imageGalleryEntries]);
  const activeImageEntry = activeImageIndex >= 0
    ? imageGalleryEntries[activeImageIndex] ?? null
    : imageViewerState.activeEntry;

  const currentPagedLayout = currentChapter
    ? renderCache.pagedLayouts.get(currentChapter.index) ?? null
    : null;
  const previousPagedLayout = previousChapterPreview
    ? renderCache.pagedLayouts.get(previousChapterPreview.index) ?? null
    : null;
  const nextPagedLayout = nextChapterPreview
    ? renderCache.pagedLayouts.get(nextChapterPreview.index) ?? null
    : null;

  const getCurrentScrollLocator = useCallback((): ReaderLocator | null => {
    if (
      isPagedMode ||
      viewMode !== 'original' ||
      !contentRef.current ||
      scrollReaderChapters.length === 0
    ) {
      return null;
    }

    const container = contentRef.current;
    const visibleMarker = container.scrollTop + container.clientHeight * 0.3;
    const initialChapterIndex = scrollReaderChapters[0]?.index ?? chapterIndex;
    let currentLayout = renderCache.scrollLayouts.get(initialChapterIndex) ?? null;
    let currentBodyElement =
      scrollChapterBodyElementsBridgeRef.current.get(initialChapterIndex) ?? null;
    let currentTop = Number.NEGATIVE_INFINITY;

    for (const renderableChapter of scrollReaderChapters) {
      const chapterBodyElement = scrollChapterBodyElementsBridgeRef.current.get(
        renderableChapter.index,
      );
      const chapterLayout = renderCache.scrollLayouts.get(renderableChapter.index);
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
  }, [
    chapterIndex,
    contentRef,
    isPagedMode,
    renderCache.scrollLayouts,
    scrollReaderChapters,
    viewMode,
  ]);

  const getCurrentPagedLocator = useCallback((): ReaderLocator | null => {
    if (!isPagedMode || viewMode !== 'original' || !currentPagedLayout) {
      return null;
    }

    return getPageStartLocator(currentPagedLayout.pageSlices[pageIndex]);
  }, [currentPagedLayout, isPagedMode, pageIndex, viewMode]);

  const resolveScrollLocatorOffset = useCallback((locator: ReaderLocator): number | null => {
    const chapterBodyElement = scrollChapterBodyElementsBridgeRef.current.get(locator.chapterIndex);
    const chapterLayout = renderCache.scrollLayouts.get(locator.chapterIndex);
    if (!chapterBodyElement || !chapterLayout) {
      return null;
    }

    const offset = getOffsetForLocator(chapterLayout, locator);
    if (offset === null) {
      return null;
    }

    return chapterBodyElement.offsetTop + offset;
  }, [renderCache.scrollLayouts]);

  useEffect(() => {
    getCurrentOriginalLocatorRef.current = getCurrentScrollLocator;
    getCurrentPagedLocatorRef.current = getCurrentPagedLocator;
    resolveScrollLocatorOffsetRef.current = resolveScrollLocatorOffset;
    return () => {
      getCurrentOriginalLocatorRef.current = () => null;
      getCurrentPagedLocatorRef.current = () => null;
      resolveScrollLocatorOffsetRef.current = () => null;
    };
  }, [getCurrentPagedLocator, getCurrentScrollLocator, resolveScrollLocatorOffset]);

  useEffect(() => {
    if (!isPagedMode || !currentPagedLayout || isLoading) {
      const frameId = requestAnimationFrame(() => {
        setPageCount(1);
      });
      return () => cancelAnimationFrame(frameId);
    }

    const frameId = requestAnimationFrame(() => {
      const nextPageCount = Math.max(1, currentPagedLayout.pageSlices.length);
      const pendingRestoreState = pendingRestoreStateRef.current;
      const restoredPageIndex = pendingRestoreState?.locator
        ? findPageIndexForLocator(currentPagedLayout, pendingRestoreState.locator)
        : null;
      const hasRestorableProgress = pendingRestoreState?.chapterIndex === chapterIndex
        && typeof pendingRestoreState.chapterProgress === 'number';
      let targetPage = resolvePagedTargetPage(pageTargetRef.current, pageIndex, nextPageCount);
      if (hasRestorableProgress) {
        targetPage = getPageIndexFromProgress(pendingRestoreState?.chapterProgress, nextPageCount);
      }
      if (restoredPageIndex !== null) {
        targetPage = restoredPageIndex;
      }

      setPageCount(nextPageCount);
      setPageIndex(targetPage);
      pageTargetRef.current = null;
      setPendingPagedPageTarget(null);
      if (pendingRestoreState) {
        clearPendingRestoreState();
      }
      stopRestoreMask();
    });

    return () => cancelAnimationFrame(frameId);
  }, [
    chapterIndex,
    clearPendingRestoreState,
    currentPagedLayout,
    isLoading,
    isPagedMode,
    pageIndex,
    pageTargetRef,
    pendingRestoreStateRef,
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
      if (!viewportElement) {
        return;
      }

      const viewportRect = viewportElement.getBoundingClientRect();
      const viewportHeight = viewportElement.clientHeight
        || viewportRect.height
        || renderCache.viewportMetrics.scrollViewportHeight;
      if (viewportHeight <= 0) {
        return;
      }

      const nextRanges = new Map<number, ReturnType<typeof findVisibleBlockRange>>();
      const overscanPx = Math.max(240, Math.round(viewportHeight * 0.75));
      const fallbackViewportTop = scrollViewportTop;
      for (const renderableChapter of renderableScrollLayouts) {
        const chapterBodyElement = scrollChapterBodyElementsBridgeRef.current.get(
          renderableChapter.index,
        );
        if (!chapterBodyElement) {
          continue;
        }

        const chapterBodyRect = chapterBodyElement.getBoundingClientRect();
        const offsetTop = Number.isFinite(viewportRect.top) && Number.isFinite(chapterBodyRect.top)
          ? viewportRect.top - chapterBodyRect.top
          : fallbackViewportTop - chapterBodyElement.offsetTop;
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

      setVisibleScrollBlockRangeByChapter((previousRanges) => (
        areVisibleBlockRangesEqual(previousRanges, nextRanges) ? previousRanges : nextRanges
      ));
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    isPagedMode,
    contentRef,
    renderCache.viewportMetrics.scrollViewportHeight,
    renderableScrollLayouts,
    scrollViewportTop,
    viewMode,
  ]);

  const isChapterNavigationReady = !isLoading
    && currentChapter?.index === chapterIndex
    && (!isPagedMode || currentPagedLayout?.chapterIndex === chapterIndex);

  const navigation = useReaderNavigation(
    chapterIndex,
    setChapterIndex,
    currentChapter,
    isPagedMode,
    pageIndex,
    setPageIndex,
    pageCount,
    persistReaderState,
    pageTargetRef,
    setPendingPagedPageTarget,
    chapters,
    scrollModeChapters,
    hasUserInteractedRef,
    restoreFlow.chapterChangeSourceRef,
    isChapterNavigationReady,
    restoreFlow.handleBeforeChapterChange,
  );

  const {
    isChromeVisible,
    setIsChromeVisible,
    handleContentClick,
  } = useContentClick(isPagedMode, navigation.handlePrev, navigation.handleNext);
  const isContentInteractionLocked =
    isChromeVisible || sidebar.isSidebarOpen || imageViewerState.isOpen;
  const dismissBlockedInteraction = useCallback(() => {
    if (sidebar.isSidebarOpen) {
      closeSidebar();
    }
    if (isChromeVisible) {
      setIsChromeVisible(false);
    }
    wheelDeltaRef.current = 0;
  }, [closeSidebar, isChromeVisible, setIsChromeVisible, sidebar.isSidebarOpen]);

  const closeImageViewer = useCallback(() => {
    const focusTarget = imageViewerFocusRestoreRef.current;
    setImageViewerState((previousState) => (
      previousState.isOpen
        ? createClosedImageViewerState(previousState)
        : previousState
    ));
    window.setTimeout(() => {
      if (focusTarget && focusTarget.isConnected) {
        focusTarget.focus();
      }
    }, 0);
  }, []);

  const handleImageActivate = useCallback((payload: ReaderImageActivationPayload) => {
    imageViewerFocusRestoreRef.current = payload.sourceElement;
    dismissBlockedInteraction();
    const nextActiveEntry = imageGalleryEntriesRef.current.find((entry) => (
      entry.chapterIndex === payload.chapterIndex
      && entry.blockIndex === payload.blockIndex
      && entry.imageKey === payload.imageKey
    )) ?? {
      blockIndex: payload.blockIndex,
      chapterIndex: payload.chapterIndex,
      imageKey: payload.imageKey,
      order: 0,
    };

    setImageViewerState({
      activeEntry: nextActiveEntry,
      isIndexLoading: !isImageGalleryIndexResolved,
      isOpen: true,
      originRect: payload.sourceElement.getBoundingClientRect(),
      scale: 1,
      translateX: 0,
      translateY: 0,
    });
    if (!isImageGalleryIndexResolved) {
      ensureImageGalleryEntriesLoaded();
    }
  }, [
    dismissBlockedInteraction,
    ensureImageGalleryEntriesLoaded,
    isImageGalleryIndexResolved,
  ]);

  const handleNavigateImage = useCallback(async (direction: 'next' | 'prev'): Promise<boolean> => {
    const currentEntry = activeImageEntry;
    if (!currentEntry) {
      return false;
    }

    if (!isImageGalleryIndexResolved) {
      const didResolveIndex = await ensureImageGalleryEntriesLoaded();
      if (!didResolveIndex) {
        return false;
      }
    }

    const currentEntryId = createReaderImageEntryId(currentEntry);
    let currentIndex = imageGalleryEntriesRef.current.findIndex(
      (entry) => createReaderImageEntryId(entry) === currentEntryId,
    );
    if (currentIndex === -1) {
      currentIndex = activeImageIndex;
    }

    const step = direction === 'next' ? 1 : -1;
    const candidateEntry = currentIndex >= 0
      ? imageGalleryEntriesRef.current[currentIndex + step] ?? null
      : null;
    if (candidateEntry) {
      setImageViewerState((previousState) => ({
        ...previousState,
        activeEntry: candidateEntry,
        isIndexLoading: false,
      }));
      return true;
    }

    return false;
  }, [
    activeImageEntry,
    activeImageIndex,
    ensureImageGalleryEntriesLoaded,
    isImageGalleryIndexResolved,
  ]);

  useReaderInput(
    contentRef,
    isPagedMode,
    navigation.goToNextPage,
    navigation.goToPrevPage,
    navigation.goToChapter,
    chapterIndex,
    currentChapter,
    isLoading,
    isContentInteractionLocked,
    dismissBlockedInteraction,
    wheelDeltaRef,
    pageTurnLockedRef,
  );

  const handleSetPageTurnMode = useCallback((nextMode: ReaderPageTurnMode) => {
    if (nextMode === preferences.pageTurnMode) {
      return;
    }

    const currentIsPagedMode = isPagedPageTurnMode(preferences.pageTurnMode);
    const nextIsPagedMode = isPagedPageTurnMode(nextMode);

    preferences.setPageTurnMode(nextMode);

    if (viewMode !== 'original') {
      return;
    }

    if (currentIsPagedMode !== nextIsPagedMode) {
      restoreFlow.handleSetIsTwoColumn(nextIsPagedMode);
    }
  }, [preferences, restoreFlow, viewMode]);

  const handleViewportClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (sidebar.isSidebarOpen) {
      dismissBlockedInteraction();
      return;
    }

    handleContentClick(event);
  }, [dismissBlockedInteraction, handleContentClick, sidebar.isSidebarOpen]);
  const handleRestoreContentScroll = restoreFlow.handleContentScroll;
  const handleViewportScroll = useCallback(() => {
    syncViewportState();
    handleRestoreContentScroll();
  }, [handleRestoreContentScroll, syncViewportState]);
  const { toolbarHasPrev } = navigation;
  const { toolbarHasNext } = navigation;

  const handleSelectChapter = useCallback((index: number) => {
    navigation.goToChapter(index, 'start');
    sidebar.setIsSidebarOpen(false);
  }, [navigation, sidebar]);

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
    [scrollChapterElementsRef],
  );

  const handleScrollChapterBodyElement = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (element) {
        scrollChapterBodyElementsBridgeRef.current.set(index, element);
        return;
      }
      scrollChapterBodyElementsBridgeRef.current.delete(index);
    },
    [],
  );

  const renderableChapter = !isLoading ? currentChapter : null;
  const showLoadingOverlay = isLoading
    || restoreStatus === 'restoring'
    || (isPagedMode && Boolean(renderableChapter) && currentPagedLayout === null);

  if (readerError) {
    return (
      <div className={cn('flex h-screen w-full items-center justify-center px-6 transition-colors duration-300', preferences.currentTheme.bg)}>
        <div className="w-full max-w-lg rounded-3xl border border-red-500/20 bg-card-bg/90 p-8 text-center shadow-xl">
          <p className="text-lg font-semibold text-text-primary">
            {translateAppError(readerError, t, 'reader.loadError')}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              {t('common.actions.retry')}
            </button>
            <Link
              to={appPaths.novel(novelId)}
              className="rounded-xl border border-border-color/30 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/5"
            >
              {t('reader.goBack')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-screen w-full overflow-hidden transition-colors duration-300', preferences.currentTheme.bg)}>
      <ReaderSidebar
        chapters={chapters}
        currentIndex={chapterIndex}
        contentTextColor={preferences.currentTheme.text}
        isSidebarOpen={sidebar.isSidebarOpen}
        sidebarBgClassName={preferences.currentTheme.sidebarBg}
        onClose={closeSidebar}
        onSelectChapter={handleSelectChapter}
      />

      <main className="flex-1 flex flex-col min-w-0 relative text-text-primary">
        <ReaderTopBar
          readerTheme={preferences.readerTheme}
          headerBgClassName={preferences.headerBg}
          textClassName={preferences.currentTheme.text}
          isChromeVisible={isChromeVisible}
          isSidebarOpen={sidebar.isSidebarOpen}
          novelId={novelId}
          viewMode={viewMode}
          onMobileBack={handleMobileBack}
          onToggleSidebar={sidebar.toggleSidebar}
          onSetViewMode={restoreFlow.handleSetViewMode}
        />

        <ReaderViewport
          contentRef={contentRef}
          isPagedMode={isPagedMode}
          interactionLocked={isContentInteractionLocked}
          viewMode={viewMode}
          renderableChapter={renderableChapter}
          showLoadingOverlay={showLoadingOverlay}
          isRestoringPosition={restoreFlow.isRestoringPosition}
          loadingLabel={restoreStatus === 'restoring' ? t('reader.restoringPosition') : loadingMessage}
          onBlockedInteraction={dismissBlockedInteraction}
          onContentClick={handleViewportClick}
          onContentScroll={handleViewportScroll}
          emptyHref={appPaths.novel(novelId)}
          emptyLabel={t('reader.noChapters')}
          goBackLabel={t('reader.goBack')}
          pagedContentProps={renderableChapter && isPagedMode ? {
            chapter: renderableChapter,
            currentLayout: currentPagedLayout,
            novelId,
            onImageActivate: handleImageActivate,
            onRegisterImageElement: handleRegisterImageElement,
            pageIndex,
            pendingPageTarget: pendingPagedPageTarget,
            pagedViewportRef: handlePagedViewportRef,
            readerTheme: preferences.readerTheme,
            textClassName: preferences.currentTheme.text,
            headerBgClassName: preferences.headerBg,
            pageBgClassName: preferences.currentTheme.bg,
            pageTurnMode: preferences.pageTurnMode,
            pageTurnDirection: navigation.pageTurnDirection,
            pageTurnToken: navigation.pageTurnToken,
            previousChapterPreview,
            previousLayout: previousPagedLayout,
            nextChapterPreview,
            nextLayout: nextPagedLayout,
            onRequestPrevPage: navigation.goToPrevPageSilently,
            onRequestNextPage: navigation.goToNextPageSilently,
            disableAnimation: restoreFlow.isRestoringPosition,
            interactionLocked: isContentInteractionLocked,
          } : undefined}
          scrollContentProps={renderableChapter && viewMode === 'original' && !isPagedMode ? {
            chapters: renderableScrollLayouts,
            novelId,
            onImageActivate: handleImageActivate,
            onRegisterImageElement: handleRegisterImageElement,
            readerTheme: preferences.readerTheme,
            textClassName: preferences.currentTheme.text,
            headerBgClassName: preferences.headerBg,
            onChapterElement: handleScrollChapterElement,
            onChapterBodyElement: handleScrollChapterBodyElement,
            visibleBlockRangeByChapter: visibleScrollBlockRangeByChapter,
          } : undefined}
          summaryContentProps={renderableChapter && viewMode === 'summary' ? {
            chapter: renderableChapter,
            novelId,
            analysis: analysis.chapterAnalysis,
            job: analysis.analysisStatus?.job ?? null,
            isLoading: analysis.isChapterAnalysisLoading,
            isAnalyzingChapter: analysis.isAnalyzingChapter,
            onAnalyzeChapter: analysis.handleAnalyzeChapter,
            readerTheme: preferences.readerTheme,
            textClassName: preferences.currentTheme.text,
            headerBgClassName: preferences.headerBg,
          } : undefined}
        />

        {currentChapter && !showLoadingOverlay && (
          <ReaderToolbar
            sliders={{
              fontSize: preferences.fontSize,
              setFontSize: preferences.setFontSize,
              lineSpacing: preferences.lineSpacing,
              setLineSpacing: preferences.setLineSpacing,
              paragraphSpacing: preferences.paragraphSpacing,
              setParagraphSpacing: preferences.setParagraphSpacing,
            }}
            pageTurnMode={preferences.pageTurnMode}
            setPageTurnMode={handleSetPageTurnMode}
            hasPrev={toolbarHasPrev}
            hasNext={toolbarHasNext}
            onPrev={navigation.handlePrev}
            onNext={navigation.handleNext}
            navigationMode={isPagedMode ? 'page' : 'chapter'}
            readerTheme={preferences.readerTheme}
            headerBgClassName={preferences.headerBg}
            textClassName={preferences.currentTheme.text}
            setReaderTheme={preferences.setReaderTheme}
            hidden={!isChromeVisible}
            isSidebarOpen={sidebar.isSidebarOpen}
            onToggleSidebar={sidebar.toggleSidebar}
            onCloseSidebar={closeSidebar}
          />
        )}

        <ReaderImageViewer
          activeEntry={activeImageEntry}
          activeIndex={activeImageIndex}
          canNavigateNext={Boolean(
            isImageGalleryIndexResolved
            && activeImageEntry
            && activeImageIndex >= 0
            && activeImageIndex < imageGalleryEntries.length - 1,
          )}
          canNavigatePrev={Boolean(
            isImageGalleryIndexResolved
            && activeImageEntry
            && activeImageIndex > 0,
          )}
          entries={imageGalleryEntries}
          getOriginRect={getImageOriginRect}
          isIndexResolved={isImageGalleryIndexResolved}
          isIndexLoading={imageViewerState.isIndexLoading}
          isOpen={imageViewerState.isOpen}
          novelId={novelId}
          onRequestClose={closeImageViewer}
          onRequestNavigate={handleNavigateImage}
        />
      </main>
    </div>
  );
}
