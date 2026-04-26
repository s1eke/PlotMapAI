import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type {
  ChapterContent,
  ReaderLocator,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  StoredReaderState,
} from '@shared/contracts/reader';
import type { ScrollReaderLayout } from './scrollReaderControllerTypes';
import type { NovelFlowIndex } from '../layout-core/internal';

export interface UseScrollReaderRestoreParams {
  chapterIndex: number;
  chaptersLength: number;
  clearPendingRestoreTarget: () => void;
  currentChapter: ChapterContent | null;
  enabled: boolean;
  layoutQueries: {
    getCurrentOriginalLocator: () => ReaderLocator | null;
    resolveScrollLocatorOffset: (locator: ReaderLocator) => number | null;
  };
  navigation: {
    setChapterChangeSource: (source: 'navigation' | 'restore' | 'scroll' | null) => void;
  };
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: MutableRefObject<ReaderRestoreTarget | null>;
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  retainFocusedWindowAfterRestore: (chapterIndex: number) => void;
  persistReaderState: (state: StoredReaderState) => void;
  persistence: {
    notifyRestoreSettled: (status: 'completed' | 'failed' | 'skipped') => void;
    suppressScrollSyncTemporarily: () => void;
  };
  scrollChapterBodyElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollChapterElementsRef: MutableRefObject<Map<number, HTMLDivElement>>;
  scrollLayouts: ReadonlyMap<number, ScrollReaderLayout>;
  novelFlowIndex: NovelFlowIndex | null;
  setScrollModeChapters: Dispatch<SetStateAction<number[]>>;
  stopRestoreMask: () => void;
  syncViewportState: (options?: { force?: boolean }) => void;
  viewportContentRef: RefObject<HTMLDivElement | null>;
}
