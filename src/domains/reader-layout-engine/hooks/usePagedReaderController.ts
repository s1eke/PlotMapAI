import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PageTarget } from '@shared/contracts/reader';
import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import { createCanonicalPositionFromNavigationIntent } from '@shared/utils/readerPosition';
import {
  findPageIndexForLocator,
  resolveCurrentPagedLocator,
} from '../layout-core/internal';
import {
  usePagedChapterPreviews,
  usePagedChapterTransition,
  usePagedReaderLayout,
} from '../paged-runtime/internal';
import { useReaderRenderCache } from '../render-cache/internal';
import {
  EMPTY_SCROLL_CHAPTERS,
  type DirectionalNavigationReplay,
  type UsePagedReaderControllerParams,
  type UsePagedReaderControllerResult,
} from './pagedReaderControllerTypes';
import { usePagedReaderDisabledReset } from './usePagedReaderDisabledReset';
import { usePagedReaderFlowProjection } from './usePagedReaderFlowProjection';
import { usePagedReaderPageTurnState } from './usePagedReaderPageTurnState';
import { usePagedReaderPositionPersistence } from './usePagedReaderPositionPersistence';
import { usePagedReaderControllerTrace } from './usePagedReaderControllerTrace';

export type { UsePagedReaderControllerResult } from './pagedReaderControllerTypes';
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
  const { chapterIndex, locator: sessionLocator } = sessionSnapshot;
  const {
    hasUserInteractedRef,
    persistReaderState,
    setChapterIndex,
  } = sessionCommands;
  const userInteractedRef = hasUserInteractedRef;
  const pagedContentRef = useRef<HTMLDivElement | null>(null);
  const lastPersistedPagedPageIndexRef = useRef<number | null>(null);
  const hasPagedNavigationSinceLastPersistRef = useRef(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pendingPageTarget, setPendingPageTarget] = useState<PageTarget | null>(null);
  const { pageTurnDirection, pageTurnToken, recordAnimatedPageTurn } =
    usePagedReaderPageTurnState();
  const [pagedContentElement, setPagedContentElement] = useState<HTMLDivElement | null>(null);
  const [pagedViewportElement, setPagedViewportElement] = useState<HTMLDivElement | null>(null);
  const replayDirectionalNavigationRef = useRef<DirectionalNavigationReplay>(() => {});
  usePagedReaderDisabledReset({
    enabled,
    lastPersistedPagedPageIndexRef,
    navigation,
    pagedContentRef,
    pagedViewportRef: viewport.pagedViewportRef,
    setPageCount,
    setPageIndex,
    setPagedContentElement,
    setPagedViewportElement,
    setPendingPageTarget,
  });
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
  const {
    calibrateDisplayPage,
    displayPageCount,
    displayPageIndex,
    displayPageState,
    incrementDisplayPage,
    pagedNovelFlowIndex,
    suppressNextChapterCalibration,
    suppressNextPageIndexCalibration,
  } =
    usePagedReaderFlowProjection({
      chapterCount: chapters.length,
      chapterIndex,
      chapters,
      currentChapterIndex: currentChapter?.index ?? null,
      enabled,
      novelId,
      pageIndex,
      renderCache,
      sessionLocator,
    });
  const effectivePageCountRef = useRef(effectivePageCount);
  effectivePageCountRef.current = effectivePageCount;
  const setPageIndexAndSyncRuntime = useCallback((nextPageIndex: React.SetStateAction<number>) => {
    setPageIndex((previousPageIndex) => {
      const resolvedPageIndex = typeof nextPageIndex === 'function'
        ? nextPageIndex(previousPageIndex)
        : nextPageIndex;
      navigation.setPagedState({
        pageCount: effectivePageCountRef.current,
        pageIndex: resolvedPageIndex,
      });
      return resolvedPageIndex;
    });
  }, [navigation]);
  useEffect(() => {
    const unregisterCurrentLocator = layoutQueries.registerCurrentPagedLocatorResolver(() => {
      return resolveCurrentPagedLocator({
        currentPagedLayout,
        isPagedMode: enabled,
        pageIndex,
        viewMode: 'original',
      });
    });
    const unregisterPageIndexResolver = layoutQueries.registerPagedLocatorPageIndexResolver(
      (locator) => findPageIndexForLocator(currentPagedLayout, locator),
    );
    return () => {
      unregisterCurrentLocator();
      unregisterPageIndexResolver();
    };
  }, [currentPagedLayout, enabled, layoutQueries, pageIndex]);
  const clearPendingPageTarget = useCallback(() => {
    navigation.setPendingPageIndex(null);
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
    setPageIndex: setPageIndexAndSyncRuntime,
    fontSize: preferences.fontSize,
    lineSpacing: preferences.lineSpacing,
    paragraphSpacing: preferences.paragraphSpacing,
  });
  const isPageNavigationReady = !enabled || (
    currentChapter !== null
    && currentChapter.index === chapterIndex
    && pagedLayout.readyChapterIndex === chapterIndex
  );

  const commitChapterNavigation = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    if (targetIndex < 0 || targetIndex >= chapters.length) {
      return false;
    }

    beforeChapterChange?.();
    userInteractedRef.current = true;
    navigation.setChapterChangeSource('navigation');
    navigation.setPendingPageIndex(null);
    navigation.setPendingPageTarget(pageTarget);
    setPendingPageTarget(pageTarget);
    setChapterIndex(targetIndex);
    persistReaderState({
      canonical: createCanonicalPositionFromNavigationIntent({
        chapterIndex: targetIndex,
        pageTarget,
      }),
      hints: {
        chapterProgress: undefined,
        pageIndex: undefined,
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
      hasPagedNavigationSinceLastPersistRef.current = true;
      suppressNextPageIndexCalibration();
      setPageIndexAndSyncRuntime((previousPageIndex) => previousPageIndex + 1);
      incrementDisplayPage(1);
      return true;
    }

    if (allowChapterTransition && currentChapter.hasNext && chapterIndex < chapters.length - 1) {
      suppressNextChapterCalibration();
      suppressNextPageIndexCalibration();
      incrementDisplayPage(1);
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
    incrementDisplayPage,
    isPageNavigationReady,
    pageIndex,
    requestChapterNavigation,
    setPageIndexAndSyncRuntime,
    suppressNextChapterCalibration,
    suppressNextPageIndexCalibration,
  ]);

  const stepPrevPage = useCallback((allowChapterTransition: boolean) => {
    if (!enabled || !currentChapter) {
      return false;
    }

    if (!isPageNavigationReady || currentChapter.index !== chapterIndex) {
      return false;
    }

    if (pageIndex > 0) {
      hasPagedNavigationSinceLastPersistRef.current = true;
      suppressNextPageIndexCalibration();
      setPageIndexAndSyncRuntime((previousPageIndex) => previousPageIndex - 1);
      incrementDisplayPage(-1);
      return true;
    }

    if (allowChapterTransition && currentChapter.hasPrev && chapterIndex > 0) {
      suppressNextChapterCalibration();
      suppressNextPageIndexCalibration();
      incrementDisplayPage(-1);
      requestChapterNavigation(chapterIndex - 1, 'end');
      return true;
    }

    return false;
  }, [
    chapterIndex,
    currentChapter,
    enabled,
    incrementDisplayPage,
    isPageNavigationReady,
    pageIndex,
    requestChapterNavigation,
    setPageIndexAndSyncRuntime,
    suppressNextChapterCalibration,
    suppressNextPageIndexCalibration,
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
    if (targetIndex >= 0 && targetIndex < chapters.length) {
      calibrateDisplayPage({
        chapterIndex: targetIndex,
        localPageIndex: pageTarget === 'end' ? Number.MAX_SAFE_INTEGER : 0,
        reason: 'directory-jump',
      });
    }
    requestChapterNavigation(targetIndex, pageTarget);
  }, [calibrateDisplayPage, chapters.length, requestChapterNavigation]);

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

  usePagedReaderPositionPersistence({
    chapterIndex,
    currentChapterIndex: currentChapter?.index ?? null,
    enabled,
    hasPagedNavigationSinceLastPersistRef,
    lastPersistedPagedPageIndexRef,
    layoutQueries,
    navigation,
    pageIndex,
    pagedNovelFlowIndex,
    pendingPageTarget,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    persistReaderState,
    sessionPageIndex: sessionLocator?.pageIndex,
  });

  useEffect(() => {
    navigation.setPagedState({
      pageCount: effectivePageCount,
      pageIndex,
    });
  }, [effectivePageCount, navigation, pageIndex]);
  usePagedReaderControllerTrace({
    chapterIndex,
    currentChapterIndex: currentChapter?.index ?? null,
    effectivePageCount,
    enabled,
    pageIndex,
    pageTurnDirection,
    pageTurnToken,
    pendingRestoreTargetRef,
  });

  return {
    currentPagedLayout,
    currentPagedLayoutChapterIndex: pagedLayout.readyChapterIndex,
    handlePagedContentRef,
    handlePagedViewportRef,
    nextChapterPreview,
    nextPagedLayout,
    displayPageCount,
    displayPageIndex,
    displayPageState,
    pageCount: effectivePageCount,
    pageIndex,
    pagedNovelFlowIndex,
    pageTurnDirection,
    pageTurnToken,
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
