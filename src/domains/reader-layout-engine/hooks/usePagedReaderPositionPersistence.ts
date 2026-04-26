import { useEffect, type MutableRefObject } from 'react';
import type {
  PageTarget,
  ReaderLayoutQueriesValue,
  ReaderNavigationRuntimeValue,
  ReaderRestoreTarget,
  ReaderSessionCommands,
} from '@shared/contracts/reader';
import { debugLog, setDebugSnapshot } from '@shared/debug';
import { toCanonicalPositionFromLocator } from '@shared/utils/readerStoredState';
import { toGlobalPageIndex, type NovelFlowIndex } from '../layout-core/internal';

interface UsePagedReaderPositionPersistenceParams {
  chapterIndex: number;
  currentChapterIndex: number | null;
  enabled: boolean;
  hasPagedNavigationSinceLastPersistRef: MutableRefObject<boolean>;
  lastPersistedPagedPageIndexRef: MutableRefObject<number | null>;
  layoutQueries: ReaderLayoutQueriesValue;
  navigation: Pick<ReaderNavigationRuntimeValue, 'getChapterChangeSource'>;
  pageIndex: number;
  pagedNovelFlowIndex: NovelFlowIndex | null;
  pendingPageTarget: PageTarget | null;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: MutableRefObject<ReaderRestoreTarget | null>;
  persistReaderState: ReaderSessionCommands['persistReaderState'];
  sessionPageIndex?: number;
}

export function usePagedReaderPositionPersistence({
  chapterIndex,
  currentChapterIndex,
  enabled,
  hasPagedNavigationSinceLastPersistRef,
  lastPersistedPagedPageIndexRef,
  layoutQueries,
  navigation,
  pageIndex,
  pagedNovelFlowIndex,
  pendingPageTarget,
  pendingRestoreTarget,
  pendingRestoreTargetRef,
  persistReaderState,
  sessionPageIndex,
}: UsePagedReaderPositionPersistenceParams): void {
  useEffect(() => {
    const hasPagedNavigationRef = hasPagedNavigationSinceLastPersistRef;
    const lastPersistedPageIndexRef = lastPersistedPagedPageIndexRef;
    const activePendingRestoreTarget = pendingRestoreTargetRef.current ?? pendingRestoreTarget;
    if (
      !enabled
      || currentChapterIndex !== chapterIndex
      || activePendingRestoreTarget
      || pendingPageTarget !== null
      || navigation.getChapterChangeSource() === 'navigation'
    ) {
      return;
    }

    const locator = layoutQueries.getCurrentPagedLocator();
    const previousPagedPageIndex =
      lastPersistedPageIndexRef.current ?? sessionPageIndex;
    if (
      lastPersistedPageIndexRef.current === null
      && typeof sessionPageIndex === 'number'
      && sessionPageIndex > 0
      && pageIndex === 0
    ) {
      return;
    }

    const nextPageIndex = locator?.pageIndex ?? pageIndex;
    const shouldClearScrollProgress =
      hasPagedNavigationRef.current
      || (
        previousPagedPageIndex !== undefined
        && previousPagedPageIndex !== null
        && previousPagedPageIndex !== nextPageIndex
      );

    if (!locator) {
      const persistFallbackSnapshot = {
        source: 'usePagedReaderController.persistCurrentPage',
        mode: 'paged',
        chapterIndex,
        pageIndex,
        fallbackReason: 'currentPagedLocator-null -> persist-chapter-start-edge',
      };
      setDebugSnapshot('reader-position-persist', persistFallbackSnapshot);
      debugLog('Reader', 'paged persist fallback to chapter start', persistFallbackSnapshot);
    }

    const nextGlobalPageIndex = pagedNovelFlowIndex
      ? toGlobalPageIndex(pagedNovelFlowIndex, {
        chapterIndex,
        localPageIndex: nextPageIndex,
      })
      : null;
    persistReaderState({
      canonical: toCanonicalPositionFromLocator(locator ?? undefined) ?? {
        chapterIndex,
        edge: 'start',
      },
      hints: {
        ...(shouldClearScrollProgress ? { chapterProgress: undefined } : {}),
        globalFlow: nextGlobalPageIndex === null || !pagedNovelFlowIndex
          ? undefined
          : {
            globalPageIndex: nextGlobalPageIndex,
            layoutKey: pagedNovelFlowIndex.layoutKey,
            sourceMode: 'paged',
          },
        pageIndex: nextPageIndex,
        contentMode: 'paged',
      },
    });
    lastPersistedPageIndexRef.current = nextPageIndex;
    hasPagedNavigationRef.current = false;
  }, [
    chapterIndex,
    currentChapterIndex,
    enabled,
    layoutQueries,
    navigation,
    pageIndex,
    pagedNovelFlowIndex,
    pendingPageTarget,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    persistReaderState,
    sessionPageIndex,
    hasPagedNavigationSinceLastPersistRef,
    lastPersistedPagedPageIndexRef,
  ]);
}
