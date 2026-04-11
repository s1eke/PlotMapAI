import type { ChapterContent } from '@shared/contracts/reader';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useReaderContentRuntime } from '@shared/reader-runtime';
import { extractImageKeysFromChapter } from '@shared/text-processing';

import {
  preloadReaderImageResources,
  type PaginatedChapterLayout,
} from '../../layout-core/internal';

export interface ViewportSize {
  height: number;
  width: number;
}

export const EMPTY_VIEWPORT_SIZE: ViewportSize = {
  height: 0,
  width: 0,
};

function assignPagedViewportRef(
  ref: React.Ref<HTMLDivElement> | undefined,
  element: HTMLDivElement | null,
): void {
  if (!ref) {
    return;
  }

  if (typeof ref === 'function') {
    ref(element);
    return;
  }

  const targetRef = ref as React.MutableRefObject<HTMLDivElement | null>;
  targetRef.current = element;
}

export function getFallbackViewportWidth(
  layout: PaginatedChapterLayout | null | undefined,
  fitsTwoColumns: boolean,
  twoColumnGap: number,
  twoColumnWidth?: number,
): number {
  if (layout) {
    return layout.columnWidth * layout.columnCount
      + layout.columnGap * Math.max(0, layout.columnCount - 1);
  }

  const defaultColumnWidth = twoColumnWidth ?? 600;
  return fitsTwoColumns
    ? defaultColumnWidth * 2 + twoColumnGap
    : defaultColumnWidth;
}

export function usePagedViewportBridge(
  pagedViewportRef?: React.Ref<HTMLDivElement>,
): {
    handlePagedViewportRef: (element: HTMLDivElement | null) => void;
    viewportSize: ViewportSize;
  } {
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);
  const pagedViewportRefBridgeRef = useRef(pagedViewportRef);

  useEffect(() => {
    pagedViewportRefBridgeRef.current = pagedViewportRef;
  }, [pagedViewportRef]);

  const handlePagedViewportRef = useCallback((element: HTMLDivElement | null) => {
    setViewportElement((previousElement) => (
      previousElement === element ? previousElement : element
    ));
    assignPagedViewportRef(pagedViewportRefBridgeRef.current, element);
  }, []);

  useEffect(() => {
    const viewport = viewportElement;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      setViewportSize({
        height: viewport.clientHeight,
        width: viewport.clientWidth,
      });
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [viewportElement]);

  return {
    handlePagedViewportRef,
    viewportSize,
  };
}

export function usePagedReaderImagePrewarm(params: {
  chapter: ChapterContent;
  nextChapterPreview?: ChapterContent | null;
  novelId: number;
  previousChapterPreview?: ChapterContent | null;
}): void {
  const readerContentRuntime = useReaderContentRuntime();
  const {
    chapter,
    nextChapterPreview,
    novelId,
    previousChapterPreview,
  } = params;

  useEffect(() => {
    const imageKeys = new Set<string>();
    for (const renderableChapter of [chapter, previousChapterPreview, nextChapterPreview]) {
      if (!renderableChapter) {
        continue;
      }
      for (const imageKey of extractImageKeysFromChapter(renderableChapter)) {
        imageKeys.add(imageKey);
      }
    }
    if (imageKeys.size === 0) {
      return;
    }

    preloadReaderImageResources(readerContentRuntime, novelId, Array.from(imageKeys.values()));
  }, [chapter, nextChapterPreview, novelId, previousChapterPreview, readerContentRuntime]);
}
