import { useRef, useCallback } from 'react';
import type { Chapter, ChapterContent } from '../api/readerApi';

export interface ScrollModeAnchor {
  chapterIndex: number;
  chapterProgress: number;
}

export function useScrollModeChapters(
  contentRef: React.RefObject<HTMLDivElement | null>,
  isPagedMode: boolean,
  viewMode: 'original' | 'summary',
  chapters: Chapter[],
  chapterCacheRef: React.MutableRefObject<Map<number, ChapterContent>>,
  fetchChapterContent: (idx: number) => Promise<ChapterContent>,
  preloadAdjacent: (idx: number, prune?: boolean) => void,
  scrollModeChapters: number[],
  setScrollModeChapters: React.Dispatch<React.SetStateAction<number[]>>,
  onReadingAnchorChange?: (anchor: ScrollModeAnchor) => void,
): {
  scrollChapterElementsRef: React.MutableRefObject<Map<number, HTMLDivElement>>;
  handleScroll: () => void;
  getCurrentAnchor: () => ScrollModeAnchor | null;
} {
  const scrollChapterElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollThrottleRef = useRef(0);
  const pendingScrollFetchesRef = useRef<Set<number>>(new Set());

  const getCurrentAnchor = useCallback((): ScrollModeAnchor | null => {
    if (isPagedMode || !contentRef.current || viewMode !== 'original' || scrollModeChapters.length === 0) {
      return null;
    }

    const container = contentRef.current;
    const visibleMarker = container.scrollTop + container.clientHeight * 0.3;
    let currentReadIdx = scrollModeChapters[0];
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

    const chapterElement = scrollChapterElementsRef.current.get(currentReadIdx);
    if (!chapterElement) {
      return {
        chapterIndex: currentReadIdx,
        chapterProgress: 0,
      };
    }

    const chapterHeight = Math.max(chapterElement.offsetHeight, 1);
    const rawProgress = (container.scrollTop - chapterElement.offsetTop) / chapterHeight;

    return {
      chapterIndex: currentReadIdx,
      chapterProgress: Math.max(0, Math.min(1, rawProgress)),
    };
  }, [contentRef, isPagedMode, scrollModeChapters, viewMode]);

  const handleScroll = useCallback(() => {
    if (isPagedMode || !contentRef.current || viewMode !== 'original') return;

    const now = Date.now();
    if (now - scrollThrottleRef.current < 150) return;
    scrollThrottleRef.current = now;

    const el = contentRef.current;
    const scrollTop = el.scrollTop;
    const anchor = getCurrentAnchor();
    if (anchor) {
      onReadingAnchorChange?.(anchor);
    }

    if (scrollModeChapters.length > 0 && anchor) {
      const lastIdx = scrollModeChapters[scrollModeChapters.length - 1];
      const nextIdx = lastIdx + 1;
      if (nextIdx < chapters.length && !scrollModeChapters.includes(nextIdx) && !pendingScrollFetchesRef.current.has(nextIdx)) {
        const chEl = scrollChapterElementsRef.current.get(anchor.chapterIndex);
        if (chEl) {
          if (anchor.chapterProgress >= 0.5) {
            pendingScrollFetchesRef.current.add(nextIdx);
            fetchChapterContent(nextIdx).then(data => {
              chapterCacheRef.current.set(nextIdx, data);
              setScrollModeChapters(prev => {
                if (prev.includes(nextIdx)) return prev;
                return [...prev, nextIdx];
              });
              preloadAdjacent(nextIdx, false);
            }).finally(() => {
              pendingScrollFetchesRef.current.delete(nextIdx);
            });
          }
        }
      }
    }

    if (scrollTop < 50 && scrollModeChapters.length > 0) {
      const firstIdx = scrollModeChapters[0];
      const prevIdx = firstIdx - 1;
      if (prevIdx >= 0 && !scrollModeChapters.includes(prevIdx) && !pendingScrollFetchesRef.current.has(prevIdx)) {
        pendingScrollFetchesRef.current.add(prevIdx);
        fetchChapterContent(prevIdx).then(data => {
          chapterCacheRef.current.set(prevIdx, data);
          const container = contentRef.current;
          const prevHeight = container?.scrollHeight ?? 0;
          setScrollModeChapters(prev => {
            if (prev.includes(prevIdx)) return prev;
            return [prevIdx, ...prev];
          });
          requestAnimationFrame(() => {
            if (container) {
              container.scrollTop += container.scrollHeight - prevHeight;
            }
            preloadAdjacent(prevIdx, false);
          });
        }).finally(() => {
          pendingScrollFetchesRef.current.delete(prevIdx);
        });
      }
    }
  }, [chapterCacheRef, chapters, contentRef, fetchChapterContent, getCurrentAnchor, isPagedMode, onReadingAnchorChange, preloadAdjacent, scrollModeChapters, setScrollModeChapters, viewMode]);

  return {
    scrollChapterElementsRef,
    handleScroll,
    getCurrentAnchor,
  };
}
