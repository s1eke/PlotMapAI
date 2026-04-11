import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChapterContent, ReaderRestoreTarget } from '@shared/contracts/reader';

import { useEffect } from 'react';

import type { ScrollAnchorSnapshot, VisibleScrollBlockRange } from './scrollReaderControllerTypes';

function buildScrollWindow(
  chapterIndex: number,
  totalChapters: number,
): number[] {
  const nextWindow: number[] = [];
  for (let index = chapterIndex - 2; index <= chapterIndex + 2; index += 1) {
    if (index >= 0 && index < totalChapters) {
      nextWindow.push(index);
    }
  }

  return nextWindow;
}

export function buildFocusedScrollWindow(
  chapterIndex: number,
  totalChapters: number,
): number[] {
  if (chapterIndex < 0 || chapterIndex >= totalChapters) {
    return [];
  }

  return [chapterIndex];
}

function areWindowsEqual(previousWindow: number[], nextWindow: number[]): boolean {
  return previousWindow.length === nextWindow.length
    && previousWindow.every((index, position) => index === nextWindow[position]);
}

function setStableScrollWindow(
  setScrollModeChapters: Dispatch<SetStateAction<number[]>>,
  nextWindow: number[],
): void {
  setScrollModeChapters((previousWindow) => (
    areWindowsEqual(previousWindow, nextWindow)
      ? previousWindow
      : nextWindow
  ));
}

export function useScrollReaderWindowing(params: {
  cache: Pick<
    import('@shared/contracts/reader').ReaderChapterCacheApi,
    'getCachedChapter' | 'hasCachedChapter' | 'setCachedChapter'
  >;
  chapterIndex: number;
  chaptersLength: number;
  currentChapter: ChapterContent | null;
  enabled: boolean;
  fetchChapterContent: (index: number) => Promise<ChapterContent>;
  layoutQueries: {
    clearScrollChapterBodyElements: () => void;
    clearScrollChapterElements: () => void;
  };
  pendingRestoreTargetRef: MutableRefObject<ReaderRestoreTarget | null>;
  scrollAnchorSnapshotRef: MutableRefObject<ScrollAnchorSnapshot>;
  scrollChapterBodyElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  setScrollModeChapters: Dispatch<SetStateAction<number[]>>;
  setVisibleScrollBlockRangeByChapter: Dispatch<
    SetStateAction<Map<number, VisibleScrollBlockRange>>
  >;
}): void {
  const {
    cache,
    chapterIndex,
    chaptersLength,
    currentChapter,
    enabled,
    fetchChapterContent,
    layoutQueries,
    pendingRestoreTargetRef,
    scrollAnchorSnapshotRef,
    scrollChapterBodyElementsRef,
    setScrollModeChapters,
    setVisibleScrollBlockRangeByChapter,
  } = params;

  useEffect(() => {
    if (!enabled) {
      setScrollModeChapters((previousWindow) => (
        previousWindow.length === 0 ? previousWindow : []
      ));
      setVisibleScrollBlockRangeByChapter((previousRanges) => (
        previousRanges.size === 0 ? previousRanges : new Map()
      ));
      scrollAnchorSnapshotRef.current = {
        chapterIndex: null,
        chapterOffsetTop: null,
        firstRenderableChapterIndex: null,
        scrollTop: 0,
      };
      scrollChapterBodyElementsRef.current.clear();
      layoutQueries.clearScrollChapterElements();
      layoutQueries.clearScrollChapterBodyElements();
    }
  }, [
    enabled,
    layoutQueries,
    scrollAnchorSnapshotRef,
    scrollChapterBodyElementsRef,
    setScrollModeChapters,
    setVisibleScrollBlockRangeByChapter,
  ]);

  useEffect(() => {
    if (!enabled || !currentChapter || currentChapter.index !== chapterIndex) {
      return;
    }

    const activePendingTarget = pendingRestoreTargetRef.current;
    const shouldFocusRestoreWindow =
      activePendingTarget?.mode === 'scroll'
      && activePendingTarget.chapterIndex === chapterIndex;
    const nextWindow = shouldFocusRestoreWindow
      ? buildFocusedScrollWindow(chapterIndex, chaptersLength)
      : buildScrollWindow(chapterIndex, chaptersLength);

    setStableScrollWindow(setScrollModeChapters, nextWindow);

    nextWindow.forEach((windowIndex) => {
      if (!cache.hasCachedChapter(windowIndex)) {
        fetchChapterContent(windowIndex)
          .then((chapter) => {
            cache.setCachedChapter(chapter);
          })
          .catch(() => {});
      }
    });
  }, [
    cache,
    chapterIndex,
    chaptersLength,
    currentChapter,
    enabled,
    fetchChapterContent,
    pendingRestoreTargetRef,
    setScrollModeChapters,
  ]);
}
