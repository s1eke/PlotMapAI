import type { PageTarget, ReaderRestoreTarget } from '@shared/contracts/reader';
import type { PaginatedChapterLayout } from '../utils/readerLayout';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { findPageIndexForLocator, getChapterBoundaryLocator } from '../utils/readerLayout';
import { resolvePagedTargetPage } from '@shared/utils/readerPosition';

const TWO_COLUMN_GAP = 48;
const MIN_COLUMN_WIDTH = 260;
const PAGE_COUNT_EPSILON = 1;

interface UsePagedReaderLayoutParams {
  chapterIndex: number;
  currentChapter: { title: string } | null;
  currentPagedLayout?: PaginatedChapterLayout | null;
  isLoading: boolean;
  enabled: boolean;
  pagedViewportElement: HTMLDivElement | null;
  pagedContentElement: HTMLDivElement | null;
  pageIndex: number;
  pendingPageTarget: PageTarget | null;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  clearPendingRestoreTarget: () => void;
  clearPendingPageTarget: () => void;
  stopRestoreMask: () => void;
  setPageCount: React.Dispatch<React.SetStateAction<number>>;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

interface UsePagedReaderLayoutResult {
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

export function getPagedPageCount(
  scrollWidth: number,
  viewportWidth: number,
  pageTurnStep: number,
): number {
  if (viewportWidth <= 0 || pageTurnStep <= 0) {
    return 1;
  }

  const overflowWidth = Math.max(0, scrollWidth - viewportWidth);
  if (overflowWidth <= PAGE_COUNT_EPSILON) {
    return 1;
  }

  return Math.max(
    2,
    Math.floor(Math.max(0, overflowWidth - PAGE_COUNT_EPSILON) / pageTurnStep) + 2,
  );
}

export function getPagedScrollLeft(
  pageIndex: number,
  pageTurnStep: number,
  maxScrollLeft: number,
): number {
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
  currentPagedLayout = null,
  isLoading,
  enabled,
  pagedViewportElement,
  pagedContentElement,
  pageIndex,
  pendingPageTarget,
  pendingRestoreTargetRef,
  clearPendingRestoreTarget,
  clearPendingPageTarget,
  stopRestoreMask,
  setPageCount,
  setPageIndex,
  fontSize,
  lineSpacing,
  paragraphSpacing,
}: UsePagedReaderLayoutParams): UsePagedReaderLayoutResult {
  const prevChapterIndexRef = useRef(chapterIndex);
  const latestPageIndexRef = useRef(pageIndex);
  const [pagedViewportSize, setPagedViewportSize] = useState({ width: 0, height: 0 });
  const [resolvedPageTurnStep, setResolvedPageTurnStep] = useState({
    step: 0,
    viewportWidth: 0,
  });
  const [resolvedLayoutChapterIndex, setResolvedLayoutChapterIndex] = useState<number | null>(null);
  latestPageIndexRef.current = pageIndex;

  let twoColumnWidth: number | undefined;
  if (pagedViewportSize.width) {
    const canUseTwoColumns = pagedViewportSize.width >= 2 * MIN_COLUMN_WIDTH + TWO_COLUMN_GAP;
    twoColumnWidth = canUseTwoColumns
      ? Math.max((pagedViewportSize.width - TWO_COLUMN_GAP) / 2, MIN_COLUMN_WIDTH)
      : pagedViewportSize.width;
  }
  const fitsTwoColumns = twoColumnWidth
    ? pagedViewportSize.width >= 2 * twoColumnWidth + TWO_COLUMN_GAP
    : false;
  const idealPageTurnStep = pagedViewportSize.width
    ? pagedViewportSize.width + (fitsTwoColumns ? TWO_COLUMN_GAP : 0)
    : 0;
  const pageTurnStep =
    resolvedPageTurnStep.viewportWidth === pagedViewportSize.width &&
    resolvedPageTurnStep.step > 0
      ? resolvedPageTurnStep.step
      : idealPageTurnStep;

  useEffect(() => {
    if (!enabled || isLoading || !currentChapter) return;

    const viewport = pagedViewportElement;
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
  }, [currentChapter, enabled, isLoading, pagedViewportElement]);

  useEffect(() => {
    if (
      isLoading ||
      !enabled ||
      !pagedViewportSize.width ||
      !pagedViewportSize.height ||
      !currentChapter
    ) {
      setPageCount(1);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const content = pagedContentElement;
      if (!content || !idealPageTurnStep) return;

      const contentStyles = window.getComputedStyle(content);
      const nextPageTurnStep = getPagedMeasuredPageTurnStep(
        pagedViewportSize.width,
        idealPageTurnStep,
        fitsTwoColumns,
        parseCssLength(contentStyles.columnWidth),
        parseCssLength(contentStyles.columnGap),
      );

      const pendingRestoreTarget = pendingRestoreTargetRef.current;
      const currentPageIndex = latestPageIndexRef.current;
      const nextPageCount = currentPagedLayout
        ? Math.max(1, currentPagedLayout.pageSlices.length)
        : getPagedPageCount(
          content.scrollWidth,
          pagedViewportSize.width,
          nextPageTurnStep,
        );
      const hasRestorableTarget = pendingRestoreTarget?.mode === 'paged'
        && pendingRestoreTarget.chapterIndex === chapterIndex;
      const resolvedPendingLocator = hasRestorableTarget
        ? pendingRestoreTarget?.locator
          ?? getChapterBoundaryLocator(
            currentPagedLayout,
            pendingRestoreTarget?.locatorBoundary ?? 'start',
          )
        : null;
      const restoredPageIndex =
        hasRestorableTarget && resolvedPendingLocator && currentPagedLayout
          ? findPageIndexForLocator(currentPagedLayout, resolvedPendingLocator)
          : null;
      const locatorPageIndex = hasRestorableTarget
        ? pendingRestoreTarget?.locator?.pageIndex
        : null;
      let resolvedTargetPage: number | null = restoredPageIndex;
      if (resolvedTargetPage === null && typeof locatorPageIndex === 'number') {
        resolvedTargetPage = Math.max(0, Math.min(nextPageCount - 1, locatorPageIndex));
      }
      if (resolvedTargetPage === null && pendingPageTarget) {
        resolvedTargetPage = resolvePagedTargetPage(
          pendingPageTarget,
          currentPageIndex,
          nextPageCount,
        );
      }
      const clampedPageIndex = Math.max(0, Math.min(nextPageCount - 1, currentPageIndex));

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
      if (resolvedTargetPage !== null && resolvedTargetPage !== currentPageIndex) {
        setPageIndex(resolvedTargetPage);
      } else if (resolvedTargetPage === null && clampedPageIndex !== currentPageIndex) {
        setPageIndex(clampedPageIndex);
      }
      if (pendingPageTarget !== null) {
        clearPendingPageTarget();
      }
      setResolvedLayoutChapterIndex((previousChapterIndex) => (
        previousChapterIndex === chapterIndex ? previousChapterIndex : chapterIndex
      ));
      if (hasRestorableTarget) {
        clearPendingRestoreTarget();
        stopRestoreMask();
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [
    chapterIndex,
    clearPendingRestoreTarget,
    currentChapter,
    currentPagedLayout,
    fitsTwoColumns,
    fontSize,
    enabled,
    isLoading,
    lineSpacing,
    paragraphSpacing,
    idealPageTurnStep,
    pagedContentElement,
    pagedViewportSize.width,
    pagedViewportSize.height,
    pendingPageTarget,
    pendingRestoreTargetRef,
    clearPendingPageTarget,
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
    if (!enabled || !pagedViewportElement || !pageTurnStep) return;

    const viewportElement = pagedViewportElement;
    const content = pagedContentElement;
    if (!content) return;

    const maxScrollLeft = Math.max(0, content.scrollWidth - pagedViewportSize.width);
    viewportElement.scrollLeft = getPagedScrollLeft(
      pageIndex,
      pageTurnStep,
      maxScrollLeft,
    );
  }, [
    enabled,
    pagedContentElement,
    pageIndex,
    pageTurnStep,
    pagedViewportElement,
    pagedViewportSize.width,
  ]);

  return {
    fitsTwoColumns,
    pageTurnStep,
    twoColumnGap: TWO_COLUMN_GAP,
    twoColumnWidth,
    readyChapterIndex: (
      !isLoading
      && enabled
      && Boolean(currentChapter)
      && resolvedLayoutChapterIndex === chapterIndex
    ) ? resolvedLayoutChapterIndex : null,
  };
}
