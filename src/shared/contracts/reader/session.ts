import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { ReaderLocator } from './layout';

export type PageTarget = 'start' | 'end';
export type ReaderMode = 'scroll' | 'paged' | 'summary';
export type ReaderViewMode = 'original' | 'summary';
export type RestoreStatus =
  | 'hydrating'
  | 'loading-chapters'
  | 'loading-chapter'
  | 'restoring-position'
  | 'awaiting-paged-layout'
  | 'ready'
  | 'error';
export type ReaderLocatorBoundary = PageTarget;
export type ChapterChangeSource = 'navigation' | 'scroll' | 'restore' | null;
export type ReaderRestoreMetric = 'scroll_px' | 'page_delta' | 'progress_delta';
export type ReaderRestoreReason =
  | 'restored'
  | 'no_target'
  | 'mode_mismatch'
  | 'container_missing'
  | 'layout_missing'
  | 'layout_not_ready'
  | 'target_unresolvable'
  | 'validation_exceeded_tolerance'
  | 'execution_exception';
export type ReaderRestoreResultStatus = 'completed' | 'skipped' | 'failed';
export type ReaderPersistenceStatus = 'healthy' | 'degraded';
export type ReaderLifecycleEventType =
  | 'RESET'
  | 'NOVEL_OPEN_STARTED'
  | 'HYDRATE_SUCCEEDED_NO_CHAPTERS'
  | 'HYDRATE_SUCCEEDED_WITH_CHAPTERS'
  | 'HYDRATE_FAILED'
  | 'CHAPTER_LOAD_STARTED'
  | 'CHAPTER_LOAD_COMPLETED_NO_RESTORE'
  | 'CHAPTER_LOAD_COMPLETED_NEEDS_RESTORE'
  | 'CHAPTER_LOAD_FAILED'
  | 'RESTORE_STARTED'
  | 'RESTORE_CLEARED'
  | 'RESTORE_SETTLED'
  | 'PAGED_LAYOUT_READY';

export interface CanonicalPosition {
  chapterIndex: number;
  chapterKey?: string;
  blockIndex?: number;
  blockKey?: string;
  anchorId?: string;
  imageKey?: string;
  kind?: ReaderLocator['kind'];
  lineIndex?: number;
  startCursor?: ReaderLocator['startCursor'];
  endCursor?: ReaderLocator['endCursor'];
  edge?: ReaderLocator['edge'];
  textQuote?: ReaderLocator['textQuote'];
  blockTextHash?: string;
  contentVersion?: number;
  importFormatVersion?: number;
  contentHash?: string;
}

export type CanonicalPositionV2 =
  | {
    type: 'chapter-boundary';
    chapterIndex: number;
    chapterKey?: string;
    edge: PageTarget;
    contentVersion?: number;
    importFormatVersion?: number;
    contentHash?: string;
  }
  | {
    type: 'block-anchor';
    chapterIndex: number;
    chapterKey?: string;
    blockIndex?: number;
    blockKey?: string;
    anchorId?: string;
    imageKey?: string;
    kind: ReaderLocator['kind'];
    lineIndex?: number;
    startCursor?: ReaderLocator['startCursor'];
    endCursor?: ReaderLocator['endCursor'];
    edge?: ReaderLocator['edge'];
    textQuote?: ReaderLocator['textQuote'];
    blockTextHash?: string;
    contentVersion?: number;
    importFormatVersion?: number;
    contentHash?: string;
  };

export interface ReaderProjectionMetadata {
  basisCanonicalFingerprint?: string;
  capturedAt?: string;
  layoutKey?: string;
  sourceMode?: 'scroll' | 'paged';
}

export interface ReaderStateHints {
  chapterProgress?: number;
  pageIndex?: number;
  contentMode?: 'scroll' | 'paged';
  viewMode?: ReaderViewMode;
  scrollProjection?: ReaderProjectionMetadata;
  pagedProjection?: ReaderProjectionMetadata;
}

export interface ReaderPositionMetadata {
  capturedAt?: string;
  captureQuality?: 'precise' | 'approximate';
  resolverVersion?: number;
  sourceMode?: 'scroll' | 'paged';
}

