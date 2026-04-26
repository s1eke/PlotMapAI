import type { Chapter, ReaderLocator } from '@shared/contracts/reader';
import type { NovelFlowIndex } from '../layout-core/internal';
import type { UseReaderRenderCacheResult } from './readerRenderCacheTypes';
import type {
  ChapterPageCountTable,
  StableChapterPageCountSnapshot,
} from './pagedReaderFlowPageCounts';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  buildNovelFlowIndex,
  serializeReaderLayoutSignature,
} from '../layout-core/internal';
import {
  buildChapterPageCountTable,
  clampPageIndex,
  normalizePageCount,
  resolveDisplayPageIndexFromTable,
  stabilizeChapterPageCountTable,
  sumChapterPageCounts,
} from './pagedReaderFlowPageCounts';

export type DisplayPageCalibrationReason =
  | 'initial'
  | 'chapter-change'
  | 'directory-jump'
  | 'layout-change'
  | 'page-index-calibration';

export interface DisplayPageState {
  basisLocator: ReaderLocator | null;
  calibrationReason: DisplayPageCalibrationReason;
  displayCurrentPage: number;
  displayPageIndex: number;
  displayTotalPages: number;
  layoutKey: string;
}

interface UsePagedReaderFlowProjectionParams {
  chapterCount: number;
  chapterIndex: number;
  chapters: Chapter[];
  currentChapterIndex: number | null;
  enabled: boolean;
  novelId: number;
  pageIndex: number;
  renderCache: Pick<
    UseReaderRenderCacheResult,
    'pagedLayoutSignature' | 'pagedLayouts' | 'pagedManifests'
  >;
  sessionLocator?: ReaderLocator | null;
}

interface PagedReaderFlowProjection {
  calibrateDisplayPage: (params: {
    chapterIndex?: number;
    localPageIndex?: number;
    reason: DisplayPageCalibrationReason;
  }) => void;
  displayPageCount: number;
  displayPageIndex: number;
  displayPageState: DisplayPageState;
  incrementDisplayPage: (delta: number) => void;
  pagedNovelFlowIndex: NovelFlowIndex | null;
  suppressNextChapterCalibration: () => void;
  suppressNextPageIndexCalibration: () => void;
}

