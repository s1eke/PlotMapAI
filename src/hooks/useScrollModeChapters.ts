import { useRef, useCallback } from 'react';
import type { Chapter, ChapterContent } from '../api/reader';

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
) {
  const scrollChapterElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollThrottleRef = useRef(0);
  const pendingScrollFetchesRef = useRef<Set<number>>(new Set());

  const handleScroll = useCallback(() => {
    if (isPagedMode || !contentRef.current || viewMode !== 'original') return;

    const now = Date.now();
    if (now - scrollThrottleRef.current < 150) return;
    scrollThrottleRef.current = now;

    const el = contentRef.current;
    const scrollTop = el.scrollTop;

    if (scrollModeChapters.length > 0) {
      const lastIdx = scrollModeChapters[scrollModeChapters.length - 1];
      const nextIdx = lastIdx + 1;
      if (nextIdx < chapters.length && !scrollModeChapters.includes(nextIdx) && !pendingScrollFetchesRef.current.has(nextIdx)) {
        let currentReadIdx = scrollModeChapters[0];
        for (const idx of scrollModeChapters) {
          const chEl = scrollChapterElementsRef.current.get(idx);
          if (chEl && chEl.offsetTop <= scrollTop + el.clientHeight * 0.3) {
            currentReadIdx = idx;
          }
        }

        const chEl = scrollChapterElementsRef.current.get(currentReadIdx);
        if (chEl) {
          const chTop = chEl.offsetTop;
          const chHeight = chEl.offsetHeight;
          if (chHeight > 0) {
            const progress = (scrollTop - chTop) / chHeight;
            if (progress >= 0.5) {
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
  }, [isPagedMode, viewMode, scrollModeChapters, chapters, contentRef, chapterCacheRef, fetchChapterContent, preloadAdjacent, setScrollModeChapters]);

  return {
    scrollChapterElementsRef,
    handleScroll,
  };
}
