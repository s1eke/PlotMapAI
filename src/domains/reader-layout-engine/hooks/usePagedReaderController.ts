import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  Chapter,
  ChapterContent,
  PageTarget,
  ReaderChapterCacheApi,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  ReaderSessionCommands,
  ReaderSessionSnapshot,
} from '@shared/contracts/reader';
import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import { debugLog, setDebugSnapshot } from '@shared/debug';
import { createCanonicalPositionFromNavigationIntent } from '@shared/utils/readerPosition';
import { toCanonicalPositionFromLocator } from '@shared/utils/readerStoredState';
import { resolveCurrentPagedLocator } from '../layout-core/internal';
import {
  usePagedChapterPreviews,
  usePagedChapterTransition,
  usePagedReaderLayout,
} from '../paged-runtime/internal';
import { useReaderRenderCache } from '../render-cache/internal';
type NavigationDirection = 'next' | 'prev';
type DirectionalNavigationReplay = (
  direction: NavigationDirection,
  shouldAnimate: boolean,
) => void;
type PagedReaderRenderCache = ReturnType<typeof useReaderRenderCache>;
type PagedReaderLayout =
  PagedReaderRenderCache['pagedLayouts'] extends Map<number, infer Layout>
    ? Layout
    : never;

const EMPTY_SCROLL_CHAPTERS: Array<{ chapter: ChapterContent; index: number }> = [];

interface PagedReaderControllerPreferences {
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

interface UsePagedReaderControllerParams {
  enabled: boolean;
  novelId: number;
  chapters: Chapter[];
  currentChapter: ChapterContent | null;
  chapterDataRevision: number;
  sessionSnapshot: Pick<ReaderSessionSnapshot, 'chapterIndex'>;
  sessionCommands: Pick<
    ReaderSessionCommands,
    'hasUserInteractedRef' | 'persistReaderState' | 'setChapterIndex'
  >;
  cache: Pick<ReaderChapterCacheApi, 'snapshotCachedChapters'>;
  fetchChapterContent: (
    index: number,
    options?: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    },
  ) => Promise<ChapterContent>;
  preferences: PagedReaderControllerPreferences;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  clearPendingRestoreTarget: () => void;
  stopRestoreMask: () => void;
  beforeChapterChange?: () => void;
}

export interface UsePagedReaderControllerResult {
  currentPagedLayout: PagedReaderLayout | null;
  currentPagedLayoutChapterIndex: number | null;
  handlePagedContentRef: (element: HTMLDivElement | null) => void;
  handlePagedViewportRef: (element: HTMLDivElement | null) => void;
  nextChapterPreview: ChapterContent | null;
  nextPagedLayout: PagedReaderLayout | null;
  pageCount: number;
  pageIndex: number;
  pageTurnDirection: NavigationDirection;
  pageTurnToken: number;
  pendingPageTarget: PageTarget | null;
  previousChapterPreview: ChapterContent | null;
  previousPagedLayout: PagedReaderLayout | null;
  goToChapter: (targetIndex: number, pageTarget?: PageTarget) => void;
  goToNextPage: () => void;
  goToNextPageSilently: () => void;
  goToPrevPage: () => void;
  goToPrevPageSilently: () => void;
  handleNext: () => void;
  handlePrev: () => void;
  toolbarHasNext: boolean;
  toolbarHasPrev: boolean;
}

