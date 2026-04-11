import type { ChapterChangeSource, PageTarget } from '@shared/contracts/reader';

import { useCallback, useEffect, useRef } from 'react';

type NavigationDirection = 'next' | 'prev';
type QueuedNavigationIntent =
  | { type: 'direction'; direction: NavigationDirection; shouldAnimate: boolean }
  | { type: 'chapter'; targetIndex: number; pageTarget: PageTarget };

interface UsePagedChapterTransitionParams {
  isPagedMode: boolean;
  chapterIndex: number;
  isChapterNavigationReady: boolean;
  getChapterChangeSource: () => ChapterChangeSource;
  onCommitChapterNavigation: (targetIndex: number, pageTarget: PageTarget) => boolean;
  onReplayDirectionalNavigation: (direction: NavigationDirection, shouldAnimate: boolean) => void;
}

interface UsePagedChapterTransitionResult {
  requestChapterNavigation: (targetIndex: number, pageTarget?: PageTarget) => void;
  requestDirectionalNavigation: (
    direction: NavigationDirection,
    shouldAnimate?: boolean,
  ) => boolean;
}

export function usePagedChapterTransition({
  isPagedMode,
  chapterIndex,
  isChapterNavigationReady,
  getChapterChangeSource,
  onCommitChapterNavigation,
  onReplayDirectionalNavigation,
}: UsePagedChapterTransitionParams): UsePagedChapterTransitionResult {
  const transitionTargetChapterIndexRef = useRef<number | null>(null);
  const queuedIntentRef = useRef<QueuedNavigationIntent | null>(null);
  const lastChapterIndexRef = useRef(chapterIndex);

  const clearPendingTransition = useCallback(() => {
    transitionTargetChapterIndexRef.current = null;
    queuedIntentRef.current = null;
  }, []);

  const queueIntent = useCallback((intent: QueuedNavigationIntent) => {
    queuedIntentRef.current = intent;
  }, []);

  const requestChapterNavigation = useCallback((
    targetIndex: number,
    pageTarget: PageTarget = 'start',
  ) => {
    if (!isPagedMode) {
      onCommitChapterNavigation(targetIndex, pageTarget);
      return;
    }

    if (transitionTargetChapterIndexRef.current !== null) {
      queueIntent({ type: 'chapter', targetIndex, pageTarget });
      return;
    }

    transitionTargetChapterIndexRef.current = targetIndex;
    const committed = onCommitChapterNavigation(targetIndex, pageTarget);
    if (!committed) {
      transitionTargetChapterIndexRef.current = null;
    }
  }, [isPagedMode, onCommitChapterNavigation, queueIntent]);

  const requestDirectionalNavigation = useCallback((
    direction: NavigationDirection,
    shouldAnimate = false,
  ) => {
    if (!isPagedMode) {
      return true;
    }

    if (transitionTargetChapterIndexRef.current !== null) {
      queueIntent({ type: 'direction', direction, shouldAnimate });
      return false;
    }

    return true;
  }, [isPagedMode, queueIntent]);

  useEffect(() => {
    if (!isPagedMode) {
      lastChapterIndexRef.current = chapterIndex;
      clearPendingTransition();
      return;
    }

    const chapterChanged = lastChapterIndexRef.current !== chapterIndex;
    lastChapterIndexRef.current = chapterIndex;

    if (!chapterChanged) {
      return;
    }

    const changeSource = getChapterChangeSource();
    if (changeSource === 'scroll' || changeSource === 'restore') {
      clearPendingTransition();
    }
  }, [chapterIndex, clearPendingTransition, getChapterChangeSource, isPagedMode]);

  useEffect(() => {
    if (!isPagedMode) {
      return;
    }

    const transitionTarget = transitionTargetChapterIndexRef.current;
    if (transitionTarget === null) {
      return;
    }

    if (!isChapterNavigationReady || chapterIndex !== transitionTarget) {
      return;
    }

    const queuedIntent = queuedIntentRef.current;
    clearPendingTransition();

    if (!queuedIntent) {
      return;
    }

    if (queuedIntent.type === 'chapter') {
      if (queuedIntent.targetIndex === chapterIndex) {
        return;
      }
      requestChapterNavigation(queuedIntent.targetIndex, queuedIntent.pageTarget);
      return;
    }

    onReplayDirectionalNavigation(queuedIntent.direction, queuedIntent.shouldAnimate);
  }, [
    chapterIndex,
    clearPendingTransition,
    isChapterNavigationReady,
    isPagedMode,
    onReplayDirectionalNavigation,
    requestChapterNavigation,
  ]);

  return {
    requestChapterNavigation,
    requestDirectionalNavigation,
  };
}
