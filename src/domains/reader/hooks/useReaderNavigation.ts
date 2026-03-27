import type { Chapter, ChapterContent } from '../api/readerApi';
import type { ChapterChangeSource } from './navigationTypes';
import type { PageTarget, StoredReaderState } from './useReaderStatePersistence';

import { useCallback, useLayoutEffect, useRef } from 'react';

import { usePagedChapterTransition } from './usePagedChapterTransition';

export function useReaderNavigation(
  chapterIndex: number,
  setChapterIndex: (idx: number) => void,
  currentChapter: ChapterContent | null,
  isPagedMode: boolean,
  pageIndex: number,
  setPageIndex: React.Dispatch<React.SetStateAction<number>>,
  pageCount: number,
  persistReaderState: (s: StoredReaderState) => void,
  pageTargetRef: React.MutableRefObject<PageTarget>,
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
  handleNext: () => void;
  handlePrev: () => void;
  toolbarHasPrev: boolean;
  toolbarHasNext: boolean;
} {
  const replayDirectionalNavigationRef = useRef<(direction: 'next' | 'prev') => void>(() => {});

  const commitChapterNavigation = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    if (targetIndex < 0 || targetIndex >= chapters.length) {
      return false;
    }

    beforeChapterChange?.();
    hasUserInteractedRef.current = true;
    chapterChangeSourceRef.current = 'navigation';
    pageTargetRef.current = pageTarget;
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
    setChapterIndex,
  ]);

  const { requestChapterNavigation, requestDirectionalNavigation } = usePagedChapterTransition({
    isPagedMode,
    chapterIndex,
    isChapterNavigationReady,
    chapterChangeSourceRef,
    onCommitChapterNavigation: commitChapterNavigation,
    onReplayDirectionalNavigation: (direction) => {
      replayDirectionalNavigationRef.current(direction);
    },
  });

  const stepNextPage = useCallback((allowChapterTransition: boolean) => {
    if (!currentChapter) return;

    if (isPagedMode && (!isChapterNavigationReady || currentChapter.index !== chapterIndex)) {
      return;
    }

    if (pageIndex < pageCount - 1) {
      setPageIndex((prev) => prev + 1);
      return;
    }

    if (allowChapterTransition && currentChapter.hasNext) {
      requestChapterNavigation(chapterIndex + 1, 'start');
    }
  }, [
    chapterIndex,
    currentChapter,
    isChapterNavigationReady,
    isPagedMode,
    pageCount,
    pageIndex,
    requestChapterNavigation,
    setPageIndex,
  ]);

  const stepPrevPage = useCallback((allowChapterTransition: boolean) => {
    if (!currentChapter) return;

    if (isPagedMode && (!isChapterNavigationReady || currentChapter.index !== chapterIndex)) {
      return;
    }

    if (pageIndex > 0) {
      setPageIndex((prev) => prev - 1);
      return;
    }

    if (allowChapterTransition && currentChapter.hasPrev) {
      requestChapterNavigation(chapterIndex - 1, 'end');
    }
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
    replayDirectionalNavigationRef.current = (direction) => {
      if (direction === 'next') {
        stepNextPage(false);
        return;
      }

      stepPrevPage(false);
    };
  }, [stepNextPage, stepPrevPage]);

  const goToChapter = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    requestChapterNavigation(targetIndex, pageTarget);
  }, [requestChapterNavigation]);

  const goToNextPage = useCallback(() => {
    if (!requestDirectionalNavigation('next')) {
      return;
    }

    stepNextPage(true);
  }, [requestDirectionalNavigation, stepNextPage]);

  const goToPrevPage = useCallback(() => {
    if (!requestDirectionalNavigation('prev')) {
      return;
    }

    stepPrevPage(true);
  }, [requestDirectionalNavigation, stepPrevPage]);

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
    handleNext,
    handlePrev,
    toolbarHasPrev,
    toolbarHasNext,
  };
}
