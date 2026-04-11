import type { MutableRefObject, RefObject } from 'react';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  calculateVisibleScrollBlockRanges,
  resolveCurrentScrollLocator,
  resolveCurrentScrollLocatorOffset,
} from '../layout-core/internal';
import type { ChapterContent } from '@shared/contracts/reader';
import type {
  RenderableScrollLayout,
  ScrollAnchorSnapshot,
  ScrollReaderLayout,
  VisibleScrollBlockRange,
} from './scrollReaderControllerTypes';

function areVisibleScrollBlockRangesEqual(
  previousRanges: ReadonlyMap<number, VisibleScrollBlockRange>,
  nextRanges: ReadonlyMap<number, VisibleScrollBlockRange>,
): boolean {
  if (previousRanges.size !== nextRanges.size) {
    return false;
  }

  for (const [chapterIndex, nextRange] of nextRanges) {
    const previousRange = previousRanges.get(chapterIndex);
    if (
      !previousRange
      || previousRange.startIndex !== nextRange.startIndex
      || previousRange.endIndex !== nextRange.endIndex
    ) {
      return false;
    }
  }

  return true;
}

export function useScrollReaderViewportSync(params: {
  chapterIndex: number;
  enabled: boolean;
  handleScroll: () => void;
  layoutQueries: {
    registerCurrentOriginalLocatorResolver: (
      resolver: () => ReturnType<typeof resolveCurrentScrollLocator>,
    ) => () => void;
    registerScrollChapterBodyElement: (index: number, element: HTMLDivElement | null) => void;
    registerScrollChapterElement: (index: number, element: HTMLDivElement | null) => void;
    registerScrollLocatorOffsetResolver: (
      resolver: (locator: Parameters<typeof resolveCurrentScrollLocatorOffset>[0]['locator']) => number | null,
    ) => () => void;
  };
  persistence: {
    isScrollSyncSuppressed: () => boolean;
    suppressScrollSyncTemporarily: () => void;
  };
  renderableScrollLayouts: RenderableScrollLayout[];
  scrollChapterBodyElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollChapterElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollLayouts: ReadonlyMap<number, ScrollReaderLayout>;
  scrollReaderChapters: Array<{ chapter: ChapterContent; index: number }>;
  scrollViewportTop: number;
  syncViewportState: (options?: { force?: boolean }) => void;
  viewportContentRef: RefObject<HTMLDivElement | null>;
  viewportHeight: number;
}): {
    handleContentScroll: () => void;
    handleScrollChapterBodyElement: (index: number, element: HTMLDivElement | null) => void;
    handleScrollChapterElement: (index: number, element: HTMLDivElement | null) => void;
    visibleScrollBlockRangeByChapter: Map<number, VisibleScrollBlockRange>;
  } {
  const {
    chapterIndex,
    enabled,
    handleScroll,
    layoutQueries,
    persistence,
    renderableScrollLayouts,
    scrollChapterBodyElementsRef,
    scrollChapterElementsRef,
    scrollLayouts,
    scrollReaderChapters,
    scrollViewportTop,
    syncViewportState,
    viewportContentRef,
    viewportHeight,
  } = params;
  const [visibleScrollBlockRangeByChapter, setVisibleScrollBlockRangeByChapter] =
    useState<Map<number, VisibleScrollBlockRange>>(new Map());
  const scrollAnchorSnapshotRef = useRef<ScrollAnchorSnapshot>({
    chapterIndex: null,
    chapterOffsetTop: null,
    firstRenderableChapterIndex: null,
    scrollTop: 0,
  });

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    const container = viewportContentRef.current;
    const activeChapterElement = scrollChapterElementsRef.current.get(chapterIndex) ?? null;
    const nextChapterOffsetTop = activeChapterElement?.offsetTop ?? null;
    const nextFirstRenderableChapterIndex = renderableScrollLayouts[0]?.index ?? null;
    const nextScrollTop = container?.scrollTop ?? 0;
    const previousSnapshot = scrollAnchorSnapshotRef.current;

    if (
      container
      && previousSnapshot.chapterIndex === chapterIndex
      && previousSnapshot.chapterOffsetTop !== null
      && previousSnapshot.firstRenderableChapterIndex !== null
      && nextChapterOffsetTop !== null
      && nextFirstRenderableChapterIndex !== null
      && nextFirstRenderableChapterIndex < previousSnapshot.firstRenderableChapterIndex
    ) {
      const chapterOffsetDelta = nextChapterOffsetTop - previousSnapshot.chapterOffsetTop;
      if (chapterOffsetDelta > 0.5) {
        const scrollTopDelta = nextScrollTop - previousSnapshot.scrollTop;
        const uncompensatedOffsetDelta = chapterOffsetDelta - scrollTopDelta;

        if (Math.abs(uncompensatedOffsetDelta) > 0.5) {
          persistence.suppressScrollSyncTemporarily();
          container.scrollTop += uncompensatedOffsetDelta;
          syncViewportState({ force: true });
        }
      }
    }

    scrollAnchorSnapshotRef.current = {
      chapterIndex,
      chapterOffsetTop: nextChapterOffsetTop,
      firstRenderableChapterIndex: nextFirstRenderableChapterIndex,
      scrollTop: container?.scrollTop ?? nextScrollTop,
    };
  }, [
    chapterIndex,
    enabled,
    persistence,
    renderableScrollLayouts,
    scrollChapterElementsRef,
    syncViewportState,
    viewportContentRef,
  ]);

  const getCurrentScrollLocator = useCallback(() => {
    return resolveCurrentScrollLocator({
      chapterIndex,
      contentElement: viewportContentRef.current,
      isPagedMode: false,
      scrollLayouts,
      scrollChapterBodyElements: scrollChapterBodyElementsRef.current,
      scrollReaderChapters,
      viewMode: 'original',
    });
  }, [
    chapterIndex,
    scrollChapterBodyElementsRef,
    scrollLayouts,
    scrollReaderChapters,
    viewportContentRef,
  ]);

  const resolveScrollLocatorOffset = useCallback(
    (locator: Parameters<typeof resolveCurrentScrollLocatorOffset>[0]['locator']) => {
      return resolveCurrentScrollLocatorOffset({
        locator,
        scrollChapterBodyElements: scrollChapterBodyElementsRef.current,
        scrollLayouts,
      });
    },
    [scrollChapterBodyElementsRef, scrollLayouts],
  );

  useEffect(() => {
    const unregisterLocator = layoutQueries.registerCurrentOriginalLocatorResolver(
      getCurrentScrollLocator,
    );
    const unregisterOffset = layoutQueries.registerScrollLocatorOffsetResolver(
      resolveScrollLocatorOffset,
    );
    return () => {
      unregisterLocator();
      unregisterOffset();
    };
  }, [getCurrentScrollLocator, layoutQueries, resolveScrollLocatorOffset]);

  useLayoutEffect(() => {
    const frameId = requestAnimationFrame(() => {
      if (!enabled) {
        setVisibleScrollBlockRangeByChapter((previousRanges) => (
          previousRanges.size === 0 ? previousRanges : new Map()
        ));
        return;
      }

      const viewportElement = viewportContentRef.current;
      const nextRanges = calculateVisibleScrollBlockRanges({
        contentElement: viewportElement,
        isPagedMode: false,
        renderableScrollLayouts,
        scrollChapterBodyElements: scrollChapterBodyElementsRef.current,
        scrollViewportHeight: viewportHeight,
        scrollViewportTop,
        viewMode: 'original',
      });

      setVisibleScrollBlockRangeByChapter((previousRanges) => (
        areVisibleScrollBlockRangesEqual(previousRanges, nextRanges)
          ? previousRanges
          : nextRanges
      ));
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    enabled,
    renderableScrollLayouts,
    scrollChapterBodyElementsRef,
    scrollViewportTop,
    viewportContentRef,
    viewportHeight,
  ]);

  const handleScrollChapterElement = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (element) {
        scrollChapterElementsRef.current.set(index, element);
      } else {
        scrollChapterElementsRef.current.delete(index);
      }

      layoutQueries.registerScrollChapterElement(index, element);
    },
    [layoutQueries, scrollChapterElementsRef],
  );

  const handleScrollChapterBodyElement = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (element) {
        scrollChapterBodyElementsRef.current.set(index, element);
      } else {
        scrollChapterBodyElementsRef.current.delete(index);
      }

      layoutQueries.registerScrollChapterBodyElement(index, element);
    },
    [layoutQueries, scrollChapterBodyElementsRef],
  );

  const handleContentScroll = useCallback(() => {
    if (!enabled) {
      return;
    }

    if (persistence.isScrollSyncSuppressed()) {
      syncViewportState({ force: true });
      return;
    }

    handleScroll();
  }, [enabled, handleScroll, persistence, syncViewportState]);

  return {
    handleContentScroll,
    handleScrollChapterBodyElement,
    handleScrollChapterElement,
    visibleScrollBlockRangeByChapter,
  };
}
