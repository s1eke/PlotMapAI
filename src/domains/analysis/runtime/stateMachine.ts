import type { AnalysisJob } from '@infra/db';
import { AnalysisErrorCode, AnalysisJobStateError } from '../services/errors';

import type { AnalysisJobStatus } from '../api/analysisApi';

const RUNNING_STATUSES = new Set<AnalysisJobStatus['status']>(['running', 'pausing']);
const RESUMABLE_STATUSES = new Set<AnalysisJobStatus['status']>(['paused', 'failed']);

export interface RuntimeSnapshot {
  status: AnalysisJobStatus['status'];
  pauseRequested: boolean;
  totalChunks: number;
  completedChunks: number;
  totalChapters: number;
  analyzedChapters: number;
  currentChunkIndex: number;
  overviewComplete: boolean;
  analysisComplete: boolean;
  hasReusableChunks: boolean;
  hasIncompleteChunks: boolean;
  lastError: string;
}

interface ResumePatchInput {
  totalChapters: number;
  totalChunks: number;
  completedChunks: number;
  analyzedChapters: number;
  currentChunkIndex: number;
}

function isRunningStatus(status: RuntimeSnapshot['status']): boolean {
  return RUNNING_STATUSES.has(status);
}

export function deriveCurrentStage(snapshot: RuntimeSnapshot): AnalysisJobStatus['currentStage'] {
  if (snapshot.analysisComplete) return 'completed';
  if (snapshot.totalChunks <= 0 || snapshot.status === 'idle') return 'idle';
  if (snapshot.completedChunks >= snapshot.totalChunks && !snapshot.overviewComplete) return 'overview';
  return 'chapters';
}

export function deriveProgress(snapshot: RuntimeSnapshot): number {
  const totalSteps = snapshot.totalChunks + (snapshot.totalChunks > 0 ? 1 : 0);
  const completedSteps =
    snapshot.completedChunks + (snapshot.overviewComplete && snapshot.totalChunks > 0 ? 1 : 0);
  return totalSteps ? Math.round((completedSteps / totalSteps) * 10000) / 100 : 0;
}

export function deriveCapabilities(snapshot: RuntimeSnapshot): Pick<
  AnalysisJobStatus,
  'canStart' | 'canPause' | 'canResume' | 'canRestart'
> {
  return {
    canStart: snapshot.status === 'idle' || snapshot.totalChunks === 0,
    canPause: isRunningStatus(snapshot.status),
    canResume:
      RESUMABLE_STATUSES.has(snapshot.status) ||
      ((snapshot.status === 'idle' || snapshot.status === 'completed') &&
        snapshot.hasReusableChunks &&
        !snapshot.analysisComplete),
    canRestart: !isRunningStatus(snapshot.status) && snapshot.hasReusableChunks,
  };
}

export function assertCanStart(snapshot: RuntimeSnapshot): void {
  if (isRunningStatus(snapshot.status)) {
    throw new AnalysisJobStateError(AnalysisErrorCode.ANALYSIS_IN_PROGRESS);
  }
  if (
    snapshot.hasReusableChunks &&
    ['paused', 'failed', 'completed'].includes(snapshot.status)
  ) {
    throw new AnalysisJobStateError(AnalysisErrorCode.JOB_ALREADY_EXISTS);
  }
}

export function assertCanPause(snapshot: RuntimeSnapshot): void {
  if (!isRunningStatus(snapshot.status)) {
    throw new AnalysisJobStateError(AnalysisErrorCode.NO_PAUSABLE_JOB);
  }
}

