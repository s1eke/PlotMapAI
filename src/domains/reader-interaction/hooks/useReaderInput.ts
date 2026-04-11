import { useEffect, useCallback, useRef } from 'react';
import type { PageTarget } from '@shared/contracts/reader';

import type { ChapterContent } from '@shared/contracts/reader';

const PAGE_TURN_LOCK_MS = 280;
const PAGE_TURN_THRESHOLD = 48;
const LOCKED_INTERACTION_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'PageDown',
  'PageUp',
]);

export function useReaderInput(
  contentRef: React.RefObject<HTMLDivElement | null>,
  isPagedMode: boolean,
  goToNextPage: () => void,
  goToPrevPage: () => void,
  goToChapter: (idx: number, target?: PageTarget) => void,
  chapterIndex: number,
  currentChapter: ChapterContent | null,
  isLoading: boolean,
  interactionLocked: boolean,
  dismissBlockedInteraction: () => void,
  wheelDeltaRef: React.MutableRefObject<number>,
  pageTurnLockedRef: React.MutableRefObject<boolean>,
) {
  const scrollKeys = useRef<Set<string>>(new Set());
  const animationFrameId = useRef<number | null>(null);
  const wheelUnlockTimeoutRef = useRef<number | null>(null);
  const isPagedModeRef = useRef(isPagedMode);
  const interactionLockedRef = useRef(interactionLocked);
  const dismissBlockedInteractionRef = useRef(dismissBlockedInteraction);
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
    interactionLockedRef.current = interactionLocked;
    if (interactionLocked) {
      stopContinuousScroll();
    }
  }, [interactionLocked, stopContinuousScroll]);

  useEffect(() => {
    dismissBlockedInteractionRef.current = dismissBlockedInteraction;
  }, [dismissBlockedInteraction]);

  useEffect(() => {
    scrollLoopRef.current = () => {
      const contentElement = contentRef.current;
      if (!contentElement) return;

      let scrollAmount = 0;
      if (scrollKeys.current.has('ArrowDown')) scrollAmount += 10;
      if (scrollKeys.current.has('ArrowUp')) scrollAmount -= 10;

      if (scrollAmount !== 0) {
        contentElement.scrollTop += scrollAmount;
        animationFrameId.current = requestAnimationFrame(() => scrollLoopRef.current());
      } else {
        animationFrameId.current = null;
      }
    };
  }, [contentRef]);

  const unlockPageTurn = useCallback(() => {
    const pageTurnLock = pageTurnLockedRef;
    if (wheelUnlockTimeoutRef.current) {
      window.clearTimeout(wheelUnlockTimeoutRef.current);
    }

    wheelUnlockTimeoutRef.current = window.setTimeout(() => {
      pageTurnLock.current = false;
      wheelUnlockTimeoutRef.current = null;
    }, PAGE_TURN_LOCK_MS);
  }, [pageTurnLockedRef]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (interactionLockedRef.current) {
      if (LOCKED_INTERACTION_KEYS.has(e.key)) {
        e.preventDefault();
        dismissBlockedInteractionRef.current();
      }
      return;
    }

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
  }, [
    chapterIndex,
    currentChapter,
    goToChapter,
    goToNextPage,
    goToPrevPage,
    isLoading,
    isPagedMode,
  ]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!isPagedMode && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      scrollKeys.current.delete(e.key);
    }
  }, [isPagedMode]);

  const handlePagedWheel = useCallback((e: WheelEvent) => {
    const wheelAccumulator = wheelDeltaRef;
    const pageTurnLock = pageTurnLockedRef;
    if (!isPagedModeRef.current) return;

    if (interactionLockedRef.current) {
      e.preventDefault();
      wheelAccumulator.current = 0;
      dismissBlockedInteractionRef.current();
      return;
    }

    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;

    e.preventDefault();
    wheelAccumulator.current += e.deltaY;

    if (pageTurnLock.current || Math.abs(wheelAccumulator.current) < PAGE_TURN_THRESHOLD) {
      return;
    }

    pageTurnLock.current = true;

    if (wheelAccumulator.current > 0) {
      goToNextPage();
    } else {
      goToPrevPage();
    }

    wheelAccumulator.current = 0;
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
