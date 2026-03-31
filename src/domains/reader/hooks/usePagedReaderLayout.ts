import type { StoredReaderState } from './useReaderStatePersistence';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getPageIndexFromProgress, resolvePagedTargetPage } from '../utils/readerPosition';

const TWO_COLUMN_GAP = 48;
const MIN_COLUMN_WIDTH = 260;
const PAGE_COUNT_EPSILON = 1;

interface UsePagedReaderLayoutParams {
  chapterIndex: number;
  currentChapter: { title: string } | null;
  isLoading: boolean;
  isPagedMode: boolean;
  pagedViewportRef: React.RefObject<HTMLDivElement | null>;
  pagedContentRef: React.RefObject<HTMLDivElement | null>;
  pageIndex: number;
  pageTargetRef: React.MutableRefObject<'start' | 'end' | null>;
  pendingRestoreStateRef: React.MutableRefObject<StoredReaderState | null>;
  clearPendingRestoreState: () => void;
  stopRestoreMask: () => void;
  setPageCount: React.Dispatch<React.SetStateAction<number>>;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

interface UsePagedReaderLayoutResult {
  pagedViewportRef: React.RefObject<HTMLDivElement | null>;
  pagedContentRef: React.RefObject<HTMLDivElement | null>;
  fitsTwoColumns: boolean;
  pageTurnStep: number;
  twoColumnGap: number;
  twoColumnWidth: number | undefined;
  readyChapterIndex: number | null;
}

interface PagedViewportSize {
  width: number;
  height: number;
}

function parseCssLength(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getPagedViewportSize(viewport: HTMLDivElement): PagedViewportSize {
  const rect = viewport.getBoundingClientRect();

  return {
    width: rect.width || viewport.clientWidth,
    height: rect.height || viewport.clientHeight,
  };
}

export function getPagedPageCount(scrollWidth: number, viewportWidth: number, pageTurnStep: number): number {
  if (viewportWidth <= 0 || pageTurnStep <= 0) {
    return 1;
  }

  const overflowWidth = Math.max(0, scrollWidth - viewportWidth);
  if (overflowWidth <= PAGE_COUNT_EPSILON) {
    return 1;
  }

  return Math.max(2, Math.floor(Math.max(0, overflowWidth - PAGE_COUNT_EPSILON) / pageTurnStep) + 2);
}

export function getPagedScrollLeft(pageIndex: number, pageTurnStep: number, maxScrollLeft: number): number {
  if (pageTurnStep <= 0 || maxScrollLeft <= 0) {
    return 0;
  }

  return Math.min(pageIndex * pageTurnStep, maxScrollLeft);
}

export function getPagedMeasuredPageTurnStep(
  viewportWidth: number,
  fallbackPageTurnStep: number,
  fitsTwoColumns: boolean,
  measuredColumnWidth: number | null,
  measuredColumnGap: number | null,
): number {
  if (viewportWidth <= 0 || fallbackPageTurnStep <= 0) {
    return 0;
  }

  if (measuredColumnWidth === null || measuredColumnWidth <= 0) {
    return fallbackPageTurnStep;
  }

  const resolvedColumnGap = measuredColumnGap !== null && measuredColumnGap >= 0
    ? measuredColumnGap
    : 0;
  const columnsPerPage = fitsTwoColumns ? 2 : 1;
  const visiblePageWidth = measuredColumnWidth * columnsPerPage
    + resolvedColumnGap * Math.max(0, columnsPerPage - 1);
  const measuredPageTurnStep = visiblePageWidth + resolvedColumnGap;

  if (!Number.isFinite(measuredPageTurnStep) || measuredPageTurnStep <= 0) {
    return fallbackPageTurnStep;
  }

  return measuredPageTurnStep;
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
  paragraphSpacing,
}: UsePagedReaderLayoutParams): UsePagedReaderLayoutResult {
  const prevChapterIndexRef = useRef(chapterIndex);
  const [pagedViewportSize, setPagedViewportSize] = useState({ width: 0, height: 0 });
  const [resolvedPageTurnStep, setResolvedPageTurnStep] = useState({
    step: 0,
    viewportWidth: 0,
  });
  const [resolvedLayoutChapterIndex, setResolvedLayoutChapterIndex] = useState<number | null>(null);

  const twoColumnWidth = pagedViewportSize.width
    ? pagedViewportSize.width >= 2 * MIN_COLUMN_WIDTH + TWO_COLUMN_GAP
      ? Math.max((pagedViewportSize.width - TWO_COLUMN_GAP) / 2, MIN_COLUMN_WIDTH)
      : pagedViewportSize.width
    : undefined;
  const fitsTwoColumns = twoColumnWidth
    ? pagedViewportSize.width >= 2 * twoColumnWidth + TWO_COLUMN_GAP
    : false;
  const idealPageTurnStep = pagedViewportSize.width
    ? pagedViewportSize.width + (fitsTwoColumns ? TWO_COLUMN_GAP : 0)
    : 0;
  const pageTurnStep = resolvedPageTurnStep.viewportWidth === pagedViewportSize.width && resolvedPageTurnStep.step > 0
    ? resolvedPageTurnStep.step
    : idealPageTurnStep;

  useEffect(() => {
    if (!isPagedMode || isLoading || !currentChapter) return;

    const viewport = pagedViewportRef.current;
    if (!viewport) return;

    const updateViewportSize = () => {
      const nextViewportSize = getPagedViewportSize(viewport);
      setPagedViewportSize((previous) => ((
        Math.abs(previous.width - nextViewportSize.width) < 0.01
        && Math.abs(previous.height - nextViewportSize.height) < 0.01
      )
        ? previous
        : nextViewportSize));
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
      if (!content || !idealPageTurnStep) return;

      const contentStyles = window.getComputedStyle(content);
      const nextPageTurnStep = getPagedMeasuredPageTurnStep(
        pagedViewportSize.width,
        idealPageTurnStep,
        fitsTwoColumns,
        parseCssLength(contentStyles.columnWidth),
        parseCssLength(contentStyles.columnGap),
      );

      const nextPageCount = getPagedPageCount(content.scrollWidth, pagedViewportSize.width, nextPageTurnStep);
      const pendingRestoreState = pendingRestoreStateRef.current;
      const hasRestorablePage = pendingRestoreState?.chapterIndex === chapterIndex
        && typeof pendingRestoreState.chapterProgress === 'number';
      const targetPage = hasRestorablePage
        ? getPageIndexFromProgress(pendingRestoreState?.chapterProgress, nextPageCount)
        : resolvePagedTargetPage(pageTargetRef.current, pageIndex, nextPageCount);

      setPageCount(nextPageCount);
      setResolvedPageTurnStep((previous) => ((
        previous.viewportWidth === pagedViewportSize.width
        && Math.abs(previous.step - nextPageTurnStep) < 0.01
      )
        ? previous
        : {
          step: nextPageTurnStep,
          viewportWidth: pagedViewportSize.width,
        }));
      setPageIndex(targetPage);
      pageTargetRef.current = null;
      setResolvedLayoutChapterIndex(chapterIndex);
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
    paragraphSpacing,
    pageIndex,
    pageTargetRef,
    idealPageTurnStep,
    pagedViewportSize.width,
    pagedContentRef,
    pagedViewportSize.height,
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

    const content = pagedContentRef.current;
    if (!content) return;

    const maxScrollLeft = Math.max(0, content.scrollWidth - pagedViewportSize.width);
    pagedViewportRef.current.scrollLeft = getPagedScrollLeft(pageIndex, pageTurnStep, maxScrollLeft);
  }, [isPagedMode, pageIndex, pageTurnStep, pagedContentRef, pagedViewportRef, pagedViewportSize.width]);

  return {
    pagedViewportRef,
    pagedContentRef,
    fitsTwoColumns,
    pageTurnStep,
    twoColumnGap: TWO_COLUMN_GAP,
    twoColumnWidth,
    readyChapterIndex: (
      !isLoading
      && isPagedMode
      && Boolean(currentChapter)
      && resolvedLayoutChapterIndex === chapterIndex
    ) ? resolvedLayoutChapterIndex : null,
  };
}
