import { useEffect, useMemo, useState } from 'react';

import type { ChapterContent, ReaderChapterCacheApi } from '@shared/contracts/reader';

const EMPTY_PAGED_CHAPTERS: ChapterContent[] = [];

interface ChapterPreviewCacheState {
  novelId: number;
  snapshot: Map<number, ChapterContent>;
}

interface UsePagedChapterPreviewsParams {
  cache: Pick<ReaderChapterCacheApi, 'snapshotCachedChapters'>;
  chapterDataRevision: number;
  chapterIndex: number;
  currentChapter: ChapterContent | null;
  enabled: boolean;
  novelId: number;
}

interface UsePagedChapterPreviewsResult {
  nextChapterPreview: ChapterContent | null;
  pagedChapters: ChapterContent[];
  previousChapterPreview: ChapterContent | null;
}

export function usePagedChapterPreviews({
  cache,
  chapterDataRevision,
  chapterIndex,
  currentChapter,
  enabled,
  novelId,
}: UsePagedChapterPreviewsParams): UsePagedChapterPreviewsResult {
  const [chapterCacheSnapshotState, setChapterCacheSnapshotState] =
    useState<ChapterPreviewCacheState>({
      novelId,
      snapshot: new Map(),
    });

  useEffect(() => {
    setChapterCacheSnapshotState({
      novelId,
      snapshot: cache.snapshotCachedChapters(),
    });
  }, [cache, chapterDataRevision, novelId]);

  const chapterCacheSnapshot = chapterCacheSnapshotState.novelId === novelId
    ? chapterCacheSnapshotState.snapshot
    : new Map<number, ChapterContent>();
  const previousChapterPreview = currentChapter?.hasPrev
    ? chapterCacheSnapshot.get(chapterIndex - 1) ?? null
    : null;
  const nextChapterPreview = currentChapter?.hasNext
    ? chapterCacheSnapshot.get(chapterIndex + 1) ?? null
    : null;

  const pagedChapters = useMemo(() => {
    if (!enabled) {
      return EMPTY_PAGED_CHAPTERS;
    }

    const chaptersToLayout = new Map<number, ChapterContent>();
    for (const renderableChapter of [previousChapterPreview, currentChapter, nextChapterPreview]) {
      if (renderableChapter) {
        chaptersToLayout.set(renderableChapter.index, renderableChapter);
      }
    }

    return Array.from(chaptersToLayout.values());
  }, [currentChapter, enabled, nextChapterPreview, previousChapterPreview]);

  return {
    nextChapterPreview,
    pagedChapters,
    previousChapterPreview,
  };
}
