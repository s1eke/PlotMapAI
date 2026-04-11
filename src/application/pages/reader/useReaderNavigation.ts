import { useCallback, useMemo } from 'react';

import type { Chapter, ChapterContent, PageTarget } from '@shared/contracts/reader';
import type { UsePagedReaderViewportControllerResult } from '@domains/reader-layout-engine';
import type { ReaderSessionCommands, ReaderSessionSnapshot } from '@domains/reader-session';

import { useReaderNavigationRuntime } from '@shared/reader-runtime';
import { createCanonicalPositionFromNavigationIntent } from '@shared/utils/readerPosition';

import type { ReaderNavigationControllerResult } from './types';

interface UseReaderNavigationParams {
  beforeChapterChange?: () => void;
  chapters: Chapter[];
  currentChapter: ChapterContent | null;
  pagedNavigation: Pick<
    UsePagedReaderViewportControllerResult,
    | 'goToChapter'
    | 'goToNextPage'
    | 'goToNextPageSilently'
    | 'goToPrevPage'
    | 'goToPrevPageSilently'
    | 'handleNext'
    | 'handlePrev'
    | 'pageTurnDirection'
    | 'pageTurnToken'
    | 'toolbarHasNext'
    | 'toolbarHasPrev'
  >;
  sessionCommands: Pick<
    ReaderSessionCommands,
    'hasUserInteractedRef' | 'persistReaderState' | 'setChapterIndex'
  >;
  sessionSnapshot: Pick<ReaderSessionSnapshot, 'chapterIndex' | 'mode'>;
}

export function useReaderNavigation({
  beforeChapterChange,
  chapters,
  currentChapter,
  pagedNavigation,
  sessionCommands,
  sessionSnapshot,
}: UseReaderNavigationParams): ReaderNavigationControllerResult {
  const navigation = useReaderNavigationRuntime();
  const { chapterIndex, mode } = sessionSnapshot;
  const {
    hasUserInteractedRef,
    persistReaderState,
    setChapterIndex,
  } = sessionCommands;

  const commitChapterNavigation = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    if (targetIndex < 0 || targetIndex >= chapters.length) {
      return;
    }

    beforeChapterChange?.();
    hasUserInteractedRef.current = true;
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
    hasUserInteractedRef,
    mode,
    navigation,
    persistReaderState,
    setChapterIndex,
  ]);

  const chapterNavigation = useMemo<ReaderNavigationControllerResult>(() => {
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
      goToNextPageSilently: goToNextPage,
      goToPrevPage,
      goToPrevPageSilently: goToPrevPage,
      handleNext: goToNextPage,
      handlePrev: goToPrevPage,
      pageTurnDirection: 'next',
      pageTurnToken: 0,
      toolbarHasNext: chapterIndex < chapters.length - 1,
      toolbarHasPrev: chapterIndex > 0,
    };
  }, [chapterIndex, chapters.length, commitChapterNavigation]);

  if (mode === 'paged') {
    return pagedNavigation;
  }

  return {
    ...chapterNavigation,
    toolbarHasNext: chapterNavigation.toolbarHasNext || Boolean(currentChapter?.hasNext),
    toolbarHasPrev: chapterNavigation.toolbarHasPrev || Boolean(currentChapter?.hasPrev),
  };
}
