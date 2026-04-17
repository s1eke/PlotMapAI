import { useEffect, useRef } from 'react';

import type { ReaderRestoreTarget } from '@shared/contracts/reader';

import {
  isReaderTraceEnabled,
  markReaderTraceSuspect,
  recordReaderTrace,
} from '@shared/reader-trace';

import type { NavigationDirection } from './pagedReaderControllerTypes';

interface UsePagedReaderControllerTraceParams {
  chapterIndex: number;
  currentChapterIndex: number | null;
  effectivePageCount: number;
  enabled: boolean;
  pageIndex: number;
  pageTurnDirection: NavigationDirection;
  pageTurnToken: number;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
}

export function usePagedReaderControllerTrace({
  chapterIndex,
  currentChapterIndex,
  effectivePageCount,
  enabled,
  pageIndex,
  pageTurnDirection,
  pageTurnToken,
  pendingRestoreTargetRef,
}: UsePagedReaderControllerTraceParams): void {
  const previousPageIndexRef = useRef(pageIndex);
  const previousPageTurnTokenRef = useRef(pageTurnToken);

  useEffect(() => {
    if (!enabled) {
      previousPageIndexRef.current = pageIndex;
      return;
    }

    if (previousPageIndexRef.current === pageIndex) {
      return;
    }

    if (isReaderTraceEnabled()) {
      recordReaderTrace('paged_page_index_changed', {
        chapterIndex,
        mode: 'paged',
        details: {
          currentChapterIndex,
          pageCount: effectivePageCount,
          pageIndex,
          previousPageIndex: previousPageIndexRef.current,
          restorePending: Boolean(pendingRestoreTargetRef.current),
        },
      });
    }
    previousPageIndexRef.current = pageIndex;
  }, [
    chapterIndex,
    currentChapterIndex,
    effectivePageCount,
    enabled,
    pageIndex,
    pendingRestoreTargetRef,
  ]);

  useEffect(() => {
    if (previousPageTurnTokenRef.current === pageTurnToken) {
      return;
    }

    const nextToken = pageTurnToken;
    if (isReaderTraceEnabled()) {
      recordReaderTrace('paged_page_turn_token_incremented', {
        chapterIndex,
        mode: 'paged',
        details: {
          currentChapterIndex,
          direction: pageTurnDirection,
          nextToken,
          pageIndex,
          previousToken: previousPageTurnTokenRef.current,
          restorePending: Boolean(pendingRestoreTargetRef.current),
        },
      });
      if (pendingRestoreTargetRef.current) {
        markReaderTraceSuspect('page_turn_animation_during_restore', {
          chapterIndex,
          mode: 'paged',
          details: {
            direction: pageTurnDirection,
            nextToken,
            pageIndex,
            pendingRestoreTarget: {
              chapterIndex: pendingRestoreTargetRef.current.chapterIndex,
              locatorBoundary: pendingRestoreTargetRef.current.locatorBoundary ?? null,
              mode: pendingRestoreTargetRef.current.mode,
            },
          },
        });
      }
    }

    previousPageTurnTokenRef.current = nextToken;
  }, [
    chapterIndex,
    currentChapterIndex,
    pageIndex,
    pageTurnDirection,
    pageTurnToken,
    pendingRestoreTargetRef,
  ]);
}