export function usePagedReaderController({
  enabled,
  novelId,
  chapters,
  currentChapter,
  chapterDataRevision,
  sessionSnapshot,
  sessionCommands,
  cache,
  fetchChapterContent,
  preferences,
  pendingRestoreTarget,
  pendingRestoreTargetRef,
  getRestoreAttempt,
  recordRestoreResult,
  clearPendingRestoreTarget,
  stopRestoreMask,
  beforeChapterChange,
}: UsePagedReaderControllerParams): UsePagedReaderControllerResult {
  const viewport = useReaderViewportContext();
  const navigation = useReaderNavigationRuntime();
  const persistence = useReaderPersistenceRuntime();
  const layoutQueries = useReaderLayoutQueries();
  const { chapterIndex } = sessionSnapshot;
  const {
    hasUserInteractedRef,
    persistReaderState,
    setChapterIndex,
  } = sessionCommands;
  const userInteractedRef = hasUserInteractedRef;
  const pagedContentRef = useRef<HTMLDivElement | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pendingPageTarget, setPendingPageTarget] = useState<PageTarget | null>(null);
  const [pageTurnState, setPageTurnState] = useState<{
    direction: NavigationDirection;
    token: number;
  }>({
    direction: 'next',
    token: 0,
  });
  const [pagedContentElement, setPagedContentElement] = useState<HTMLDivElement | null>(null);
  const [pagedViewportElement, setPagedViewportElement] = useState<HTMLDivElement | null>(null);
  const replayDirectionalNavigationRef = useRef<DirectionalNavigationReplay>(() => {});

  useEffect(() => {
    if (enabled) {
      return;
    }

    setPageIndex(0);
    setPageCount(1);
    setPendingPageTarget(null);
    navigation.setPendingPageTarget(null);
    navigation.setPagedState({ pageCount: 1, pageIndex: 0 });
    viewport.pagedViewportRef.current = null;
    pagedContentRef.current = null;
    setPagedContentElement(null);
    setPagedViewportElement(null);
  }, [enabled, navigation, viewport.pagedViewportRef]);

  const {
    nextChapterPreview,
    pagedChapters,
    previousChapterPreview,
  } = usePagedChapterPreviews({
    cache,
    chapterDataRevision,
    chapterIndex,
    currentChapter,
    enabled,
    novelId,
  });

  const handlePagedViewportRef = useCallback((element: HTMLDivElement | null) => {
    viewport.pagedViewportRef.current = element;
    setPagedViewportElement((previousElement) => (
      previousElement === element ? previousElement : element
    ));
  }, [viewport.pagedViewportRef]);
  const handlePagedContentRef = useCallback((element: HTMLDivElement | null) => {
    pagedContentRef.current = element;
    setPagedContentElement((previousElement) => (
      previousElement === element ? previousElement : element
    ));
  }, []);

  const renderCache = useReaderRenderCache({
    chapters,
    currentChapter: enabled ? currentChapter : null,
    contentRef: viewport.contentRef,
    fetchChapterContent,
    fontSize: preferences.fontSize,
    isPagedMode: true,
    lineSpacing: preferences.lineSpacing,
    novelId,
    pagedChapters,
    pagedViewportElement,
    paragraphSpacing: preferences.paragraphSpacing,
    scrollChapters: EMPTY_SCROLL_CHAPTERS,
    viewMode: 'original',
  });

  const currentPagedLayout = enabled && currentChapter
    ? renderCache.pagedLayouts.get(currentChapter.index) ?? null
    : null;
  const previousPagedLayout = enabled && previousChapterPreview
    ? renderCache.pagedLayouts.get(previousChapterPreview.index) ?? null
    : null;
  const nextPagedLayout = enabled && nextChapterPreview
    ? renderCache.pagedLayouts.get(nextChapterPreview.index) ?? null
    : null;
  const effectivePageCount = currentPagedLayout
    ? Math.max(1, currentPagedLayout.pageSlices.length)
    : pageCount;

  useEffect(() => {
    return layoutQueries.registerCurrentPagedLocatorResolver(() => {
      return resolveCurrentPagedLocator({
        currentPagedLayout,
        isPagedMode: enabled,
        pageIndex,
        viewMode: 'original',
      });
    });
  }, [currentPagedLayout, enabled, layoutQueries, pageIndex]);

  const clearPendingPageTarget = useCallback(() => {
    navigation.setPendingPageTarget(null);
    setPendingPageTarget(null);
  }, [navigation]);

  const pagedLayout = usePagedReaderLayout({
    chapterIndex,
    currentChapter,
    currentPagedLayout,
    isLoading: !currentPagedLayout || currentChapter?.index !== chapterIndex,
    enabled,
    pagedContentElement,
    pagedViewportElement,
    pageIndex,
    pendingPageTarget,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    getRestoreAttempt,
    recordRestoreResult,
    clearPendingRestoreTarget,
    clearPendingPageTarget,
    notifyRestoreSettled: persistence.notifyRestoreSettled,
    stopRestoreMask,
    setPageCount,
    setPageIndex,
    fontSize: preferences.fontSize,
    lineSpacing: preferences.lineSpacing,
    paragraphSpacing: preferences.paragraphSpacing,
  });
  const isPageNavigationReady = !enabled || (
    currentChapter !== null
    && currentChapter.index === chapterIndex
    && pagedLayout.readyChapterIndex === chapterIndex
  );

  const recordAnimatedPageTurn = useCallback((direction: NavigationDirection) => {
    setPageTurnState((previous) => ({
      direction,
      token: previous.token + 1,
    }));
  }, []);

  const commitChapterNavigation = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    if (targetIndex < 0 || targetIndex >= chapters.length) {
      return false;
    }

    beforeChapterChange?.();
    userInteractedRef.current = true;
    navigation.setChapterChangeSource('navigation');
    navigation.setPendingPageTarget(pageTarget);
    setPendingPageTarget(pageTarget);
    setChapterIndex(targetIndex);
    persistReaderState({
      canonical: createCanonicalPositionFromNavigationIntent({
        chapterIndex: targetIndex,
        pageTarget,
      }),
      hints: {
        contentMode: 'paged',
      },
    });
    return true;
  }, [
    beforeChapterChange,
    chapters.length,
    navigation,
    persistReaderState,
    setChapterIndex,
    userInteractedRef,
  ]);

  const { requestChapterNavigation, requestDirectionalNavigation } = usePagedChapterTransition({
    isPagedMode: enabled,
    chapterIndex,
    isChapterNavigationReady: isPageNavigationReady,
    getChapterChangeSource: navigation.getChapterChangeSource,
    onCommitChapterNavigation: commitChapterNavigation,
    onReplayDirectionalNavigation: (direction, shouldAnimate) => {
      replayDirectionalNavigationRef.current(direction, shouldAnimate);
    },
  });

  const stepNextPage = useCallback((allowChapterTransition: boolean) => {
    if (!enabled || !currentChapter) {
      return false;
    }

    if (!isPageNavigationReady || currentChapter.index !== chapterIndex) {
      return false;
    }

    if (pageIndex < effectivePageCount - 1) {
      setPageIndex((previousPageIndex) => previousPageIndex + 1);
      return true;
    }

    if (allowChapterTransition && currentChapter.hasNext && chapterIndex < chapters.length - 1) {
      requestChapterNavigation(chapterIndex + 1, 'start');
      return true;
    }

    return false;
  }, [
    chapterIndex,
    chapters.length,
    currentChapter,
    enabled,
    effectivePageCount,
    isPageNavigationReady,
    pageIndex,
    requestChapterNavigation,
  ]);

  const stepPrevPage = useCallback((allowChapterTransition: boolean) => {
    if (!enabled || !currentChapter) {
      return false;
    }

    if (!isPageNavigationReady || currentChapter.index !== chapterIndex) {
      return false;
    }

    if (pageIndex > 0) {
      setPageIndex((previousPageIndex) => previousPageIndex - 1);
      return true;
    }

    if (allowChapterTransition && currentChapter.hasPrev && chapterIndex > 0) {
      requestChapterNavigation(chapterIndex - 1, 'end');
      return true;
    }

    return false;
  }, [
    chapterIndex,
    currentChapter,
    enabled,
    isPageNavigationReady,
    pageIndex,
    requestChapterNavigation,
  ]);

  useLayoutEffect(() => {
    replayDirectionalNavigationRef.current = (direction, shouldAnimate) => {
      const didNavigate = direction === 'next'
        ? stepNextPage(false)
        : stepPrevPage(false);

      if (didNavigate && shouldAnimate) {
        recordAnimatedPageTurn(direction);
      }
    };
  }, [recordAnimatedPageTurn, stepNextPage, stepPrevPage]);

  const performNextPageTurn = useCallback((shouldAnimate: boolean) => {
    if (!requestDirectionalNavigation('next', shouldAnimate)) {
      return;
    }

    const didNavigate = stepNextPage(true);
    if (didNavigate && shouldAnimate) {
      recordAnimatedPageTurn('next');
    }
  }, [recordAnimatedPageTurn, requestDirectionalNavigation, stepNextPage]);

  const performPrevPageTurn = useCallback((shouldAnimate: boolean) => {
    if (!requestDirectionalNavigation('prev', shouldAnimate)) {
      return;
    }

    const didNavigate = stepPrevPage(true);
    if (didNavigate && shouldAnimate) {
      recordAnimatedPageTurn('prev');
    }
  }, [recordAnimatedPageTurn, requestDirectionalNavigation, stepPrevPage]);

  const goToChapter = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    requestChapterNavigation(targetIndex, pageTarget);
  }, [requestChapterNavigation]);

  const goToNextPage = useCallback(() => {
    performNextPageTurn(true);
  }, [performNextPageTurn]);

  const goToPrevPage = useCallback(() => {
    performPrevPageTurn(true);
  }, [performPrevPageTurn]);

  const goToNextPageSilently = useCallback(() => {
    performNextPageTurn(false);
  }, [performNextPageTurn]);

  const goToPrevPageSilently = useCallback(() => {
    performPrevPageTurn(false);
  }, [performPrevPageTurn]);

  const toolbarHasPrev = pageIndex > 0 || Boolean(currentChapter?.hasPrev);
  const toolbarHasNext = pageIndex < effectivePageCount - 1 || Boolean(currentChapter?.hasNext);

  useEffect(() => {
    if (!enabled || currentChapter?.index !== chapterIndex || pendingRestoreTargetRef.current) {
      return;
    }

    const locator = layoutQueries.getCurrentPagedLocator();
    if (!locator) {
      const persistFallbackSnapshot = {
        source: 'usePagedReaderController.persistCurrentPage',
        mode: 'paged',
        chapterIndex,
        pageIndex,
        fallbackReason: 'currentPagedLocator-null -> persist-chapter-start-edge',
      };
      setDebugSnapshot('reader-position-persist', persistFallbackSnapshot);
      debugLog('Reader', 'paged persist fallback to chapter start', persistFallbackSnapshot);
    }
    persistReaderState({
      canonical: toCanonicalPositionFromLocator(locator ?? undefined) ?? {
        chapterIndex,
        edge: 'start',
      },
      hints: {
        pageIndex: locator?.pageIndex ?? pageIndex,
        contentMode: 'paged',
      },
    });
  }, [
    chapterIndex,
    currentChapter,
    enabled,
    layoutQueries,
    pageIndex,
    pendingRestoreTargetRef,
    persistReaderState,
  ]);

  useEffect(() => {
    navigation.setPagedState({
      pageCount: effectivePageCount,
      pageIndex,
    });
  }, [effectivePageCount, navigation, pageIndex]);

  return {
    currentPagedLayout,
    currentPagedLayoutChapterIndex: pagedLayout.readyChapterIndex,
    handlePagedContentRef,
    handlePagedViewportRef,
    nextChapterPreview,
    nextPagedLayout,
    pageCount: effectivePageCount,
    pageIndex,
    pageTurnDirection: pageTurnState.direction,
    pageTurnToken: pageTurnState.token,
    pendingPageTarget,
    previousChapterPreview,
    previousPagedLayout,
    goToChapter,
    goToNextPage,
    goToNextPageSilently,
    goToPrevPage,
    goToPrevPageSilently,
    handleNext: goToNextPage,
    handlePrev: goToPrevPage,
    toolbarHasNext,
    toolbarHasPrev,
  };
}
