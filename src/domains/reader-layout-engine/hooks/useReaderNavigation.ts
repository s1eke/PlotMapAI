import { useCallback, useMemo } from 'react';
import type {
  Chapter,
  ChapterContent,
  PageTarget,
  ReaderSessionCommands,
  ReaderSessionSnapshot,
} from '@shared/contracts/reader';

import type { UsePagedReaderControllerResult } from './usePagedReaderController';
import { useReaderNavigationRuntime } from '@shared/reader-runtime';
import { createCanonicalPositionFromNavigationIntent } from '@shared/utils/readerPosition';

type NavigationDirection = 'next' | 'prev';

interface UseReaderNavigationParams {
  chapters: Chapter[];
  currentChapter: ChapterContent | null;
  sessionSnapshot: Pick<ReaderSessionSnapshot, 'chapterIndex' | 'mode'>;
  sessionCommands: Pick<
    ReaderSessionCommands,
    'hasUserInteractedRef' | 'persistReaderState' | 'setChapterIndex'
  >;
  pagedNavigation: Pick<
    UsePagedReaderControllerResult,
    | 'goToChapter'
    | 'goToNextPage'
    | 'goToPrevPage'
    | 'goToNextPageSilently'
    | 'goToPrevPageSilently'
    | 'handleNext'
    | 'handlePrev'
    | 'toolbarHasPrev'
    | 'toolbarHasNext'
    | 'pageTurnDirection'
    | 'pageTurnToken'
  >;
  beforeChapterChange?: () => void;
}

export interface UseReaderNavigationResult {
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
}

export function useReaderNavigation({
  chapters,
  currentChapter,
  sessionSnapshot,
  sessionCommands,
  pagedNavigation,
  beforeChapterChange,
}: UseReaderNavigationParams): UseReaderNavigationResult {
  const navigation = useReaderNavigationRuntime();
  const { chapterIndex, mode } = sessionSnapshot;
  const {
    hasUserInteractedRef,
    persistReaderState,
    setChapterIndex,
  } = sessionCommands;
  const userInteractedRef = hasUserInteractedRef;
  const commitChapterNavigation = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    if (targetIndex < 0 || targetIndex >= chapters.length) {
      return;
    }

    beforeChapterChange?.();
    userInteractedRef.current = true;
    navigation.setChapterChangeSource('navigation');
    navigation.setPendingPageTarget(pageTarget);
    setChapterIndex(targetIndex);
    persistReaderState({
      canonical: createCanonicalPositionFromNavigationIntent({
        chapterIndex: targetIndex,
        pageTarget,
      }),
      hints: mode === 'summary'
        ? {
          chapterProgress: pageTarget === 'end' ? 1 : 0,
        }
        : undefined,
    });
  }, [
    beforeChapterChange,
    chapters.length,
    mode,
    navigation,
    persistReaderState,
    setChapterIndex,
    userInteractedRef,
  ]);

  const chapterNavigation = useMemo<UseReaderNavigationResult>(() => {
    const goToChapter = (targetIndex: number, pageTarget: PageTarget = 'start') => {
      commitChapterNavigation(targetIndex, pageTarget);
    };
    const goToNextPage = () => {
      if (chapterIndex < chapters.length - 1) {
        goToChapter(chapterIndex + 1, 'start');
      }
    };
    const goToPrevPage = () => {
      if (chapterIndex > 0) {
        goToChapter(chapterIndex - 1, 'start');
      }
    };

    return {
      goToChapter,
      goToNextPage,
      goToPrevPage,
      goToNextPageSilently: goToNextPage,
      goToPrevPageSilently: goToPrevPage,
      handleNext: goToNextPage,
      handlePrev: goToPrevPage,
      toolbarHasPrev: chapterIndex > 0,
      toolbarHasNext: chapterIndex < chapters.length - 1,
      pageTurnDirection: 'next',
      pageTurnToken: 0,
    };
  }, [chapterIndex, chapters.length, commitChapterNavigation]);

  if (mode === 'paged') {
    return pagedNavigation;
  }

  return {
    ...chapterNavigation,
    toolbarHasPrev: chapterNavigation.toolbarHasPrev || Boolean(currentChapter?.hasPrev),
    toolbarHasNext: chapterNavigation.toolbarHasNext || Boolean(currentChapter?.hasNext),
  };
}
