import type { ChapterContent } from '../readerContentService';
import type {
  MeasuredChapterLayout,
  PaginatedChapterLayout,
  ReaderTypographyMetrics,
  ReaderViewportMetrics,
} from '../utils/readerLayout';

import { useEffect, useMemo, useState } from 'react';

import { extractImageKeysFromText } from '../utils/chapterImages';
import {
  peekReaderImageDimensions,
  preloadReaderImageResources,
} from '../utils/readerImageResourceCache';
import {
  composePaginatedChapterLayout,
  createScrollImageLayoutConstraints,
  createReaderTypographyMetrics,
  createReaderViewportMetrics,
  measureReaderChapterLayout,
} from '../utils/readerLayout';

interface UseReaderLayoutEngineParams {
  contentRef: React.RefObject<HTMLDivElement | null>;
  fontSize: number;
  lineSpacing: number;
  novelId: number;
  pagedViewportElement: HTMLDivElement | null;
  pagedChapters: ChapterContent[];
  paragraphSpacing: number;
  scrollChapters: Array<{ chapter: ChapterContent; index: number }>;
}

interface UseReaderLayoutEngineResult {
  pagedLayouts: Map<number, PaginatedChapterLayout>;
  scrollLayouts: Map<number, MeasuredChapterLayout>;
  typography: ReaderTypographyMetrics;
  viewportMetrics: ReaderViewportMetrics;
}

interface ViewportSize {
  height: number;
  width: number;
}

const EMPTY_VIEWPORT_SIZE: ViewportSize = {
  height: 0,
  width: 0,
};
const FALLBACK_VIEWPORT_HEIGHT = 800;
const FALLBACK_VIEWPORT_WIDTH = 1024;

function readViewportSize(element: HTMLDivElement): ViewportSize {
  const rect = element.getBoundingClientRect();
  return {
    height: element.clientHeight || rect.height || FALLBACK_VIEWPORT_HEIGHT,
    width: element.clientWidth || rect.width || FALLBACK_VIEWPORT_WIDTH,
  };
}

export function useReaderLayoutEngine({
  contentRef,
  fontSize,
  lineSpacing,
  novelId,
  pagedViewportElement,
  pagedChapters,
  paragraphSpacing,
  scrollChapters,
}: UseReaderLayoutEngineParams): UseReaderLayoutEngineResult {
  const [scrollViewportSize, setScrollViewportSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);
  const [pagedViewportSize, setPagedViewportSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);
  const [imageRevision, setImageRevision] = useState(0);

  useEffect(() => {
    const viewport = contentRef.current;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      setScrollViewportSize(readViewportSize(viewport));
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, [contentRef]);

  useEffect(() => {
    const viewport = pagedViewportElement;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      setPagedViewportSize(readViewportSize(viewport));
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, [pagedViewportElement]);

  const viewportMetrics = useMemo(() => createReaderViewportMetrics(
    scrollViewportSize.width,
    scrollViewportSize.height,
    pagedViewportSize.width,
    pagedViewportSize.height,
    fontSize,
  ), [
    fontSize,
    pagedViewportSize.height,
    pagedViewportSize.width,
    scrollViewportSize.height,
    scrollViewportSize.width,
  ]);

  const typography = useMemo(() => createReaderTypographyMetrics(
    fontSize,
    lineSpacing,
    paragraphSpacing,
    pagedViewportSize.width || scrollViewportSize.width,
  ), [
    fontSize,
    lineSpacing,
    pagedViewportSize.width,
    paragraphSpacing,
    scrollViewportSize.width,
  ]);

  const imageKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const renderableChapter of pagedChapters) {
      for (const imageKey of extractImageKeysFromText(renderableChapter.content)) {
        keys.add(imageKey);
      }
    }
    for (const renderableChapter of scrollChapters) {
      for (const imageKey of extractImageKeysFromText(renderableChapter.chapter.content)) {
        keys.add(imageKey);
      }
    }
    return Array.from(keys.values());
  }, [pagedChapters, scrollChapters]);

  useEffect(() => {
    if (!novelId || imageKeys.length === 0) {
      return;
    }

    const missingImageKeys = imageKeys.filter((imageKey) => (
      !peekReaderImageDimensions(novelId, imageKey)
    ));
    if (missingImageKeys.length === 0) {
      return;
    }

    let cancelled = false;
    preloadReaderImageResources(novelId, missingImageKeys)
      .finally(() => {
        if (!cancelled) {
          setImageRevision((previous) => previous + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageKeys, novelId]);

  const imageDimensionsByKey = useMemo(() => {
    const dimensions = new Map<string, ReturnType<typeof peekReaderImageDimensions>>();
    for (const imageKey of imageKeys) {
      dimensions.set(imageKey, peekReaderImageDimensions(novelId, imageKey));
    }
    return dimensions;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh after image preload
  }, [imageKeys, imageRevision, novelId]);

  const scrollImageLayoutConstraints = useMemo(() => createScrollImageLayoutConstraints(
    viewportMetrics.scrollTextWidth,
    viewportMetrics.scrollViewportHeight,
  ), [
    viewportMetrics.scrollTextWidth,
    viewportMetrics.scrollViewportHeight,
  ]);

  const scrollLayouts = useMemo(() => {
    const layouts = new Map<number, MeasuredChapterLayout>();
    if (viewportMetrics.scrollTextWidth <= 0) {
      return layouts;
    }

    for (const renderableChapter of scrollChapters) {
      layouts.set(
        renderableChapter.index,
        measureReaderChapterLayout(
          renderableChapter.chapter,
          viewportMetrics.scrollTextWidth,
          typography,
          imageDimensionsByKey,
          scrollImageLayoutConstraints,
        ),
      );
    }

    return layouts;
  }, [
    imageDimensionsByKey,
    scrollChapters,
    scrollImageLayoutConstraints,
    typography,
    viewportMetrics.scrollTextWidth,
  ]);

  const pagedLayouts = useMemo(() => {
    const layouts = new Map<number, PaginatedChapterLayout>();
    if (viewportMetrics.pagedColumnWidth <= 0 || viewportMetrics.pagedViewportHeight <= 0) {
      return layouts;
    }

    for (const renderableChapter of pagedChapters) {
      const measuredLayout = measureReaderChapterLayout(
        renderableChapter,
        viewportMetrics.pagedColumnWidth,
        typography,
        imageDimensionsByKey,
      );

      layouts.set(
        renderableChapter.index,
        composePaginatedChapterLayout(
          measuredLayout,
          viewportMetrics.pagedViewportHeight,
          viewportMetrics.pagedColumnCount,
          viewportMetrics.pagedColumnGap,
        ),
      );
    }

    return layouts;
  }, [
    imageDimensionsByKey,
    pagedChapters,
    typography,
    viewportMetrics.pagedColumnCount,
    viewportMetrics.pagedColumnGap,
    viewportMetrics.pagedColumnWidth,
    viewportMetrics.pagedViewportHeight,
  ]);

  return {
    pagedLayouts,
    scrollLayouts,
    typography,
    viewportMetrics,
  };
}
