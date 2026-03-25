import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { StoredReaderState } from './useReaderStatePersistence';
import { getPageIndexFromProgress } from '../utils/readerPosition';

const TWO_COLUMN_GAP = 48;
const MIN_COLUMN_WIDTH = 260;

interface UsePagedReaderLayoutParams {
  chapterIndex: number;
  currentChapter: { title: string } | null;
  isLoading: boolean;
  isPagedMode: boolean;
  pagedViewportRef: React.RefObject<HTMLDivElement | null>;
  pagedContentRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  pageTargetRef: React.MutableRefObject<'start' | 'end'>;
  pendingRestoreStateRef: React.MutableRefObject<StoredReaderState | null>;
  clearPendingRestoreState: () => void;
  stopRestoreMask: () => void;
  setPageCount: React.Dispatch<React.SetStateAction<number>>;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  fontSize: number;
  lineSpacing: number;
}

interface UsePagedReaderLayoutResult {
  pagedViewportRef: React.RefObject<HTMLDivElement | null>;
  pagedContentRef: React.RefObject<HTMLDivElement | null>;
  fitsTwoColumns: boolean;
  pageTurnStep: number;
  twoColumnGap: number;
  twoColumnWidth: number | undefined;
}

export function usePagedReaderLayout({
  chapterIndex,
  currentChapter,
  isLoading,
  isPagedMode,
  pagedViewportRef,
  pagedContentRef,
  pageIndex,
  pageTargetRef,
  pendingRestoreStateRef,
  clearPendingRestoreState,
  stopRestoreMask,
  setPageCount,
  setPageIndex,
  fontSize,
  lineSpacing,
}: UsePagedReaderLayoutParams): UsePagedReaderLayoutResult {
  const prevChapterIndexRef = useRef(chapterIndex);
  const [pagedViewportSize, setPagedViewportSize] = useState({ width: 0, height: 0 });

  const twoColumnWidth = pagedViewportSize.width
    ? pagedViewportSize.width >= 2 * MIN_COLUMN_WIDTH + TWO_COLUMN_GAP
      ? Math.max((pagedViewportSize.width - TWO_COLUMN_GAP) / 2, MIN_COLUMN_WIDTH)
      : pagedViewportSize.width
    : undefined;
  const fitsTwoColumns = twoColumnWidth
    ? pagedViewportSize.width >= 2 * twoColumnWidth + TWO_COLUMN_GAP
    : false;
  const pageTurnStep = pagedViewportSize.width
    ? pagedViewportSize.width + (fitsTwoColumns ? TWO_COLUMN_GAP : 0)
    : 0;

  useEffect(() => {
    if (!isPagedMode || isLoading || !currentChapter) return;

    const viewport = pagedViewportRef.current;
    if (!viewport) return;

    const updateViewportSize = () => {
      setPagedViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    };

    const frameId = requestAnimationFrame(updateViewportSize);
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [currentChapter, isLoading, isPagedMode, pagedViewportRef]);

  useEffect(() => {
    if (isLoading || !isPagedMode || !pagedViewportSize.width || !pagedViewportSize.height || !currentChapter) {
      setPageCount(1);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const content = pagedContentRef.current;
      if (!content || !pageTurnStep) return;

      const nextPageCount = Math.max(
        1,
        Math.ceil((content.scrollWidth + (fitsTwoColumns ? TWO_COLUMN_GAP : 0)) / pageTurnStep),
      );
      const pendingRestoreState = pendingRestoreStateRef.current;
      const hasRestorablePage = pendingRestoreState?.chapterIndex === chapterIndex
        && typeof pendingRestoreState.chapterProgress === 'number';
      const targetPage = hasRestorablePage
        ? getPageIndexFromProgress(pendingRestoreState?.chapterProgress, nextPageCount)
        : pageTargetRef.current === 'end'
          ? nextPageCount - 1
          : Math.min(pageIndex, nextPageCount - 1);

      setPageCount(nextPageCount);
      setPageIndex(targetPage);
      pageTargetRef.current = 'start';
      if (hasRestorablePage || pendingRestoreState) {
        clearPendingRestoreState();
      }
      stopRestoreMask();
    });

    return () => cancelAnimationFrame(frameId);
  }, [
    chapterIndex,
    clearPendingRestoreState,
    currentChapter,
    fitsTwoColumns,
    fontSize,
    isLoading,
    isPagedMode,
    lineSpacing,
    pageIndex,
    pageTargetRef,
    pageTurnStep,
    pagedContentRef,
    pagedViewportSize.height,
    pagedViewportSize.width,
    pendingRestoreStateRef,
    setPageCount,
    setPageIndex,
    stopRestoreMask,
  ]);

  // Reset pageIndex to 0 when chapter changes to prevent using old chapter's pageIndex
  useLayoutEffect(() => {
    if (prevChapterIndexRef.current !== chapterIndex) {
      prevChapterIndexRef.current = chapterIndex;
      setPageIndex(0);
    }
  }, [chapterIndex, setPageIndex]);

  useLayoutEffect(() => {
    if (!isPagedMode || !pagedViewportRef.current || !pageTurnStep) return;
    pagedViewportRef.current.scrollLeft = pageIndex * pageTurnStep;
  }, [isPagedMode, pageIndex, pageTurnStep, pagedViewportRef]);

  return {
    pagedViewportRef,
    pagedContentRef,
    fitsTwoColumns,
    pageTurnStep,
    twoColumnGap: TWO_COLUMN_GAP,
    twoColumnWidth,
  };
}
