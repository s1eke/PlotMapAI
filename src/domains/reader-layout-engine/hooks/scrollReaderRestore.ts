import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type {
  ChapterContent,
  ReaderLocator,
  ReaderRestoreTarget,
} from '@shared/contracts/reader';
import type { ScrollReaderLayout } from './scrollReaderControllerTypes';

import { useCallback, useEffect } from 'react';

import { getChapterBoundaryLocator } from '../utils/readerLayout';
import {
  canSkipReaderRestore,
  SCROLL_READING_ANCHOR_RATIO,
} from '@shared/utils/readerPosition';
import { buildFocusedScrollWindow } from './scrollReaderWindowing';

function setStableRestoreWindow(
  setScrollModeChapters: Dispatch<SetStateAction<number[]>>,
  nextWindow: number[],
): void {
  setScrollModeChapters((previousWindow) => (
    previousWindow.length === nextWindow.length
    && previousWindow.every((index, position) => index === nextWindow[position])
      ? previousWindow
      : nextWindow
  ));
}

export function useScrollReaderRestore(params: {
  chapterIndex: number;
  chaptersLength: number;
  clearPendingRestoreTarget: () => void;
  currentChapter: ChapterContent | null;
  enabled: boolean;
  layoutQueries: {
    resolveScrollLocatorOffset: (locator: ReaderLocator) => number | null;
  };
  navigation: {
    setChapterChangeSource: (source: 'navigation' | 'restore' | 'scroll' | null) => void;
  };
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: MutableRefObject<ReaderRestoreTarget | null>;
  persistReaderState: (state: {
    chapterIndex: number;
    locator?: ReaderLocator;
    mode: 'scroll';
  }) => void;
  persistence: {
    notifyRestoreSettled: (status: 'completed' | 'skipped') => void;
    suppressScrollSyncTemporarily: () => void;
  };
  scrollChapterBodyElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollChapterElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollLayouts: ReadonlyMap<number, ScrollReaderLayout>;
  setScrollModeChapters: Dispatch<SetStateAction<number[]>>;
  stopRestoreMask: () => void;
  viewportContentRef: RefObject<HTMLDivElement | null>;
}): void {
  const {
    chapterIndex,
    chaptersLength,
    clearPendingRestoreTarget,
    currentChapter,
    enabled,
    layoutQueries,
    navigation,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    persistReaderState,
    persistence,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    scrollLayouts,
    setScrollModeChapters,
    stopRestoreMask,
    viewportContentRef,
  } = params;

  const ensureScrollRestoreWindow = useCallback((target: ReaderRestoreTarget) => {
    const targetChapterIndex = target.locator?.chapterIndex ?? target.chapterIndex;
    if (targetChapterIndex < 0 || targetChapterIndex >= chaptersLength) {
      return;
    }

    setStableRestoreWindow(
      setScrollModeChapters,
      buildFocusedScrollWindow(targetChapterIndex, chaptersLength),
    );
  }, [chaptersLength, setScrollModeChapters]);

  const resolvePendingRestoreLocator = useCallback((target: ReaderRestoreTarget) => {
    if (target.locator) {
      return target.locator;
    }

    if (target.locatorBoundary === undefined) {
      return null;
    }

    const chapterLayout = scrollLayouts.get(target.chapterIndex) ?? null;
    return getChapterBoundaryLocator(chapterLayout, target.locatorBoundary);
  }, [scrollLayouts]);

  const resolvePendingScrollTarget = useCallback((target: ReaderRestoreTarget) => {
    const container = viewportContentRef.current;
    if (!container) {
      return { status: 'pending' as const };
    }

    const targetChapterIndex = target.locator?.chapterIndex ?? target.chapterIndex;
    const targetElement = scrollChapterElementsRef.current.get(targetChapterIndex) ?? null;
    const resolvedLocator = resolvePendingRestoreLocator(target);

    if (target.locatorBoundary !== undefined && resolvedLocator === null) {
      const hasResolvedBoundaryLayout = scrollLayouts.has(target.chapterIndex)
        && scrollChapterBodyElementsRef.current.has(target.chapterIndex);
      if (!hasResolvedBoundaryLayout) {
        return { status: 'pending' as const };
      }
    }

    if (resolvedLocator) {
      if (target.locatorBoundary === 'start' && targetElement) {
        return {
          status: 'resolved' as const,
          locator: resolvedLocator,
          scrollTop: Math.max(0, Math.round(targetElement.offsetTop)),
        };
      }

      const nextScrollTop = layoutQueries.resolveScrollLocatorOffset(resolvedLocator);
      if (nextScrollTop !== null) {
        return {
          status: 'resolved' as const,
          locator: resolvedLocator,
          scrollTop: Math.max(
            0,
            Math.round(nextScrollTop - container.clientHeight * SCROLL_READING_ANCHOR_RATIO),
          ),
        };
      }

      const hasResolvedChapterLayout = scrollLayouts.has(resolvedLocator.chapterIndex)
        && scrollChapterBodyElementsRef.current.has(resolvedLocator.chapterIndex);
      if (!hasResolvedChapterLayout) {
        return { status: 'pending' as const };
      }
    }

    if (resolvedLocator || target.locatorBoundary !== undefined) {
      return { status: 'invalid' as const };
    }

    if (!targetElement) {
      return { status: 'pending' as const };
    }

    return { status: 'invalid' as const };
  }, [
    layoutQueries,
    resolvePendingRestoreLocator,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    scrollLayouts,
    viewportContentRef,
  ]);

  useEffect(() => {
    if (!enabled || currentChapter?.index !== chapterIndex) {
      return;
    }

    const pendingTarget = pendingRestoreTarget ?? pendingRestoreTargetRef.current;
    if (!pendingTarget || pendingTarget.mode !== 'scroll') {
      return;
    }

    if (canSkipReaderRestore(pendingTarget)) {
      navigation.setChapterChangeSource(null);
      clearPendingRestoreTarget();
      stopRestoreMask();
      persistence.notifyRestoreSettled('skipped');
      return;
    }

    let frameId = 0;
    let cancelled = false;

    const restoreScrollPosition = () => {
      if (cancelled) {
        return;
      }

      const container = viewportContentRef.current;
      if (!container) {
        frameId = requestAnimationFrame(restoreScrollPosition);
        return;
      }

      const resolvedTarget = resolvePendingScrollTarget(pendingTarget);
      if (resolvedTarget.status === 'pending') {
        ensureScrollRestoreWindow(pendingTarget);
        frameId = requestAnimationFrame(restoreScrollPosition);
        return;
      }

      if (resolvedTarget.status === 'invalid') {
        navigation.setChapterChangeSource(null);
        clearPendingRestoreTarget();
        stopRestoreMask();
        persistence.notifyRestoreSettled('skipped');
        return;
      }

      navigation.setChapterChangeSource('restore');
      persistence.suppressScrollSyncTemporarily();
      container.scrollTop = resolvedTarget.scrollTop;
      if (resolvedTarget.locator) {
        persistReaderState({
          chapterIndex: resolvedTarget.locator.chapterIndex,
          mode: 'scroll',
          locator: resolvedTarget.locator,
        });
      }
      navigation.setChapterChangeSource(null);
      clearPendingRestoreTarget();
      stopRestoreMask();
      persistence.notifyRestoreSettled('completed');
    };

    frameId = requestAnimationFrame(restoreScrollPosition);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    chapterIndex,
    clearPendingRestoreTarget,
    currentChapter,
    enabled,
    ensureScrollRestoreWindow,
    navigation,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    persistReaderState,
    persistence,
    resolvePendingScrollTarget,
    stopRestoreMask,
    viewportContentRef,
  ]);
}