export function assertCanResume(snapshot: RuntimeSnapshot): void {
  if (isRunningStatus(snapshot.status)) {
    throw new AnalysisJobStateError(AnalysisErrorCode.ANALYSIS_RUNNING);
  }
  if (
    !RESUMABLE_STATUSES.has(snapshot.status) &&
    !((snapshot.status === 'idle' || snapshot.status === 'completed') && snapshot.hasReusableChunks)
  ) {
    throw new AnalysisJobStateError(AnalysisErrorCode.JOB_NOT_RESUMABLE);
  }
  if (!snapshot.hasReusableChunks) {
    throw new AnalysisJobStateError(AnalysisErrorCode.NO_RESUMABLE_CHUNKS);
  }
  if (snapshot.analysisComplete) {
    throw new AnalysisJobStateError(AnalysisErrorCode.ANALYSIS_COMPLETED);
  }
}

export function assertCanRestart(snapshot: RuntimeSnapshot): void {
  if (isRunningStatus(snapshot.status)) {
    throw new AnalysisJobStateError(AnalysisErrorCode.PAUSE_FIRST);
  }
}

export function assertCanRefreshOverview(snapshot: RuntimeSnapshot): void {
  if (isRunningStatus(snapshot.status)) {
    throw new AnalysisJobStateError(AnalysisErrorCode.ANALYSIS_IN_PROGRESS);
  }
  if (!snapshot.hasReusableChunks) {
    throw new AnalysisJobStateError(AnalysisErrorCode.NO_REUSEABLE_RESULTS);
  }
  if (snapshot.hasIncompleteChunks || snapshot.analyzedChapters < snapshot.totalChapters) {
    throw new AnalysisJobStateError(AnalysisErrorCode.CHAPTERS_INCOMPLETE_FOR_OVERVIEW);
  }
}

export function deriveJobPatchForStart(
  totalChapters: number,
  totalChunks: number,
  currentChunkIndex: number,
): Partial<AnalysisJob> {
  return {
    status: 'running',
    totalChapters,
    analyzedChapters: 0,
    totalChunks,
    completedChunks: 0,
    currentChunkIndex,
    pauseRequested: false,
    lastError: '',
    completedAt: null,
    lastHeartbeat: null,
  };
}

export function deriveJobPatchForPauseRequest(): Partial<AnalysisJob> {
  return { pauseRequested: true, status: 'pausing' };
}

export function deriveJobPatchForPauseCommit(): Partial<AnalysisJob> {
  return { status: 'paused', pauseRequested: false };
}

export function deriveJobPatchForResume(input: ResumePatchInput): Partial<AnalysisJob> {
  return {
    status: 'running',
    pauseRequested: false,
    completedAt: null,
    lastError: '',
    totalChunks: input.totalChunks,
    completedChunks: input.completedChunks,
    totalChapters: input.totalChapters,
    analyzedChapters: input.analyzedChapters,
    currentChunkIndex: input.currentChunkIndex,
  };
}

export function deriveJobPatchForChunkStart(chunkIndex: number): Partial<AnalysisJob> {
  return {
    status: 'running',
    currentChunkIndex: chunkIndex,
    lastError: '',
  };
}

export function deriveJobPatchForChunkSuccess(): Partial<AnalysisJob> {
  return {
    status: 'running',
    lastError: '',
  };
}

export function deriveJobPatchForChunkFailure(message: string): Partial<AnalysisJob> {
  return {
    status: 'failed',
    pauseRequested: false,
    lastError: message,
  };
}

export function deriveJobPatchForOverviewStart(totalChunks: number): Partial<AnalysisJob> {
  return {
    status: 'running',
    currentChunkIndex: totalChunks,
    lastError: '',
    completedAt: null,
  };
}

export function deriveJobPatchForOverviewSuccess(): Partial<AnalysisJob> {
  return {
    status: 'completed',
    pauseRequested: false,
    lastError: '',
  };
}

export function deriveJobPatchForOverviewFailure(message: string): Partial<AnalysisJob> {
  return {
    status: 'failed',
    pauseRequested: false,
    lastError: message,
  };
}

export function deriveJobPatchForRecovery(snapshot: RuntimeSnapshot): Partial<AnalysisJob> {
  return {
    status: 'paused',
    pauseRequested: false,
    lastError: snapshot.lastError || AnalysisErrorCode.APP_RESTARTED,
  };
}
