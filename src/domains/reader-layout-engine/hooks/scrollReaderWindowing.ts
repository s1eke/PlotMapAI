import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChapterContent, ReaderRestoreTarget } from '@shared/contracts/reader';

import { useEffect, useRef } from 'react';

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
  retainedFocusedWindowChapterIndex: number | null;
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
    retainedFocusedWindowChapterIndex,
    scrollAnchorSnapshotRef,
    scrollChapterBodyElementsRef,
    setScrollModeChapters,
    setVisibleScrollBlockRangeByChapter,
  } = params;
  const cacheRef = useRef(cache);
  const fetchChapterContentRef = useRef(fetchChapterContent);
  const layoutQueriesRef = useRef(layoutQueries);
  const currentChapterIndex = currentChapter?.index ?? null;

  useEffect(() => {
    cacheRef.current = cache;
    fetchChapterContentRef.current = fetchChapterContent;
    layoutQueriesRef.current = layoutQueries;
  }, [cache, fetchChapterContent, layoutQueries]);

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
      layoutQueriesRef.current.clearScrollChapterElements();
      layoutQueriesRef.current.clearScrollChapterBodyElements();
    }
  }, [
    enabled,
    scrollAnchorSnapshotRef,
    scrollChapterBodyElementsRef,
    setScrollModeChapters,
    setVisibleScrollBlockRangeByChapter,
  ]);

  useEffect(() => {
    if (!enabled || currentChapterIndex !== chapterIndex) {
      return;
    }

    const activePendingTarget = pendingRestoreTargetRef.current;
    const shouldFocusRestoreWindow =
      (
        activePendingTarget?.mode === 'scroll'
        && activePendingTarget.chapterIndex === chapterIndex
      )
      || retainedFocusedWindowChapterIndex === chapterIndex;
    const nextWindow = shouldFocusRestoreWindow
      ? buildFocusedScrollWindow(chapterIndex, chaptersLength)
      : buildScrollWindow(chapterIndex, chaptersLength);

    setStableScrollWindow(setScrollModeChapters, nextWindow);

    nextWindow.forEach((windowIndex) => {
      if (!cacheRef.current.hasCachedChapter(windowIndex)) {
        fetchChapterContentRef.current(windowIndex)
          .then((chapter) => {
            cacheRef.current.setCachedChapter(chapter);
          })
          .catch(() => {});
      }
    });
  }, [
    chapterIndex,
    chaptersLength,
    currentChapterIndex,
    enabled,
    pendingRestoreTargetRef,
    retainedFocusedWindowChapterIndex,
    setScrollModeChapters,
  ]);
}
