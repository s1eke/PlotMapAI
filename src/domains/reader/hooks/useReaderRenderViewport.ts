import type { RefObject } from 'react';
import type { ReaderLayoutSignature, ReaderRenderVariant } from '../utils/readerLayout';
import type { ReaderRenderViewportResult } from './readerRenderCacheTypes';

import { useEffect, useMemo, useState } from 'react';

import {
  createReaderLayoutSignature,
  createReaderTypographyMetrics,
  createReaderViewportMetrics,
  getPagedContentHeight,
} from '../utils/readerLayout';

interface ViewportSize {
  height: number;
  width: number;
}

interface UseReaderRenderViewportParams {
  contentRef: RefObject<HTMLDivElement | null>;
  fontSize: number;
  hasRenderableContent: boolean;
  lineSpacing: number;
  pagedViewportElement: HTMLDivElement | null;
  paragraphSpacing: number;
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

function createVariantSignatures(params: {
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  viewportMetrics: ReturnType<typeof createReaderViewportMetrics>;
}): Record<ReaderRenderVariant, ReaderLayoutSignature> {
  return {
    'original-scroll': createReaderLayoutSignature({
      textWidth: params.viewportMetrics.scrollTextWidth,
      pageHeight: params.viewportMetrics.scrollViewportHeight,
      columnCount: 1,
      columnGap: 0,
      fontSize: params.fontSize,
      lineSpacing: params.lineSpacing,
      paragraphSpacing: params.paragraphSpacing,
    }),
    'original-paged': createReaderLayoutSignature({
      textWidth: params.viewportMetrics.pagedColumnWidth,
      pageHeight: getPagedContentHeight(params.viewportMetrics.pagedViewportHeight),
      columnCount: params.viewportMetrics.pagedColumnCount,
      columnGap: params.viewportMetrics.pagedColumnGap,
      fontSize: params.fontSize,
      lineSpacing: params.lineSpacing,
      paragraphSpacing: params.paragraphSpacing,
    }),
    'summary-shell': createReaderLayoutSignature({
      textWidth: params.viewportMetrics.scrollTextWidth,
      pageHeight: params.viewportMetrics.scrollViewportHeight,
      columnCount: 1,
      columnGap: 0,
      fontSize: params.fontSize,
      lineSpacing: params.lineSpacing,
      paragraphSpacing: params.paragraphSpacing,
    }),
  };
}

export function useReaderRenderViewport({
  contentRef,
  fontSize,
  hasRenderableContent,
  lineSpacing,
  pagedViewportElement,
  paragraphSpacing,
}: UseReaderRenderViewportParams): ReaderRenderViewportResult {
  const [scrollViewportSize, setScrollViewportSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);
  const [pagedViewportSize, setPagedViewportSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);

  useEffect(() => {
    if (!hasRenderableContent) {
      return;
    }

    const viewport = contentRef.current;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      const nextViewportSize = readViewportSize(viewport);
      setScrollViewportSize((previousViewportSize) => (
        previousViewportSize.width === nextViewportSize.width
          && previousViewportSize.height === nextViewportSize.height
          ? previousViewportSize
          : nextViewportSize
      ));
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, [contentRef, hasRenderableContent]);

  useEffect(() => {
    if (!hasRenderableContent) {
      return;
    }

    const viewport = pagedViewportElement;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      const nextViewportSize = readViewportSize(viewport);
      setPagedViewportSize((previousViewportSize) => (
        previousViewportSize.width === nextViewportSize.width
          && previousViewportSize.height === nextViewportSize.height
          ? previousViewportSize
          : nextViewportSize
      ));
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, [hasRenderableContent, pagedViewportElement]);

  const viewportMetrics = useMemo(() => createReaderViewportMetrics(
    scrollViewportSize.width,
    scrollViewportSize.height,
    pagedViewportSize.width || scrollViewportSize.width,
    pagedViewportSize.height || scrollViewportSize.height,
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

  const variantSignatures = useMemo(() => createVariantSignatures({
    fontSize,
    lineSpacing,
    paragraphSpacing,
    viewportMetrics,
  }), [fontSize, lineSpacing, paragraphSpacing, viewportMetrics]);

  return {
    typography,
    variantSignatures,
    viewportMetrics,
  };
}
