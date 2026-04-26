import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chapter, ChapterContent } from '@shared/contracts/reader';
import type { NovelFlowIndex } from '../layout-core/internal';
import {
  clampProgress,
  getChapterLocalProgress,
  getContainerMaxScrollTop,
  SCROLL_READING_ANCHOR_RATIO,
} from '@shared/utils/readerPosition';

export interface ScrollModeAnchor {
  chapterIndex: number;
  chapterProgress: number;
}

function isFocusedSingleChapterContainer(params: {
  container: HTMLDivElement;
  chapterElement: HTMLDivElement;
}): boolean {
  const { container, chapterElement } = params;
  return container.scrollHeight > 0
    && chapterElement.offsetHeight > 0
    && container.scrollHeight <= chapterElement.offsetHeight + 1;
}

function resolveReadingAnchorProgress(params: {
  container: HTMLDivElement;
  chapterElement: HTMLDivElement;
  readingAnchorOffset: number;
}): number {
  const { container, chapterElement, readingAnchorOffset } = params;
  if (isFocusedSingleChapterContainer({ container, chapterElement })) {
    const maxScrollTop = getContainerMaxScrollTop(container);
    return maxScrollTop > 0
      ? clampProgress((container.scrollTop + readingAnchorOffset) / maxScrollTop)
      : 0;
  }

  return getChapterLocalProgress(container, chapterElement, readingAnchorOffset);
}

