import type {
  PageTarget,
  ReaderRestoreResult,
  ReaderRestoreTarget,
} from '@shared/contracts/reader';
import type { PaginatedChapterLayout } from '../layout-core/internal';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  findPageIndexForLocator,
  getChapterBoundaryLocator,
} from '../layout-core/internal';
import {
  canSkipReaderRestore,
  resolvePagedTargetPage,
} from '@shared/utils/readerPosition';
import { debugLog, setDebugSnapshot } from '@shared/debug';
import {
  restoreStepFailure,
  restoreStepPending,
  restoreStepSuccess,
  runRestoreSolver,
} from '@shared/utils/readerRestoreSolver';
import {
  getPagedMeasuredPageTurnStep,
  getPagedPageCount,
  getPagedScrollLeft,
  getPagedViewportSize,
  parseCssLength,
} from './pagedLayoutMath';

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

function buildSkippedNoTargetResult(
  chapterIndex: number,
  attempts: number,
): ReaderRestoreResult {
  return {
    status: 'skipped',
    reason: 'no_target',
    retryable: false,
    attempts,
    mode: 'paged',
    chapterIndex,
  };
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

      const pendingRestoreTarget =
        pendingRestoreTargetRef.current ?? pendingRestoreTargetValue;
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

      if (hasRestorableTarget && canSkipReaderRestore(pendingRestoreTarget)) {
        const skippedSnapshot = {
          source: 'usePagedReaderLayout',
          mode: 'paged',
          status: 'skipped',
          chapterIndex,
          reason: 'no_target',
          target: pendingRestoreTarget,
        };
        setDebugSnapshot('reader-position-restore', skippedSnapshot);
        debugLog('Reader', 'paged restore skipped because target is missing', skippedSnapshot);
        recordRestoreResult(
          buildSkippedNoTargetResult(
            chapterIndex,
            getRestoreAttempt(pendingRestoreTarget) + 1,
          ),
          pendingRestoreTarget,
        );
        clearPendingRestoreTarget();
        stopRestoreMask();
        notifyRestoreSettled('skipped');
        return;
      }

      if (hasRestorableTarget && pendingRestoreTarget) {
        const solverOutcome = runRestoreSolver({
          attempts: getRestoreAttempt(pendingRestoreTarget) + 1,
          chapterIndex,
          hasTarget: true,
          mode: 'paged',
          modeMatchesTarget: pendingRestoreTarget.mode === 'paged',
          parse: () => {
            return restoreStepSuccess({
              target: pendingRestoreTarget,
              layout: currentPagedLayout,
              currentPageIndex,
              nextPageCount,
            });
          },
          project: ({
            target,
            layout,
            currentPageIndex: nextCurrentPageIndex,
            nextPageCount: totalPages,
          }) => {
            let resolvedTargetPage: number | null = null;
            if (target.locator) {
              resolvedTargetPage = layout
                ? findPageIndexForLocator(layout, target.locator)
                : null;
              if (
                resolvedTargetPage === null
                && typeof target.locator.pageIndex === 'number'
              ) {
                resolvedTargetPage = Math.max(
                  0,
                  Math.min(totalPages - 1, target.locator.pageIndex),
                );
              }
              if (resolvedTargetPage === null && !layout) {
                return restoreStepPending('layout_missing');
              }
            }
            if (resolvedTargetPage === null && target.locatorBoundary !== undefined) {
              if (!layout) {
                return restoreStepPending('layout_missing');
              }
              const boundaryLocator = getChapterBoundaryLocator(
                layout,
                target.locatorBoundary,
              );
              if (!boundaryLocator) {
                return restoreStepFailure('target_unresolvable', {
                  retryable: false,
                });
              }
              resolvedTargetPage = findPageIndexForLocator(layout, boundaryLocator);
            }
            if (resolvedTargetPage === null && pendingPageTarget) {
              resolvedTargetPage = resolvePagedTargetPage(
                pendingPageTarget,
                nextCurrentPageIndex,
                totalPages,
              );
            }

            if (resolvedTargetPage === null) {
              return restoreStepFailure('target_unresolvable', {
                retryable: false,
              });
            }

            return restoreStepSuccess({
              targetPageIndex: resolvedTargetPage,
            });
          },
          execute: ({ targetPageIndex }) => {
            if (targetPageIndex !== currentPageIndex) {
              setPageIndex(targetPageIndex);
            }

            return restoreStepSuccess({
              expectedPageIndex: targetPageIndex,
              actualPageIndex: targetPageIndex,
            });
          },
          validate: (_projected, executed) => {
            const measuredError = {
              metric: 'page_delta' as const,
              delta: Math.abs(executed.actualPageIndex - executed.expectedPageIndex),
              tolerance: 0,
              expected: executed.expectedPageIndex,
              actual: executed.actualPageIndex,
            };

            if (measuredError.delta > measuredError.tolerance) {
              return restoreStepFailure('validation_exceeded_tolerance', {
                retryable: true,
                measuredError,
              });
            }

            return restoreStepSuccess(measuredError);
          },
          buildContext: ({ executed }) => ({
            pageIndex: executed.actualPageIndex,
          }),
        });

        if (solverOutcome.kind === 'pending') {
          return;
        }

        if (solverOutcome.result.status === 'failed') {
          const failureRecord = recordRestoreResult(solverOutcome.result, pendingRestoreTarget);
          if (failureRecord.scheduledRetry) {
            return;
          }

          const failedSnapshot = {
            source: 'usePagedReaderLayout',
            mode: 'paged',
            status: 'failed',
            chapterIndex,
            reason: solverOutcome.result.reason,
            retryable: solverOutcome.result.retryable,
            attempts: solverOutcome.result.attempts,
            target: pendingRestoreTarget,
          };
          setDebugSnapshot('reader-position-restore', failedSnapshot);
          debugLog('Reader', 'paged restore failed', failedSnapshot);
          clearPendingRestoreTarget();
          stopRestoreMask();
          notifyRestoreSettled('failed');
          return;
        }

        recordRestoreResult(solverOutcome.result, pendingRestoreTarget);
        setDebugSnapshot('reader-position-restore', {
          source: 'usePagedReaderLayout',
          mode: 'paged',
          status: solverOutcome.result.status,
          chapterIndex,
          resolvedPageIndex: solverOutcome.context?.pageIndex ?? null,
          target: pendingRestoreTarget,
        });
        clearPendingRestoreTarget();
        stopRestoreMask();
        notifyRestoreSettled(solverOutcome.result.status);
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
    pendingRestoreTargetValue,
    pendingRestoreTargetRef,
    getRestoreAttempt,
    recordRestoreResult,
    clearPendingPageTarget,
    setPageCount,
    setPageIndex,
    notifyRestoreSettled,
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
