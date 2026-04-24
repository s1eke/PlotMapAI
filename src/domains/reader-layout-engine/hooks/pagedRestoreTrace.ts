import type {
  PageTarget,
  ReaderRestoreTarget,
} from '@shared/contracts/reader';

import type { PaginatedChapterLayout } from '../layout-core/internal';

import { resolvePagedTargetPage } from '@shared/utils/readerPosition';
import {
  getReaderRestoreTargetBoundary,
  getReaderRestoreTargetLocator,
} from '@shared/utils/readerStoredState';
import {
  findPageIndexForLocator,
  getChapterBoundaryLocator,
} from '../layout-core/internal';

export function resolveTracePagedRestoreTargetPage(params: {
  currentPageIndex: number;
  currentPagedLayout?: PaginatedChapterLayout | null;
  nextPageCount: number;
  pendingPageTarget: PageTarget | null;
  pendingRestoreTarget: ReaderRestoreTarget;
}): number | null {
  const {
    currentPageIndex,
    currentPagedLayout,
    nextPageCount,
    pendingPageTarget,
    pendingRestoreTarget,
  } = params;
  let resolvedTargetPage: number | null = null;
  const targetLocator = getReaderRestoreTargetLocator(pendingRestoreTarget);
  const targetBoundary = getReaderRestoreTargetBoundary(pendingRestoreTarget);

  if (targetLocator) {
    resolvedTargetPage = currentPagedLayout
      ? findPageIndexForLocator(currentPagedLayout, targetLocator)
      : null;

    if (
      resolvedTargetPage === null
      && typeof targetLocator.pageIndex === 'number'
    ) {
      resolvedTargetPage = Math.max(
        0,
        Math.min(nextPageCount - 1, targetLocator.pageIndex),
      );
    }
  }

  if (resolvedTargetPage === null && targetBoundary !== undefined) {
    if (!currentPagedLayout) {
      return null;
    }

    const boundaryLocator = getChapterBoundaryLocator(
      currentPagedLayout,
      targetBoundary,
    );
    if (!boundaryLocator) {
      return null;
    }

    resolvedTargetPage = findPageIndexForLocator(currentPagedLayout, boundaryLocator);
  }

  if (resolvedTargetPage === null && pendingPageTarget) {
    resolvedTargetPage = resolvePagedTargetPage(
      pendingPageTarget,
      currentPageIndex,
      nextPageCount,
    );
  }

  return resolvedTargetPage;
}

export function canAttemptPagedRestoreWithoutViewportMeasurement(
  pendingRestoreTarget: ReaderRestoreTarget,
  nextPageCount?: number,
): boolean {
  const targetLocator = getReaderRestoreTargetLocator(pendingRestoreTarget);
  const targetPageIndex = targetLocator?.pageIndex;
  if (typeof targetPageIndex !== 'number') {
    return false;
  }

  if (typeof nextPageCount !== 'number') {
    return true;
  }

  return targetPageIndex < nextPageCount;
}
