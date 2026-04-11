import type { ComponentProps } from 'react';
import type { ChapterContent, PageTarget, RestoreStatus } from '@shared/contracts/reader';
import type { AppError } from '@shared/errors';
import type {
  PagedReaderContent,
  ScrollReaderContent,
  SummaryReaderContent,
} from '@domains/reader-layout-engine';
import type {
  UseReaderChapterDataResult,
} from '@domains/reader-content';
import type {
  UseReaderRestoreControllerResult,
  UseReaderSessionResult,
} from '@domains/reader-session';
import type { ReaderPageLayoutProps } from '@domains/reader-shell';

export interface ReaderPageViewModel extends ReaderPageLayoutProps {}

export type ReaderLifecycleStatus = RestoreStatus;

export interface ReaderLifecycleControllerResult {
  handleRestoreSettled: (result: 'completed' | 'failed' | 'skipped') => void;
  isChapterNavigationReady: boolean;
  isRestoringPosition: boolean;
  lifecycleStatus: ReaderLifecycleStatus;
  loadingLabel: string | null;
  readerError: AppError | null;
  renderableChapter: ChapterContent | null;
  showLoadingOverlay: boolean;
}

export interface ReaderNavigationControllerResult {
  goToChapter: (targetIndex: number, pageTarget?: PageTarget) => void;
  goToNextPage: () => void;
  goToNextPageSilently: () => void;
  goToPrevPage: () => void;
  goToPrevPageSilently: () => void;
  handleNext: () => void;
  handlePrev: () => void;
  pageTurnDirection: 'next' | 'prev';
  pageTurnToken: number;
  toolbarHasNext: boolean;
  toolbarHasPrev: boolean;
}

export interface ReaderLayoutControllerImageHandlers extends Pick<
  ComponentProps<typeof PagedReaderContent>,
  'onImageActivate' | 'onRegisterImageElement'
> {}

export interface ReaderReadingSurfaceViewportContentProps {
  pagedContentProps?: ComponentProps<typeof PagedReaderContent>;
  scrollContentProps?: ComponentProps<typeof ScrollReaderContent>;
  summaryContentProps?: ComponentProps<typeof SummaryReaderContent>;
}

export interface ReaderReadingSurfaceController {
  chapterData: Pick<UseReaderChapterDataResult, 'chapters' | 'currentChapter'>;
  lifecycle: ReaderLifecycleControllerResult;
  navigation: ReaderNavigationControllerResult;
  restore: Pick<UseReaderRestoreControllerResult, 'switchMode'>;
  sessionSnapshot: Pick<
    UseReaderSessionResult['snapshot'],
    'chapterIndex' | 'isPagedMode' | 'lastContentMode' | 'mode' | 'viewMode'
  >;
  viewport: {
    buildContentProps: (options: {
      imageHandlers: ReaderLayoutControllerImageHandlers;
      interactionLocked: boolean;
    }) => ReaderReadingSurfaceViewportContentProps;
    handleViewportScroll: () => void;
    renderableChapter: ChapterContent | null;
  };
}
