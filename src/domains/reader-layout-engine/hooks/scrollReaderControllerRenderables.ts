import type { MutableRefObject } from 'react';
import type {
  ChapterContent,
  ReaderChapterCacheApi,
  ReaderRestoreTarget,
} from '@shared/contracts/reader';

import type { NovelFlowIndex } from '../utils/flow-index/novelFlowIndex';
import type {
  RenderableScrollLayout,
  ScrollReaderLayout,
} from './scrollReaderControllerTypes';

export interface ScrollReaderChapter {
  chapter: ChapterContent;
  index: number;
}

export function getCachedScrollReaderChapters(params: {
  cache: Pick<ReaderChapterCacheApi, 'getCachedChapter'>;
  chapterIndices: number[];
}): ScrollReaderChapter[] {
  return params.chapterIndices
    .map((index) => {
      const chapter = params.cache.getCachedChapter(index);
      return chapter ? { index, chapter } : null;
    })
    .filter((item): item is ScrollReaderChapter => Boolean(item));
}

export function getRenderableScrollLayouts(params: {
  novelFlowIndex: NovelFlowIndex | null;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: MutableRefObject<ReaderRestoreTarget | null>;
  retainedFocusedWindowChapterIndex: number | null;
  scrollLayouts: Map<number, ScrollReaderLayout>;
  scrollReaderChapters: ScrollReaderChapter[];
  visibleFlowChapterIndices: number[];
}): RenderableScrollLayout[] {
  const activeRestoreTarget =
    params.pendingRestoreTargetRef.current ?? params.pendingRestoreTarget;

  return params.scrollReaderChapters.flatMap((renderableScrollChapter) => {
    const layout = params.scrollLayouts.get(renderableScrollChapter.index);
    const flowEntry =
      params.novelFlowIndex?.chapters[renderableScrollChapter.index] ?? null;
    const shouldRender =
      params.visibleFlowChapterIndices.includes(renderableScrollChapter.index)
      || (
        activeRestoreTarget?.mode === 'scroll'
        && activeRestoreTarget.chapterIndex === renderableScrollChapter.index
      )
      || params.retainedFocusedWindowChapterIndex === renderableScrollChapter.index;

    return layout && shouldRender
      ? [{ ...renderableScrollChapter, flowEntry, layout }]
      : [];
  });
}
