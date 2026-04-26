import type { PageTarget, ReaderLocator } from '@shared/contracts/reader';

export type ReaderProgressMode = 'scroll' | 'paged';

export type ReaderProgressCaptureQuality = 'precise' | 'approximate';

export type ReaderProgressRestoreStatus = 'completed' | 'skipped' | 'failed';

export type ReaderProgressRestoreReason =
  | 'restored'
  | 'no_snapshot'
  | 'position_unresolvable'
  | 'layout_not_ready'
  | 'validation_failed'
  | 'execution_failed';

export type ReaderProgressPosition =
  | {
    type: 'locator';
    locator: ReaderLocator;
  }
  | {
    type: 'chapter-edge';
    chapterIndex: number;
    edge: PageTarget;
  };

export interface ReaderProgressProjection {
  scroll?: {
    chapterProgress?: number;
    capturedAt?: string;
    sourceMode?: ReaderProgressMode;
    basisCanonicalFingerprint?: string;
  };
  paged?: {
    pageIndex?: number;
    capturedAt?: string;
    sourceMode?: ReaderProgressMode;
    basisCanonicalFingerprint?: string;
    layoutKey?: string;
  };
  global?: {
    globalScrollOffset?: number;
    globalPageIndex?: number;
    capturedAt?: string;
    sourceMode?: ReaderProgressMode;
    basisCanonicalFingerprint?: string;
    layoutKey?: string;
  };
}

export interface ReaderProgressSnapshot {
  mode: ReaderProgressMode;
  activeChapterIndex: number;
  position: ReaderProgressPosition;
  projections?: ReaderProgressProjection;
  captureQuality: ReaderProgressCaptureQuality;
  capturedAt?: string;
  sourceMode?: ReaderProgressMode;
  resolverVersion?: number;
}

export interface PersistedReaderProgressSnapshot {
  novelId: number;
  revision: number;
  snapshot: ReaderProgressSnapshot;
  updatedAt: string;
}

export interface ReaderProgressRestoreRequest {
  novelId: number;
  mode: ReaderProgressMode;
  chapterIndex: number;
  position: ReaderProgressPosition;
  projections?: ReaderProgressProjection;
}

export interface ReaderProgressRestoreResult {
  status: ReaderProgressRestoreStatus;
  reason: ReaderProgressRestoreReason;
  mode: ReaderProgressMode;
  chapterIndex: number;
  retryable: boolean;
  measuredDelta?: number;
}

export function getReaderProgressPositionChapterIndex(
  position: ReaderProgressPosition,
): number {
  if (position.type === 'locator') {
    return position.locator.chapterIndex;
  }

  return position.chapterIndex;
}

export function toReaderProgressRestoreRequest(params: {
  novelId: number;
  snapshot: ReaderProgressSnapshot;
}): ReaderProgressRestoreRequest {
  return {
    novelId: params.novelId,
    mode: params.snapshot.mode,
    chapterIndex: params.snapshot.activeChapterIndex,
    position: params.snapshot.position,
    projections: params.snapshot.projections,
  };
}
