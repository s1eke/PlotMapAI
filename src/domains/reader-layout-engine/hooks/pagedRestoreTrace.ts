import type {
  PageTarget,
  ReaderRestoreTarget,
} from '@shared/contracts/reader';

import type { PaginatedChapterLayout } from '../layout-core/internal';

import { resolvePagedTargetPage } from '@shared/utils/readerPosition';
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

  if (pendingRestoreTarget.locator) {
    resolvedTargetPage = currentPagedLayout
      ? findPageIndexForLocator(currentPagedLayout, pendingRestoreTarget.locator)
      : null;

    if (
      resolvedTargetPage === null
      && typeof pendingRestoreTarget.locator.pageIndex === 'number'
    ) {
      resolvedTargetPage = Math.max(
        0,
        Math.min(nextPageCount - 1, pendingRestoreTarget.locator.pageIndex),
      );
    }
  }

  if (resolvedTargetPage === null && pendingRestoreTarget.locatorBoundary !== undefined) {
    if (!currentPagedLayout) {
      return null;
    }

    const boundaryLocator = getChapterBoundaryLocator(
      currentPagedLayout,
      pendingRestoreTarget.locatorBoundary,
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
): boolean {
  return typeof pendingRestoreTarget.locator?.pageIndex === 'number';
}
