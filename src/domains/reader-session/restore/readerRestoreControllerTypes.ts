import type { ChapterContent } from '@shared/contracts/reader';
import type { ReaderSessionSnapshot } from '../hooks/useReaderSession';
import type {
  ReaderMode,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  ReaderSessionCommands,
  RestoreSettledResult,
  StoredReaderState,
} from '@shared/contracts/reader';
import type { useReaderStrictModeSwitch } from '../mode-switch/useReaderStrictModeSwitch';

export interface UseReaderRestoreControllerParams {
  sessionSnapshot: Pick<
    ReaderSessionSnapshot,
    'chapterIndex' | 'mode' | 'pendingRestoreTarget' | 'restoreStatus'
  >;
  sessionCommands: Pick<
    ReaderSessionCommands,
    | 'latestReaderStateRef'
    | 'markUserInteracted'
    | 'persistReaderState'
    | 'setChapterIndex'
    | 'setMode'
  >;
  currentChapter: ChapterContent | null;
  summaryRestoreSignal: unknown;
  isChapterAnalysisLoading: boolean;
}

export interface UseReaderRestoreControllerResult {
  modeSwitchError: ReturnType<typeof useReaderStrictModeSwitch>['modeSwitchError'];
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  captureCurrentReaderPosition: (options?: { flush?: boolean }) => StoredReaderState;
  clearPendingRestoreTarget: () => void;
  handleBeforeChapterChange: () => void;
  handleContentScroll: () => void;
  handleRestoreSettled: (result: RestoreSettledResult) => boolean;
  switchMode: (targetMode: ReaderMode) => Promise<void>;
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  retryLastFailedRestore: () => boolean;
  setPendingRestoreTarget: (
    nextTarget: ReaderRestoreTarget | null,
    options?: { force?: boolean },
  ) => void;
  startRestoreMaskForTarget: (target: ReaderRestoreTarget | null | undefined) => void;
  stopRestoreMask: () => void;
  suppressScrollSyncTemporarily: () => void;
}
