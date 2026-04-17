import type {
  Chapter,
  ChapterContent,
  PageTarget,
  ReaderChapterCacheApi,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  ReaderSessionCommands,
  ReaderSessionSnapshot,
} from '@shared/contracts/reader';
import type { PaginatedChapterLayout } from '../layout-core/internal';

export type NavigationDirection = 'next' | 'prev';

export type DirectionalNavigationReplay = (
  direction: NavigationDirection,
  shouldAnimate: boolean,
) => void;

export type PagedReaderLayout = PaginatedChapterLayout;

export const EMPTY_SCROLL_CHAPTERS: Array<{ chapter: ChapterContent; index: number }> = [];

export interface PagedReaderControllerPreferences {
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

export interface UsePagedReaderControllerParams {
  enabled: boolean;
  novelId: number;
  chapters: Chapter[];
  currentChapter: ChapterContent | null;
  chapterDataRevision: number;
  sessionSnapshot: Pick<ReaderSessionSnapshot, 'chapterIndex'>;
  sessionCommands: Pick<
    ReaderSessionCommands,
    'hasUserInteractedRef' | 'persistReaderState' | 'setChapterIndex'
  >;
  cache: Pick<ReaderChapterCacheApi, 'snapshotCachedChapters'>;
  fetchChapterContent: (
    index: number,
    options?: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    },
  ) => Promise<ChapterContent>;
  preferences: PagedReaderControllerPreferences;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  clearPendingRestoreTarget: () => void;
  stopRestoreMask: () => void;
  beforeChapterChange?: () => void;
}

export interface UsePagedReaderControllerResult {
  currentPagedLayout: PagedReaderLayout | null;
  currentPagedLayoutChapterIndex: number | null;
  handlePagedContentRef: (element: HTMLDivElement | null) => void;
  handlePagedViewportRef: (element: HTMLDivElement | null) => void;
  nextChapterPreview: ChapterContent | null;
  nextPagedLayout: PagedReaderLayout | null;
  pageCount: number;
  pageIndex: number;
  pageTurnDirection: NavigationDirection;
  pageTurnToken: number;
  pendingPageTarget: PageTarget | null;
  previousChapterPreview: ChapterContent | null;
  previousPagedLayout: PagedReaderLayout | null;
  goToChapter: (targetIndex: number, pageTarget?: PageTarget) => void;
  goToNextPage: () => void;
  goToNextPageSilently: () => void;
  goToPrevPage: () => void;
  goToPrevPageSilently: () => void;
  handleNext: () => void;
  handlePrev: () => void;
  toolbarHasNext: boolean;
  toolbarHasPrev: boolean;
}
