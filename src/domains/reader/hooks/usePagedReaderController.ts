import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Chapter, ChapterContent } from '../api/readerApi';
import type { ChapterChangeSource } from './navigationTypes';
import type {
  PageTarget,
  ReaderRestoreTarget,
  StoredReaderState,
} from './useReaderStatePersistence';
import { usePagedChapterTransition } from './usePagedChapterTransition';
import { usePagedReaderLayout } from './usePagedReaderLayout';
import { useReaderRenderCache } from './useReaderRenderCache';
import { resolveCurrentPagedLocator } from '../pages/reader-page/useReaderPageViewport';
import { clampProgress } from '../utils/readerPosition';
import { useReaderPageContext } from '../pages/reader-page/ReaderPageContext';

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

const EMPTY_PAGED_CHAPTERS: ChapterContent[] = [];
const EMPTY_SCROLL_CHAPTERS: Array<{ chapter: ChapterContent; index: number }> = [];

interface PagedReaderControllerPreferences {
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

interface UsePagedReaderControllerParams {
  enabled: boolean;
  chapterIndex: number;
  chapters: Chapter[];
  currentChapter: ChapterContent | null;
  contentVersion: number;
  fetchChapterContent: (
    index: number,
    options?: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    },
  ) => Promise<ChapterContent>;
  preferences: PagedReaderControllerPreferences;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  clearPendingRestoreTarget: () => void;
  stopRestoreMask: () => void;
  persistReaderState: (
    nextState: StoredReaderState,
    options?: { flush?: boolean },
  ) => void;
  chapterChangeSourceRef: React.MutableRefObject<ChapterChangeSource>;
  hasUserInteractedRef: React.MutableRefObject<boolean>;
  isChapterNavigationReady: boolean;
  setChapterIndex: (idx: number) => void;
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
  chapterIndex,
  chapters,
  currentChapter,
  contentVersion,
  fetchChapterContent,
  preferences,
  pendingRestoreTargetRef,
  clearPendingRestoreTarget,
  stopRestoreMask,
  persistReaderState,
  chapterChangeSourceRef,
  hasUserInteractedRef,
  isChapterNavigationReady,
  setChapterIndex,
  beforeChapterChange,
}: UsePagedReaderControllerParams): UsePagedReaderControllerResult {
  const userInteractedRef = hasUserInteractedRef;
  const navigationSourceRef = chapterChangeSourceRef;
  const {
    novelId,
    contentRef,
    pagedViewportRef,
    pageTargetRef,
    chapterCacheRef,
    getCurrentPagedLocatorRef,
  } = useReaderPageContext();
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
  const [chapterCacheSnapshotState, setChapterCacheSnapshotState] = useState<{
    novelId: number;
    snapshot: Map<number, ChapterContent>;
  }>({
    novelId,
    snapshot: new Map(),
  });
  const [pagedViewportElement, setPagedViewportElement] = useState<HTMLDivElement | null>(null);
  const replayDirectionalNavigationRef = useRef<DirectionalNavigationReplay>(() => {});

  useEffect(() => {
    setChapterCacheSnapshotState({
      novelId,
      snapshot: new Map(chapterCacheRef.current),
    });
  }, [chapterCacheRef, contentVersion, novelId]);

  useEffect(() => {
    if (enabled) {
      return;
    }

    setPageIndex(0);
    setPageCount(1);
    setPendingPageTarget(null);
    pagedViewportRef.current = null;
    pagedContentRef.current = null;
    setPagedViewportElement(null);
  }, [enabled, pagedViewportRef]);

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
    setPagedViewportElement((previousElement) => (
      previousElement === element ? previousElement : element
    ));
  }, [pagedViewportRef]);
  const handlePagedContentRef = useCallback((element: HTMLDivElement | null) => {
    pagedContentRef.current = element;
  }, []);

  const pagedChapters = useMemo(() => {
    if (!enabled) {
      return EMPTY_PAGED_CHAPTERS;
    }

    const chaptersToLayout = new Map<number, ChapterContent>();
    for (const renderableChapter of [previousChapterPreview, currentChapter, nextChapterPreview]) {
      if (renderableChapter) {
        chaptersToLayout.set(renderableChapter.index, renderableChapter);
      }
    }
    return Array.from(chaptersToLayout.values());
  }, [currentChapter, enabled, nextChapterPreview, previousChapterPreview]);

  const renderCache = useReaderRenderCache({
    chapters,
    currentChapter: enabled ? currentChapter : null,
    contentRef,
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

  const currentPagedLayout = currentChapter
    ? renderCache.pagedLayouts.get(currentChapter.index) ?? null
    : null;
  const previousPagedLayout = previousChapterPreview
    ? renderCache.pagedLayouts.get(previousChapterPreview.index) ?? null
    : null;
  const nextPagedLayout = nextChapterPreview
    ? renderCache.pagedLayouts.get(nextChapterPreview.index) ?? null
    : null;

  useEffect(() => {
    getCurrentPagedLocatorRef.current = () => {
      return resolveCurrentPagedLocator({
        currentPagedLayout,
        isPagedMode: enabled,
        pageIndex,
        viewMode: 'original',
      });
    };

    return () => {
      getCurrentPagedLocatorRef.current = () => null;
    };
  }, [currentPagedLayout, enabled, getCurrentPagedLocatorRef, pageIndex]);

  const pagedLayout = usePagedReaderLayout({
    chapterIndex,
    currentChapter,
    currentPagedLayout,
    isLoading: !currentPagedLayout || currentChapter?.index !== chapterIndex,
    enabled,
    pagedViewportRef,
    pagedContentRef,
    pageIndex,
    pageTargetRef,
    pendingRestoreTargetRef,
    clearPendingRestoreTarget,
    stopRestoreMask,
    setPageCount,
    setPageIndex,
    setPendingPageTarget,
    fontSize: preferences.fontSize,
    lineSpacing: preferences.lineSpacing,
    paragraphSpacing: preferences.paragraphSpacing,
  });

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
    navigationSourceRef.current = 'navigation';
    pageTargetRef.current = pageTarget;
    setPendingPageTarget(pageTarget);
    setChapterIndex(targetIndex);
    persistReaderState({
      chapterIndex: targetIndex,
      mode: 'paged',
      chapterProgress: pageTarget === 'end' ? 1 : 0,
    });
    return true;
  }, [
    beforeChapterChange,
    chapters.length,
    navigationSourceRef,
    pageTargetRef,
    persistReaderState,
    setChapterIndex,
    userInteractedRef,
  ]);

  const { requestChapterNavigation, requestDirectionalNavigation } = usePagedChapterTransition({
    isPagedMode: enabled,
    chapterIndex,
    isChapterNavigationReady,
    chapterChangeSourceRef: navigationSourceRef,
    onCommitChapterNavigation: commitChapterNavigation,
    onReplayDirectionalNavigation: (direction, shouldAnimate) => {
      replayDirectionalNavigationRef.current(direction, shouldAnimate);
    },
  });

  const stepNextPage = useCallback((allowChapterTransition: boolean) => {
    if (!enabled || !currentChapter) {
      return false;
    }

    if (!isChapterNavigationReady || currentChapter.index !== chapterIndex) {
      return false;
    }

    if (pageIndex < pageCount - 1) {
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
    isChapterNavigationReady,
    pageCount,
    pageIndex,
    requestChapterNavigation,
  ]);

  const stepPrevPage = useCallback((allowChapterTransition: boolean) => {
    if (!enabled || !currentChapter) {
      return false;
    }

    if (!isChapterNavigationReady || currentChapter.index !== chapterIndex) {
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
    isChapterNavigationReady,
    pageIndex,
    requestChapterNavigation,
  ]);

  useEffect(() => {
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
  const toolbarHasNext = pageIndex < pageCount - 1 || Boolean(currentChapter?.hasNext);

  useEffect(() => {
    if (!enabled || currentChapter?.index !== chapterIndex || pendingRestoreTargetRef.current) {
      return;
    }

    const pagedProgress = pageCount <= 1
      ? 0
      : clampProgress(pageIndex / (pageCount - 1));
    persistReaderState({
      chapterIndex,
      mode: 'paged',
      chapterProgress: pagedProgress,
    });
  }, [
    chapterIndex,
    currentChapter,
    enabled,
    pageCount,
    pageIndex,
    pendingRestoreTargetRef,
    persistReaderState,
  ]);

  return {
    currentPagedLayout,
    currentPagedLayoutChapterIndex: pagedLayout.readyChapterIndex,
    handlePagedContentRef,
    handlePagedViewportRef,
    nextChapterPreview,
    nextPagedLayout,
    pageCount,
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
