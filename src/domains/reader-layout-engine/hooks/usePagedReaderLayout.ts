import type {
  PageTarget,
  ReaderRestoreResult,
  ReaderRestoreTarget,
} from '@shared/contracts/reader';
import type { PaginatedChapterLayout } from '../layout-core/internal';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { setDebugSnapshot } from '@shared/debug';
import { isReaderTraceEnabled, recordReaderTrace } from '@shared/reader-trace';
import { resolvePagedTargetPage } from '@shared/utils/readerPosition';
import {
  getPagedMeasuredPageTurnStep,
  getPagedPageCount,
  getPagedScrollLeft,
  getPagedViewportSize,
  parseCssLength,
} from './pagedLayoutMath';
import { attemptPagedRestore } from './pagedReaderRestore';
import {
  canAttemptPagedRestoreWithoutViewportMeasurement,
  resolveTracePagedRestoreTargetPage,
} from './pagedRestoreTrace';

const TWO_COLUMN_GAP = 48;
const MIN_COLUMN_WIDTH = 260;

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
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  clearPendingRestoreTarget: () => void;
  clearPendingPageTarget: () => void;
  notifyRestoreSettled: (status: 'completed' | 'failed' | 'skipped') => void;
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

export {
  getPagedMeasuredPageTurnStep,
  getPagedPageCount,
  getPagedScrollLeft,
  getPagedViewportSize,
};

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
  pendingRestoreTarget: pendingRestoreTargetValue,
  pendingRestoreTargetRef,
  getRestoreAttempt,
  recordRestoreResult,
  clearPendingRestoreTarget,
  clearPendingPageTarget,
  notifyRestoreSettled,
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

  const handlePagedRestore = useCallback((params: {
    currentPageIndex: number;
    nextPageCount: number;
    pendingRestoreTarget: ReaderRestoreTarget;
  }): 'handled' | 'pending' => {
    return attemptPagedRestore({
      chapterIndex,
      currentPageIndex: params.currentPageIndex,
      nextPageCount: params.nextPageCount,
      currentPagedLayout,
      pendingPageTarget,
      pendingRestoreTarget: params.pendingRestoreTarget,
      getRestoreAttempt,
      recordRestoreResult,
      clearPendingRestoreTarget,
      notifyRestoreSettled,
      stopRestoreMask,
      setPageIndex,
    });
  }, [
    chapterIndex,
    clearPendingRestoreTarget,
    currentPagedLayout,
    getRestoreAttempt,
    notifyRestoreSettled,
    pendingPageTarget,
    recordRestoreResult,
    setPageIndex,
    stopRestoreMask,
  ]);

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
    if (!enabled || !currentChapter) {
      setPageCount(1);
      return;
    }

    const pendingRestoreTarget =
      pendingRestoreTargetRef.current ?? pendingRestoreTargetValue;
    const hasRestorableTarget = pendingRestoreTarget?.mode === 'paged'
      && pendingRestoreTarget.chapterIndex === chapterIndex;
    const currentPageIndex = latestPageIndexRef.current;
    const layoutDerivedPageCount = currentPagedLayout
      ? Math.max(1, currentPagedLayout.pageSlices.length)
      : 1;
    const isPagedViewportReady = Boolean(
      pagedViewportElement
      && pagedContentElement
      && pagedViewportSize.width
      && pagedViewportSize.height,
    );

    if (
      hasRestorableTarget
      && pendingRestoreTarget
      && currentPagedLayout
      && canAttemptPagedRestoreWithoutViewportMeasurement(pendingRestoreTarget)
    ) {
      const resolvedTargetPage = resolveTracePagedRestoreTargetPage({
        currentPageIndex,
        currentPagedLayout,
        nextPageCount: layoutDerivedPageCount,
        pendingPageTarget,
        pendingRestoreTarget,
      });
      if (isReaderTraceEnabled()) {
        recordReaderTrace('paged_restore_attempt', {
          chapterIndex,
          mode: 'paged',
          details: {
            currentPageIndex,
            hasRestorableTarget,
            nextPageCount: layoutDerivedPageCount,
            pendingPageTarget,
            readyChapterIndex: resolvedLayoutChapterIndex,
            resolvedTargetPage,
            viewportHeight: pagedViewportSize.height,
            viewportWidth: pagedViewportSize.width,
          },
        });
      }
      setPageCount(layoutDerivedPageCount);
      setResolvedLayoutChapterIndex((previousChapterIndex) => (
        previousChapterIndex === chapterIndex ? previousChapterIndex : chapterIndex
      ));

      if (handlePagedRestore({
        currentPageIndex,
        nextPageCount: layoutDerivedPageCount,
        pendingRestoreTarget,
      }) !== 'pending') {
        return;
      }

      if (isReaderTraceEnabled()) {
        recordReaderTrace('paged_restore_pending', {
          chapterIndex,
          mode: 'paged',
          details: {
            currentPageIndex,
            hasRestorableTarget,
            nextPageCount: layoutDerivedPageCount,
            pendingPageTarget,
            readyChapterIndex: resolvedLayoutChapterIndex,
            reason: 'restore_solver_pending',
            resolvedTargetPage,
            viewportHeight: pagedViewportSize.height,
            viewportWidth: pagedViewportSize.width,
          },
        });
      }
    }

    if (
      isLoading
      || !isPagedViewportReady
    ) {
      let pendingReason: 'layout_missing' | 'container_missing' | 'execution_exception' =
        'execution_exception';
      if (!currentPagedLayout) {
        pendingReason = 'layout_missing';
      } else if (!isPagedViewportReady) {
        pendingReason = 'container_missing';
      }

      setDebugSnapshot('reader-position-restore', {
        source: 'usePagedReaderLayout',
        mode: 'paged',
        status: 'pending',
        chapterIndex,
        reason: pendingReason,
        retryable: true,
        hasCurrentPagedLayout: Boolean(currentPagedLayout),
        hasPagedViewportElement: Boolean(pagedViewportElement),
        hasRestorableTarget,
        pendingTargetChapterIndex: pendingRestoreTarget?.chapterIndex ?? null,
        pendingTargetMode: pendingRestoreTarget?.mode ?? null,
        target: hasRestorableTarget ? pendingRestoreTarget : null,
        viewportHeight: pagedViewportSize.height,
        viewportWidth: pagedViewportSize.width,
      });
      if (hasRestorableTarget && pendingRestoreTarget && isReaderTraceEnabled()) {
        recordReaderTrace('paged_restore_pending', {
          chapterIndex,
          mode: 'paged',
          details: {
            currentPageIndex,
            hasRestorableTarget,
            nextPageCount: layoutDerivedPageCount,
            pendingPageTarget,
            readyChapterIndex: resolvedLayoutChapterIndex,
            reason: pendingReason,
            resolvedTargetPage: resolveTracePagedRestoreTargetPage({
              currentPageIndex,
              currentPagedLayout,
              nextPageCount: layoutDerivedPageCount,
              pendingPageTarget,
              pendingRestoreTarget,
            }),
            viewportHeight: pagedViewportSize.height,
            viewportWidth: pagedViewportSize.width,
          },
        });
      }
      setPageCount(layoutDerivedPageCount);
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

      const nextPageCount = currentPagedLayout
        ? Math.max(1, currentPagedLayout.pageSlices.length)
        : getPagedPageCount(
          content.scrollWidth,
          pagedViewportSize.width,
          nextPageTurnStep,
        );
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
      if (!hasRestorableTarget) {
        const resolvedTargetPage = pendingPageTarget
          ? resolvePagedTargetPage(
            pendingPageTarget,
            currentPageIndex,
            nextPageCount,
          )
          : null;
        if (resolvedTargetPage !== null && resolvedTargetPage !== currentPageIndex) {
          setPageIndex(resolvedTargetPage);
        } else if (resolvedTargetPage === null && clampedPageIndex !== currentPageIndex) {
          setPageIndex(clampedPageIndex);
        }
      }
      if (pendingPageTarget !== null) {
        clearPendingPageTarget();
      }
      setResolvedLayoutChapterIndex((previousChapterIndex) => (
        previousChapterIndex === chapterIndex ? previousChapterIndex : chapterIndex
      ));
      if (hasRestorableTarget && pendingRestoreTarget) {
        const resolvedTargetPage = resolveTracePagedRestoreTargetPage({
          currentPageIndex,
          currentPagedLayout,
          nextPageCount,
          pendingPageTarget,
          pendingRestoreTarget,
        });
        if (isReaderTraceEnabled()) {
          recordReaderTrace('paged_restore_attempt', {
            chapterIndex,
            mode: 'paged',
            details: {
              currentPageIndex,
              hasRestorableTarget,
              nextPageCount,
              pendingPageTarget,
              readyChapterIndex: resolvedLayoutChapterIndex,
              resolvedTargetPage,
              viewportHeight: pagedViewportSize.height,
              viewportWidth: pagedViewportSize.width,
            },
          });
        }
        if (handlePagedRestore({
          currentPageIndex,
          nextPageCount,
          pendingRestoreTarget,
        }) === 'pending' && isReaderTraceEnabled()) {
          recordReaderTrace('paged_restore_pending', {
            chapterIndex,
            mode: 'paged',
            details: {
              currentPageIndex,
              hasRestorableTarget,
              nextPageCount,
              pendingPageTarget,
              readyChapterIndex: resolvedLayoutChapterIndex,
              reason: 'restore_solver_pending',
              resolvedTargetPage,
              viewportHeight: pagedViewportSize.height,
              viewportWidth: pagedViewportSize.width,
            },
          });
        }
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [
    handlePagedRestore,
    chapterIndex,
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
    pagedViewportElement,
    pagedViewportSize.width,
    pagedViewportSize.height,
    pendingPageTarget,
    pendingRestoreTargetValue,
    pendingRestoreTargetRef,
    clearPendingPageTarget,
    resolvedLayoutChapterIndex,
    setPageCount,
    setPageIndex,
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
