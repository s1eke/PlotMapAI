import { useEffect, useCallback, useRef } from 'react';
import type { ChapterContent } from '../api/readerApi';
import type { PageTarget } from './useReaderStatePersistence';

const PAGE_TURN_LOCK_MS = 280;
const PAGE_TURN_THRESHOLD = 48;

export function useReaderInput(
  contentRef: React.RefObject<HTMLDivElement | null>,
  isPagedMode: boolean,
  goToNextPage: () => void,
  goToPrevPage: () => void,
  goToChapter: (idx: number, target?: PageTarget) => void,
  chapterIndex: number,
  currentChapter: ChapterContent | null,
  isLoading: boolean,
  wheelDeltaRef: React.MutableRefObject<number>,
  pageTurnLockedRef: React.MutableRefObject<boolean>,
) {
  const scrollKeys = useRef<Set<string>>(new Set());
  const animationFrameId = useRef<number | null>(null);
  const wheelUnlockTimeoutRef = useRef<number | null>(null);
  const isPagedModeRef = useRef(isPagedMode);
  const scrollLoopRef = useRef<() => void>(() => {});

  const stopContinuousScroll = useCallback(() => {
    scrollKeys.current.clear();
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  }, []);

  useEffect(() => {
    isPagedModeRef.current = isPagedMode;
    if (isPagedMode) {
      stopContinuousScroll();
    }
  }, [isPagedMode, stopContinuousScroll]);

  useEffect(() => {
    scrollLoopRef.current = () => {
      if (!contentRef.current) return;

      let scrollAmount = 0;
      if (scrollKeys.current.has('ArrowDown')) scrollAmount += 10;
      if (scrollKeys.current.has('ArrowUp')) scrollAmount -= 10;

      if (scrollAmount !== 0) {
        contentRef.current.scrollTop += scrollAmount;
        animationFrameId.current = requestAnimationFrame(() => scrollLoopRef.current());
      } else {
        animationFrameId.current = null;
      }
    };
  }, [contentRef]);

  const unlockPageTurn = useCallback(() => {
    if (wheelUnlockTimeoutRef.current) {
      window.clearTimeout(wheelUnlockTimeoutRef.current);
    }

    wheelUnlockTimeoutRef.current = window.setTimeout(() => {
      pageTurnLockedRef.current = false;
      wheelUnlockTimeoutRef.current = null;
    }, PAGE_TURN_LOCK_MS);
  }, [pageTurnLockedRef]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!currentChapter || isLoading) return;

    if (isPagedMode && (e.key === 'ArrowDown' || e.key === 'PageDown')) {
      e.preventDefault();
      goToNextPage();
      return;
    }

    if (isPagedMode && (e.key === 'ArrowUp' || e.key === 'PageUp')) {
      e.preventDefault();
      goToPrevPage();
      return;
    }

    if (e.key === 'ArrowRight' && currentChapter.hasNext) {
      goToChapter(chapterIndex + 1, 'start');
    } else if (e.key === 'ArrowLeft' && currentChapter.hasPrev) {
      goToChapter(chapterIndex - 1, 'start');
    } else if (!isPagedMode && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      if (!scrollKeys.current.has(e.key)) {
        scrollKeys.current.add(e.key);
        if (!animationFrameId.current) {
          animationFrameId.current = requestAnimationFrame(() => scrollLoopRef.current());
        }
      }
    }
  }, [chapterIndex, currentChapter, goToChapter, goToNextPage, goToPrevPage, isLoading, isPagedMode]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!isPagedMode && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      scrollKeys.current.delete(e.key);
    }
  }, [isPagedMode]);

  const handlePagedWheel = useCallback((e: WheelEvent) => {
    if (!isPagedModeRef.current) return;

    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;

    e.preventDefault();
    wheelDeltaRef.current += e.deltaY;

    if (pageTurnLockedRef.current || Math.abs(wheelDeltaRef.current) < PAGE_TURN_THRESHOLD) {
      return;
    }

    pageTurnLockedRef.current = true;

    if (wheelDeltaRef.current > 0) {
      goToNextPage();
    } else {
      goToPrevPage();
    }

    wheelDeltaRef.current = 0;
    unlockPageTurn();
  }, [goToNextPage, goToPrevPage, unlockPageTurn, wheelDeltaRef, pageTurnLockedRef]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      stopContinuousScroll();
    };
  }, [handleKeyDown, handleKeyUp, stopContinuousScroll]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.addEventListener('wheel', handlePagedWheel, { passive: false });
    return () => el.removeEventListener('wheel', handlePagedWheel);
  }, [handlePagedWheel, contentRef]);

  useEffect(() => {
    return () => {
      if (wheelUnlockTimeoutRef.current) {
        window.clearTimeout(wheelUnlockTimeoutRef.current);
      }
    };
  }, []);

  return { stopContinuousScroll };
}