export function useScrollModeChapters(
  contentRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  chapters: Chapter[],
  fetchChapterContent: (idx: number) => Promise<ChapterContent>,
  preloadAdjacent: (idx: number, prune?: boolean) => void,
  scrollModeChapters: number[],
  setScrollModeChapters: React.Dispatch<React.SetStateAction<number[]>>,
  chapterDataRevision: number,
  getNovelFlowIndex?: () => NovelFlowIndex | null,
  onReadingAnchorChange?: (anchor: ScrollModeAnchor) => void,
  onHandledUserScroll?: () => void,
): {
    scrollChapterElementsRef: React.MutableRefObject<Map<number, HTMLDivElement>>;
    handleScroll: () => void;
    getCurrentAnchor: () => ScrollModeAnchor | null;
    scrollViewportTop: number;
    syncViewportState: (options?: { force?: boolean }) => void;
  } {
  const scrollChapterElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollThrottleRef = useRef(0);
  const pendingScrollFetchesRef = useRef<Set<number>>(new Set());
  const viewportSyncFrameRef = useRef<number | null>(null);
  const pendingViewportTopRef = useRef(0);
  const lastHandledScrollTopRef = useRef(0);
  const [scrollViewportTop, setScrollViewportTop] = useState(0);

  const syncViewportState = useCallback((options?: { force?: boolean }) => {
    const nextScrollTop = contentRef.current?.scrollTop ?? 0;
    if (
      !options?.force &&
      pendingViewportTopRef.current === nextScrollTop &&
      viewportSyncFrameRef.current !== null
    ) {
      return;
    }

    pendingViewportTopRef.current = nextScrollTop;
    if (viewportSyncFrameRef.current !== null) {
      return;
    }

    viewportSyncFrameRef.current = requestAnimationFrame(() => {
      viewportSyncFrameRef.current = null;
      const committedScrollTop = pendingViewportTopRef.current;
      setScrollViewportTop((previousScrollTop) => (
        previousScrollTop === committedScrollTop ? previousScrollTop : committedScrollTop
      ));
    });
  }, [contentRef]);

  const appendNextChapter = useCallback((nextIdx: number) => {
    if (
      nextIdx >= chapters.length
      || scrollModeChapters.includes(nextIdx)
      || pendingScrollFetchesRef.current.has(nextIdx)
    ) {
      return;
    }

    pendingScrollFetchesRef.current.add(nextIdx);
    fetchChapterContent(nextIdx)
      .then(() => {
        setScrollModeChapters((prev) => {
          if (prev.includes(nextIdx)) return prev;
          return [...prev, nextIdx];
        });
        preloadAdjacent(nextIdx, false);
      })
      .finally(() => {
        pendingScrollFetchesRef.current.delete(nextIdx);
      });
  }, [
    chapters.length,
    fetchChapterContent,
    preloadAdjacent,
    scrollModeChapters,
    setScrollModeChapters,
  ]);

  const prependPrevChapter = useCallback((prevIdx: number) => {
    if (
      prevIdx < 0
      || scrollModeChapters.includes(prevIdx)
      || pendingScrollFetchesRef.current.has(prevIdx)
    ) {
      return;
    }

    pendingScrollFetchesRef.current.add(prevIdx);
    fetchChapterContent(prevIdx)
      .then(() => {
        setScrollModeChapters((prev) => {
          if (prev.includes(prevIdx)) return prev;
          return [...prev, prevIdx].sort((left, right) => left - right);
        });
        requestAnimationFrame(() => {
          syncViewportState({ force: true });
          preloadAdjacent(prevIdx, false);
        });
      })
      .finally(() => {
        pendingScrollFetchesRef.current.delete(prevIdx);
      });
  }, [
    fetchChapterContent,
    preloadAdjacent,
    scrollModeChapters,
    setScrollModeChapters,
    syncViewportState,
  ]);

  const getCurrentAnchor = useCallback((): ScrollModeAnchor | null => {
    if (!enabled || !contentRef.current || scrollModeChapters.length === 0) {
      return null;
    }

    const container = contentRef.current;
    const visibleMarker =
      container.scrollTop + container.clientHeight * SCROLL_READING_ANCHOR_RATIO;

    let currentReadIdx: number | null = null;
    let currentReadOffsetTop = Number.NEGATIVE_INFINITY;

    for (const idx of scrollModeChapters) {
      const chapterElement = scrollChapterElementsRef.current.get(idx);
      if (
        chapterElement
        && chapterElement.offsetTop <= visibleMarker
        && chapterElement.offsetTop > currentReadOffsetTop
      ) {
        currentReadIdx = idx;
        currentReadOffsetTop = chapterElement.offsetTop;
      }
    }

    if (currentReadIdx === null) {
      return null;
    }

    const chapterElement = scrollChapterElementsRef.current.get(currentReadIdx);
    if (!chapterElement) {
      return null;
    }
    const readingAnchorOffset = container.clientHeight * SCROLL_READING_ANCHOR_RATIO;

    return {
      chapterIndex: currentReadIdx,
      chapterProgress: resolveReadingAnchorProgress({
        container,
        chapterElement,
        readingAnchorOffset,
      }),
    };
  }, [contentRef, enabled, scrollModeChapters]);

  const handleScroll = useCallback(() => {
    if (!enabled || !contentRef.current) return;

    syncViewportState();

    const now = Date.now();
    if (now - scrollThrottleRef.current < 150) return;
    scrollThrottleRef.current = now;
    onHandledUserScroll?.();

    const el = contentRef.current;
    const { scrollTop } = el;
    const previousHandledScrollTop = lastHandledScrollTopRef.current;
    lastHandledScrollTopRef.current = scrollTop;
    const isScrollingTowardTop = scrollTop < previousHandledScrollTop;
    const anchor = getCurrentAnchor();
    if (anchor) {
      onReadingAnchorChange?.(anchor);
    }

    if (scrollModeChapters.length > 0 && anchor) {
      const novelFlowIndex = getNovelFlowIndex?.() ?? null;
      const loadedEntries = novelFlowIndex?.chapters.filter((entry) => (
        entry.manifestStatus === 'materialized'
      ));
      const lastIdx = loadedEntries && loadedEntries.length > 0
        ? loadedEntries[loadedEntries.length - 1].chapterIndex
        : scrollModeChapters[scrollModeChapters.length - 1];
      const nextIdx = lastIdx + 1;
      if (nextIdx < chapters.length) {
        const shouldPreloadNext =
          (anchor.chapterIndex >= lastIdx && anchor.chapterProgress >= 0.5)
          || (anchor.chapterIndex >= lastIdx - 1 && anchor.chapterProgress >= 0.75);
        if (shouldPreloadNext) {
          appendNextChapter(nextIdx);
        }
      }
    }

    if (scrollTop < 50 && isScrollingTowardTop && scrollModeChapters.length > 0) {
      const novelFlowIndex = getNovelFlowIndex?.() ?? null;
      const loadedEntries = novelFlowIndex?.chapters.filter((entry) => (
        entry.manifestStatus === 'materialized'
      ));
      const firstIdx = loadedEntries && loadedEntries.length > 0
        ? loadedEntries[0].chapterIndex
        : scrollModeChapters[0];
      const prevIdx = firstIdx - 1;
      prependPrevChapter(prevIdx);
    }
  }, [
    appendNextChapter,
    chapters,
    contentRef,
    getCurrentAnchor,
    onReadingAnchorChange,
    prependPrevChapter,
    scrollModeChapters,
    syncViewportState,
    onHandledUserScroll,
    enabled,
    getNovelFlowIndex,
  ]);

  useEffect(() => {
    if (!enabled || scrollModeChapters.length === 0) return;

    let frameId = 0;
    let cancelled = false;

    const ensureScrollable = () => {
      if (cancelled) return;

      const container = contentRef.current;
      if (!container || container.clientHeight <= 0) return;
      const novelFlowIndex = getNovelFlowIndex?.() ?? null;
      const flowHeight = novelFlowIndex?.totalScrollHeight ?? container.scrollHeight;
      if (flowHeight > container.clientHeight + 1) return;

      const loadedEntries = novelFlowIndex?.chapters.filter((entry) => (
        entry.manifestStatus === 'materialized'
      ));
      const lastIdx = loadedEntries && loadedEntries.length > 0
        ? loadedEntries[loadedEntries.length - 1].chapterIndex
        : scrollModeChapters[scrollModeChapters.length - 1];
      appendNextChapter(lastIdx + 1);
    };

    frameId = requestAnimationFrame(ensureScrollable);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    appendNextChapter,
    chapterDataRevision,
    contentRef,
    enabled,
    getNovelFlowIndex,
    scrollModeChapters,
  ]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    syncViewportState({ force: true });
  }, [chapterDataRevision, enabled, scrollModeChapters, syncViewportState]);

  useEffect(() => {
    return () => {
      if (viewportSyncFrameRef.current !== null) {
        cancelAnimationFrame(viewportSyncFrameRef.current);
      }
    };
  }, []);

  return {
    scrollChapterElementsRef,
    handleScroll,
    getCurrentAnchor,
    scrollViewportTop,
    syncViewportState,
  };
}
