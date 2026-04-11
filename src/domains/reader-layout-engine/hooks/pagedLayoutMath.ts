const PAGE_COUNT_EPSILON = 1;

export interface PagedViewportSize {
  width: number;
  height: number;
}

export function parseCssLength(value: string): number | null {
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
