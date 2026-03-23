import { useCallback } from 'react';
import type { Chapter, ChapterContent } from '../api/reader';
import type { PageTarget, StoredReaderState } from './useReaderStatePersistence';

type ChapterChangeSource = 'navigation' | 'scroll' | 'restore' | null;

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
  const goToChapter = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    beforeChapterChange?.();
    hasUserInteractedRef.current = true;
    chapterChangeSourceRef.current = 'navigation';
    pageTargetRef.current = pageTarget;
    setChapterIndex(targetIndex);
    persistReaderState({
      chapterIndex: targetIndex,
      chapterProgress: pageTarget === 'end' ? 1 : 0,
    });
  }, [beforeChapterChange, chapterChangeSourceRef, hasUserInteractedRef, pageTargetRef, persistReaderState, setChapterIndex]);

  const goToNextPage = useCallback(() => {
    if (!currentChapter) return;

    if (pageIndex < pageCount - 1) {
      setPageIndex((prev) => prev + 1);
      return;
    }

    if (currentChapter.hasNext) {
      goToChapter(chapterIndex + 1, 'start');
    }
  }, [chapterIndex, currentChapter, goToChapter, pageCount, pageIndex, setPageIndex]);

  const goToPrevPage = useCallback(() => {
    if (!currentChapter) return;

    if (pageIndex > 0) {
      setPageIndex((prev) => prev - 1);
      return;
    }

    if (currentChapter.hasPrev) {
      goToChapter(chapterIndex - 1, 'end');
    }
  }, [chapterIndex, currentChapter, goToChapter, pageIndex, setPageIndex]);

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
