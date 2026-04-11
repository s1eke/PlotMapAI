import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chapter, ChapterContent } from '@shared/contracts/reader';
import { SCROLL_READING_ANCHOR_RATIO } from '@shared/utils/readerPosition';

export interface ScrollModeAnchor {
  chapterIndex: number;
  chapterProgress: number;
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
  onReadingAnchorChange?: (anchor: ScrollModeAnchor) => void,
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
        const container = contentRef.current;
        const prevHeight = container?.scrollHeight ?? 0;
        setScrollModeChapters((prev) => {
          if (prev.includes(prevIdx)) return prev;
          return [prevIdx, ...prev];
        });
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop += container.scrollHeight - prevHeight;
          }
          syncViewportState({ force: true });
          preloadAdjacent(prevIdx, false);
        });
      })
      .finally(() => {
        pendingScrollFetchesRef.current.delete(prevIdx);
      });
  }, [
    contentRef,
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

    const chapterHeight = Math.max(chapterElement.offsetHeight, 1);
    const rawProgress = (container.scrollTop - chapterElement.offsetTop) / chapterHeight;

    return {
      chapterIndex: currentReadIdx,
      chapterProgress: Math.max(0, Math.min(1, rawProgress)),
    };
  }, [contentRef, enabled, scrollModeChapters]);

  const handleScroll = useCallback(() => {
    if (!enabled || !contentRef.current) return;

    syncViewportState();

    const now = Date.now();
    if (now - scrollThrottleRef.current < 150) return;
    scrollThrottleRef.current = now;

    const el = contentRef.current;
    const { scrollTop } = el;
    const anchor = getCurrentAnchor();
    if (anchor) {
      onReadingAnchorChange?.(anchor);
    }

    if (scrollModeChapters.length > 0 && anchor) {
      const lastIdx = scrollModeChapters[scrollModeChapters.length - 1];
      const nextIdx = lastIdx + 1;
      if (nextIdx < chapters.length) {
        const chEl = scrollChapterElementsRef.current.get(anchor.chapterIndex);
        if (chEl && anchor.chapterProgress >= 0.5) {
          appendNextChapter(nextIdx);
        }
      }
    }

    if (scrollTop < 50 && scrollModeChapters.length > 0) {
      const firstIdx = scrollModeChapters[0];
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
    enabled,
  ]);

  useEffect(() => {
    if (!enabled || scrollModeChapters.length === 0) return;

    let frameId = 0;
    let cancelled = false;

    const ensureScrollable = () => {
      if (cancelled) return;

      const container = contentRef.current;
      if (!container || container.clientHeight <= 0) return;
      if (container.scrollHeight > container.clientHeight + 1) return;

      const lastIdx = scrollModeChapters[scrollModeChapters.length - 1];
      appendNextChapter(lastIdx + 1);
    };

    frameId = requestAnimationFrame(ensureScrollable);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [appendNextChapter, chapterDataRevision, contentRef, enabled, scrollModeChapters]);

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
