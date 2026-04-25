import { useMemo } from 'react';
import {
  buildNovelFlowIndex,
  serializeReaderLayoutSignature,
  toGlobalPageIndex,
  type NovelFlowIndex,
} from '../layout-core/internal';
import type { UseReaderRenderCacheResult } from './readerRenderCacheTypes';

interface UsePagedReaderFlowProjectionParams {
  chapterCount: number;
  chapterIndex: number;
  effectivePageCount: number;
  enabled: boolean;
  novelId: number;
  pageIndex: number;
  renderCache: Pick<
    UseReaderRenderCacheResult,
    'pagedLayoutSignature' | 'pagedManifests'
  >;
}

interface PagedReaderFlowProjection {
  globalPageCount: number;
  globalPageIndex: number;
  pagedNovelFlowIndex: NovelFlowIndex | null;
}

export function usePagedReaderFlowProjection({
  chapterCount,
  chapterIndex,
  effectivePageCount,
  enabled,
  novelId,
  pageIndex,
  renderCache,
}: UsePagedReaderFlowProjectionParams): PagedReaderFlowProjection {
  const pagedNovelFlowIndex = useMemo(() => (
    enabled
      ? buildNovelFlowIndex({
        chapterCount,
        layoutKey: serializeReaderLayoutSignature(renderCache.pagedLayoutSignature),
        layoutSignature: renderCache.pagedLayoutSignature,
        manifests: renderCache.pagedManifests.values(),
        novelId,
      })
      : null
  ), [
    chapterCount,
    enabled,
    novelId,
    renderCache.pagedLayoutSignature,
    renderCache.pagedManifests,
  ]);
  const globalPageIndex = pagedNovelFlowIndex
    ? toGlobalPageIndex(pagedNovelFlowIndex, {
      chapterIndex,
      localPageIndex: pageIndex,
    }) ?? pageIndex
    : pageIndex;
  const globalPageCount = pagedNovelFlowIndex?.totalPageCount
    && pagedNovelFlowIndex.totalPageCount > 0
    ? pagedNovelFlowIndex.totalPageCount
    : effectivePageCount;

  return {
    globalPageCount,
    globalPageIndex,
    pagedNovelFlowIndex,
  };
}