export interface StoredReaderState {
  canonical?: CanonicalPosition;
  canonicalV2?: CanonicalPositionV2;
  hints?: ReaderStateHints;
  metadata?: ReaderPositionMetadata;
}

export interface PersistedReadingProgress {
  state: StoredReaderState;
  revision: number;
  updatedAt: string;
}

export interface ReaderRestoreTarget {
  chapterIndex: number;
  mode: ReaderMode;
  position?: CanonicalPositionV2;
  locatorBoundary?: ReaderLocatorBoundary;
  chapterProgress?: number;
  locator?: ReaderLocator;
}

export interface ReaderRestoreMeasuredError {
  metric: ReaderRestoreMetric;
  delta: number;
  tolerance: number;
  expected?: number;
  actual?: number;
}

export interface ReaderRestoreResult {
  status: ReaderRestoreResultStatus;
  reason: ReaderRestoreReason;
  measuredError?: ReaderRestoreMeasuredError;
  retryable: boolean;
  attempts: number;
  mode: ReaderMode;
  chapterIndex: number;
}

export interface ReaderPersistenceFailure {
  code?: string;
  message: string;
  retryable: boolean;
  time: number;
}

export type ReaderLifecycleEvent =
  | { type: 'RESET' }
  | { type: 'NOVEL_OPEN_STARTED' }
  | { type: 'HYDRATE_SUCCEEDED_NO_CHAPTERS' }
  | { type: 'HYDRATE_SUCCEEDED_WITH_CHAPTERS' }
  | { type: 'HYDRATE_FAILED' }
  | { type: 'CHAPTER_LOAD_STARTED'; loadKey: string }
  | {
    type: 'CHAPTER_LOAD_COMPLETED_NO_RESTORE';
    awaitingPagedLayout: boolean;
  }
  | { type: 'CHAPTER_LOAD_COMPLETED_NEEDS_RESTORE'; loadKey: string }
  | { type: 'CHAPTER_LOAD_FAILED' }
  | { type: 'RESTORE_STARTED' }
  | { type: 'RESTORE_CLEARED' }
  | {
    type: 'RESTORE_SETTLED';
    result: ReaderRestoreResultStatus;
    awaitingPagedLayout: boolean;
  }
  | { type: 'PAGED_LAYOUT_READY' };

export interface ReaderNavigationIntent {
  chapterIndex: number;
  pageTarget: PageTarget;
  locator?: ReaderLocator;
  locatorBoundary?: ReaderLocatorBoundary;
}

export interface ReaderSessionState {
  novelId: number;
  canonical?: CanonicalPosition;
  mode: ReaderMode;
  chapterIndex: number;
  chapterProgress?: number;
  locator?: ReaderLocator;
  positionMetadata?: ReaderPositionMetadata;
  restoreStatus: RestoreStatus;
  lifecycleLastEvent: ReaderLifecycleEventType | null;
  lifecycleLoadKey: string | null;
  lastRestoreResult: ReaderRestoreResult | null;
  persistenceStatus: ReaderPersistenceStatus;
  lastPersistenceFailure: ReaderPersistenceFailure | null;
  lastContentMode: 'scroll' | 'paged';
  pendingRestoreTarget: ReaderRestoreTarget | null;
  hasUserInteracted: boolean;
}

export type ReaderSessionSnapshot = ReaderSessionState;

export interface ReaderSessionCommands {
  setChapterIndex: Dispatch<SetStateAction<number>>;
  setLastContentMode: (mode: 'scroll' | 'paged') => void;
  setMode: Dispatch<SetStateAction<ReaderMode>>;
  latestReaderStateRef: MutableRefObject<StoredReaderState>;
  hasUserInteractedRef: MutableRefObject<boolean>;
  markUserInteracted: () => void;
  persistReaderState: (
    nextState: StoredReaderState,
    options?: { flush?: boolean; persistRemote?: boolean },
  ) => void;
  flushReaderState: () => Promise<void>;
  loadPersistedReaderState: () => Promise<StoredReaderState>;
}
