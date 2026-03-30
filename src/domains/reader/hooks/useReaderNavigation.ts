import type { Chapter, ChapterContent } from '../api/readerApi';
import type { ChapterChangeSource } from './navigationTypes';
import type { PageTarget, StoredReaderState } from './useReaderStatePersistence';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { usePagedChapterTransition } from './usePagedChapterTransition';

type NavigationDirection = 'next' | 'prev';

export function useReaderNavigation(
  chapterIndex: number,
  setChapterIndex: (idx: number) => void,
  currentChapter: ChapterContent | null,
  isPagedMode: boolean,
  pageIndex: number,
  setPageIndex: React.Dispatch<React.SetStateAction<number>>,
  pageCount: number,
  persistReaderState: (s: StoredReaderState) => void,
  pageTargetRef: React.MutableRefObject<PageTarget | null>,
  setPendingPageTarget: React.Dispatch<React.SetStateAction<PageTarget | null>>,
  chapters: Chapter[],
  scrollModeChapters: number[],
  hasUserInteractedRef: React.MutableRefObject<boolean>,
  chapterChangeSourceRef: React.MutableRefObject<ChapterChangeSource>,
  isChapterNavigationReady: boolean,
  beforeChapterChange?: () => void,
): {
  goToChapter: (targetIndex: number, pageTarget?: PageTarget) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  goToNextPageSilently: () => void;
  goToPrevPageSilently: () => void;
  handleNext: () => void;
  handlePrev: () => void;
  toolbarHasPrev: boolean;
  toolbarHasNext: boolean;
  pageTurnDirection: NavigationDirection;
  pageTurnToken: number;
} {
  const replayDirectionalNavigationRef = useRef<
    (direction: NavigationDirection, shouldAnimate: boolean) => void
  >(() => {});
  const [pageTurnState, setPageTurnState] = useState<{ direction: NavigationDirection; token: number }>({
    direction: 'next',
    token: 0,
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
    hasUserInteractedRef.current = true;
    chapterChangeSourceRef.current = 'navigation';
    pageTargetRef.current = pageTarget;
    setPendingPageTarget(pageTarget);
    setChapterIndex(targetIndex);
    persistReaderState({
      chapterIndex: targetIndex,
      chapterProgress: pageTarget === 'end' ? 1 : 0,
    });
    return true;
  }, [
    beforeChapterChange,
    chapterChangeSourceRef,
    chapters.length,
    hasUserInteractedRef,
    pageTargetRef,
    persistReaderState,
    setPendingPageTarget,
    setChapterIndex,
  ]);

  const { requestChapterNavigation, requestDirectionalNavigation } = usePagedChapterTransition({
    isPagedMode,
    chapterIndex,
    isChapterNavigationReady,
    chapterChangeSourceRef,
    onCommitChapterNavigation: commitChapterNavigation,
    onReplayDirectionalNavigation: (direction, shouldAnimate) => {
      replayDirectionalNavigationRef.current(direction, shouldAnimate);
    },
  });

  const stepNextPage = useCallback((allowChapterTransition: boolean) => {
    if (!currentChapter) {
      return false;
    }

    if (isPagedMode && (!isChapterNavigationReady || currentChapter.index !== chapterIndex)) {
      return false;
    }

    if (pageIndex < pageCount - 1) {
      setPageIndex((prev) => prev + 1);
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
    isChapterNavigationReady,
    isPagedMode,
    pageCount,
    pageIndex,
    requestChapterNavigation,
    setPageIndex,
  ]);

  const stepPrevPage = useCallback((allowChapterTransition: boolean) => {
    if (!currentChapter) {
      return false;
    }

    if (isPagedMode && (!isChapterNavigationReady || currentChapter.index !== chapterIndex)) {
      return false;
    }

    if (pageIndex > 0) {
      setPageIndex((prev) => prev - 1);
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
    isChapterNavigationReady,
    isPagedMode,
    pageIndex,
    requestChapterNavigation,
    setPageIndex,
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

  const goToChapter = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    requestChapterNavigation(targetIndex, pageTarget);
  }, [requestChapterNavigation]);

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

  const handleNext = useCallback(() => {
    if (isPagedMode) {
      goToNextPage();
      return;
    }

    if (chapterIndex < chapters.length - 1) {
      goToChapter(chapterIndex + 1, 'start');
    }
  }, [chapterIndex, chapters.length, goToChapter, goToNextPage, isPagedMode]);

  const handlePrev = useCallback(() => {
    if (isPagedMode) {
      goToPrevPage();
      return;
    }

    if (chapterIndex > 0) {
      goToChapter(chapterIndex - 1, 'start');
    }
  }, [chapterIndex, goToChapter, goToPrevPage, isPagedMode]);

  const toolbarHasPrev = isPagedMode
    ? pageIndex > 0 || Boolean(currentChapter?.hasPrev)
    : scrollModeChapters.length > 0
      ? chapterIndex > 0
      : chapterIndex > 0;
  const toolbarHasNext = isPagedMode
    ? pageIndex < pageCount - 1 || Boolean(currentChapter?.hasNext)
    : scrollModeChapters.length > 0
      ? chapterIndex < chapters.length - 1
      : chapterIndex < chapters.length - 1;

  return {
    goToChapter,
    goToNextPage,
    goToPrevPage,
    goToNextPageSilently,
    goToPrevPageSilently,
    handleNext,
    handlePrev,
    toolbarHasPrev,
    toolbarHasNext,
    pageTurnDirection: pageTurnState.direction,
    pageTurnToken: pageTurnState.token,
  };
}
