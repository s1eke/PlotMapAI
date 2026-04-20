import type { MutableRefObject } from 'react';
import type {
  Chapter,
  ChapterContent,
  ReaderChapterCacheApi,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  ReaderSessionCommands,
  ReaderSessionSnapshot,
} from '@shared/contracts/reader';
import type {
  MeasuredChapterLayout,
  VisibleBlockRange,
} from '../utils/layout/readerLayout';

export interface ScrollReaderControllerPreferences {
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

export interface UseScrollReaderControllerParams {
  enabled: boolean;
  novelId: number;
  chapters: Chapter[];
  currentChapter: ChapterContent | null;
  chapterDataRevision: number;
  sessionSnapshot: Pick<ReaderSessionSnapshot, 'chapterIndex'>;
  sessionCommands: Pick<
    ReaderSessionCommands,
    'persistReaderState' | 'setChapterIndex'
  >;
  cache: Pick<
    ReaderChapterCacheApi,
    'getCachedChapter' | 'hasCachedChapter' | 'setCachedChapter'
  >;
  fetchChapterContent: (
    index: number,
    options?: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    },
  ) => Promise<ChapterContent>;
  preloadAdjacent: (index: number, prune?: boolean) => void;
  preferences: ScrollReaderControllerPreferences;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: MutableRefObject<ReaderRestoreTarget | null>;
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  clearPendingRestoreTarget: () => void;
  stopRestoreMask: () => void;
}

export interface ScrollAnchorSnapshot {
  chapterIndex: number | null;
  chapterOffsetTop: number | null;
  firstRenderableChapterIndex: number | null;
  scrollTop: number;
}

export type ScrollReaderLayout = MeasuredChapterLayout;
export type VisibleScrollBlockRange = VisibleBlockRange;
export interface RenderableScrollLayout {
  chapter: ChapterContent;
  index: number;
  layout: ScrollReaderLayout;
}

export interface UseScrollReaderControllerResult {
  handleContentScroll: () => void;
  handleScrollChapterBodyElement: (
    index: number,
    element: HTMLDivElement | null,
  ) => void;
  handleScrollChapterElement: (index: number, element: HTMLDivElement | null) => void;
  renderableScrollLayouts: RenderableScrollLayout[];
  syncViewportState: (options?: { force?: boolean }) => void;
  visibleScrollBlockRangeByChapter: Map<number, VisibleScrollBlockRange>;
}

export const EMPTY_PAGED_CHAPTERS: ChapterContent[] = [];
export const EMPTY_SCROLL_READER_CHAPTERS: Array<{ index: number; chapter: ChapterContent }> = [];