export function usePagedReaderFlowProjection({
  chapterCount,
  chapterIndex,
  chapters,
  currentChapterIndex,
  enabled,
  novelId,
  pageIndex,
  renderCache,
  sessionLocator = null,
}: UsePagedReaderFlowProjectionParams): PagedReaderFlowProjection {
  const layoutKey = useMemo(
    () => serializeReaderLayoutSignature(renderCache.pagedLayoutSignature),
    [renderCache.pagedLayoutSignature],
  );
  const liveChapterPageCountTable = useMemo(() => buildChapterPageCountTable({
    chapters,
    layoutKey,
    pagedLayouts: renderCache.pagedLayouts,
    pagedManifests: renderCache.pagedManifests,
  }), [
    chapters,
    layoutKey,
    renderCache.pagedLayouts,
    renderCache.pagedManifests,
  ]);
  const stablePageCountSnapshotRef = useRef<StableChapterPageCountSnapshot | null>(null);
  const stabilizedPageCounts = useMemo(() => {
    const nextStabilizedPageCounts = stabilizeChapterPageCountTable({
      layoutKey,
      liveTable: liveChapterPageCountTable,
      novelId,
      previousSnapshot: stablePageCountSnapshotRef.current,
    });
    stablePageCountSnapshotRef.current = nextStabilizedPageCounts.snapshot;
    return nextStabilizedPageCounts;
  }, [
    layoutKey,
    liveChapterPageCountTable,
    novelId,
  ]);
  const chapterPageCountTable = stabilizedPageCounts.table;
  const livePageCount = useMemo(
    () => sumChapterPageCounts(chapterPageCountTable),
    [chapterPageCountTable],
  );
  const pagedFlowManifests = useMemo(() => Array.from(
    renderCache.pagedManifests.values(),
    (manifest) => {
      const entry = chapterPageCountTable.get(manifest.chapterIndex);
      if (!entry || manifest.pageCount === entry.pageCount) {
        return manifest;
      }

      return {
        ...manifest,
        pageCount: entry.pageCount,
      };
    },
  ), [
    chapterPageCountTable,
    renderCache.pagedManifests,
  ]);
  const pagedNovelFlowIndex = useMemo(() => (
    enabled
      ? buildNovelFlowIndex({
        chapterCount,
        layoutKey,
        layoutSignature: renderCache.pagedLayoutSignature,
        manifests: pagedFlowManifests,
        novelId,
      })
      : null
  ), [
    chapterCount,
    enabled,
    layoutKey,
    novelId,
    pagedFlowManifests,
    renderCache.pagedLayoutSignature,
  ]);

  const initialDisplayPageIndex = resolveDisplayPageIndexFromTable({
    chapterIndex,
    localPageIndex: resolveLocalPageIndex({
      chapterIndex,
      pageIndex,
      sessionLocator,
      table: chapterPageCountTable,
    }),
    table: chapterPageCountTable,
  });
  const [displayPageIndex, setDisplayPageIndex] = useState(initialDisplayPageIndex);
  const [displayPageCount, setDisplayPageCount] = useState(livePageCount);
  const [calibrationReason, setCalibrationReason] =
    useState<DisplayPageCalibrationReason>('initial');
  const tableRef = useRef(chapterPageCountTable);
  const skipNextChapterCalibrationRef = useRef(false);
  const skipNextPageIndexCalibrationRef = useRef(false);
  const previousCalibrationRef = useRef({
    chapterIndex,
    layoutKey,
    novelId,
    pageIndex,
  });

  tableRef.current = chapterPageCountTable;

  const commitDisplayPageSnapshot = useCallback((
    nextPageIndex: number,
    reason: DisplayPageCalibrationReason,
  ) => {
    const nextPageCount = sumChapterPageCounts(tableRef.current);
    setDisplayPageCount(nextPageCount);
    setDisplayPageIndex(clampPageIndex(nextPageIndex, nextPageCount));
    setCalibrationReason(reason);
  }, []);

  const calibrateDisplayPage = useCallback((params: {
    chapterIndex?: number;
    localPageIndex?: number;
    reason: DisplayPageCalibrationReason;
  }) => {
    const targetChapterIndex = params.chapterIndex ?? chapterIndex;
    const targetLocalPageIndex = params.localPageIndex ?? resolveLocalPageIndex({
      chapterIndex: targetChapterIndex,
      pageIndex,
      sessionLocator,
      table: tableRef.current,
    });
    commitDisplayPageSnapshot(resolveDisplayPageIndexFromTable({
      chapterIndex: targetChapterIndex,
      localPageIndex: targetLocalPageIndex,
      table: tableRef.current,
    }), params.reason);
  }, [
    chapterIndex,
    commitDisplayPageSnapshot,
    pageIndex,
    sessionLocator,
  ]);

  const incrementDisplayPage = useCallback((delta: number) => {
    setDisplayPageIndex((previousPageIndex) => Math.max(
      0,
      Math.floor(previousPageIndex + delta),
    ));
  }, []);
  const refreshDisplayPageCountSnapshot = useCallback(() => {
    const nextPageCount = sumChapterPageCounts(tableRef.current);
    setDisplayPageCount(nextPageCount);
    setDisplayPageIndex((previousPageIndex) => clampPageIndex(previousPageIndex, nextPageCount));
    setCalibrationReason('chapter-change');
  }, []);
  const suppressNextChapterCalibration = useCallback(() => {
    skipNextChapterCalibrationRef.current = true;
  }, []);
  const suppressNextPageIndexCalibration = useCallback(() => {
    skipNextPageIndexCalibrationRef.current = true;
  }, []);

  useEffect(() => {
    if (!enabled || currentChapterIndex !== chapterIndex) {
      return;
    }

    const previous = previousCalibrationRef.current;
    const chapterChanged = previous.chapterIndex !== chapterIndex
      || previous.novelId !== novelId;
    const layoutChanged = previous.layoutKey !== layoutKey;
    const pageIndexChanged = previous.pageIndex !== pageIndex;
    previousCalibrationRef.current = {
      chapterIndex,
      layoutKey,
      novelId,
      pageIndex,
    };

    if (chapterChanged && skipNextChapterCalibrationRef.current) {
      skipNextChapterCalibrationRef.current = false;
      refreshDisplayPageCountSnapshot();
      return;
    }

    if (pageIndexChanged && skipNextPageIndexCalibrationRef.current) {
      skipNextPageIndexCalibrationRef.current = false;
      return;
    }

    if (!chapterChanged && !layoutChanged && !pageIndexChanged) {
      return;
    }

    let reason: DisplayPageCalibrationReason = 'page-index-calibration';
    if (layoutChanged) {
      reason = 'layout-change';
    } else if (chapterChanged) {
      reason = 'chapter-change';
    }
    calibrateDisplayPage({ reason });
  }, [
    calibrateDisplayPage,
    chapterIndex,
    currentChapterIndex,
    enabled,
    layoutKey,
    novelId,
    pageIndex,
    refreshDisplayPageCountSnapshot,
  ]);

  const displayPageState = useMemo<DisplayPageState>(() => ({
    basisLocator: sessionLocator,
    calibrationReason,
    displayCurrentPage: displayPageIndex + 1,
    displayPageIndex,
    displayTotalPages: displayPageCount,
    layoutKey,
  }), [
    calibrationReason,
    displayPageCount,
    displayPageIndex,
    layoutKey,
    sessionLocator,
  ]);
  return {
    calibrateDisplayPage,
    displayPageCount,
    displayPageIndex,
    displayPageState,
    incrementDisplayPage,
    pagedNovelFlowIndex,
    suppressNextChapterCalibration,
    suppressNextPageIndexCalibration,
  };
}

function resolveLocalPageIndex(params: {
  chapterIndex: number;
  pageIndex: number;
  sessionLocator: ReaderLocator | null;
  table: ChapterPageCountTable;
}): number {
  const entry = params.table.get(params.chapterIndex);
  const pageCount = normalizePageCount(entry?.pageCount) ?? 1;
  if (
    params.sessionLocator?.chapterIndex === params.chapterIndex
    && typeof params.sessionLocator.pageIndex === 'number'
  ) {
    return clampPageIndex(params.sessionLocator.pageIndex, pageCount);
  }

  return clampPageIndex(params.pageIndex, pageCount);
}
