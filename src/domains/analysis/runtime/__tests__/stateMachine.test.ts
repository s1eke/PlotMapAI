import { describe, expect, it } from 'vitest';

import { AnalysisErrorCode, AnalysisJobStateError } from '../../services/errors';
import {
  assertCanRefreshOverview,
  assertCanRestart,
  assertCanResume,
  deriveCapabilities,
  deriveCurrentStage,
  deriveJobPatchForChunkFailure,
  deriveJobPatchForOverviewSuccess,
  deriveJobPatchForPauseCommit,
  deriveJobPatchForPauseRequest,
  deriveJobPatchForRecovery,
  deriveJobPatchForResume,
  deriveJobPatchForStart,
  deriveProgress,
  type RuntimeSnapshot,
} from '../stateMachine';

function createSnapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    status: 'idle',
    pauseRequested: false,
    totalChunks: 0,
    completedChunks: 0,
    totalChapters: 0,
    analyzedChapters: 0,
    currentChunkIndex: 0,
    overviewComplete: false,
    analysisComplete: false,
    hasReusableChunks: false,
    hasIncompleteChunks: false,
    lastError: '',
    ...overrides,
  };
}

function expectStateError(action: () => void, code: string): void {
  try {
    action();
    throw new Error('expected action to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(AnalysisJobStateError);
    expect((error as AnalysisJobStateError).code).toBe(code);
  }
}

describe('analysis runtime state machine', () => {
  it('models idle -> running -> pausing -> paused -> running -> completed', () => {
    const started: RuntimeSnapshot = {
      ...createSnapshot(),
      ...deriveJobPatchForStart(3, 2, 0),
      totalChapters: 3,
      totalChunks: 2,
      hasReusableChunks: true,
      status: 'running' as const,
    };
    expect(deriveCurrentStage(started)).toBe('chapters');

    const pausing = {
      ...started,
      ...deriveJobPatchForPauseRequest(),
      pauseRequested: true,
      status: 'pausing' as const,
    };
    expect(deriveCapabilities(pausing).canPause).toBe(true);

    const paused = {
      ...pausing,
      ...deriveJobPatchForPauseCommit(),
      pauseRequested: false,
      status: 'paused' as const,
    };
    expect(deriveCapabilities(paused).canResume).toBe(true);

    const resumed: RuntimeSnapshot = {
      ...paused,
      ...deriveJobPatchForResume({
        totalChapters: 3,
        totalChunks: 2,
        completedChunks: 1,
        analyzedChapters: 2,
        currentChunkIndex: 1,
      }),
      completedChunks: 1,
      analyzedChapters: 2,
      currentChunkIndex: 1,
      status: 'running' as const,
    };
    expect(deriveCurrentStage(resumed)).toBe('chapters');
    expect(deriveProgress(resumed)).toBe(33.33);

    const completed: RuntimeSnapshot = {
      ...resumed,
      ...deriveJobPatchForOverviewSuccess(),
      status: 'completed' as const,
      completedChunks: 2,
      analyzedChapters: 3,
      overviewComplete: true,
      analysisComplete: true,
    };
    expect(deriveCurrentStage(completed)).toBe('completed');
    expect(deriveProgress(completed)).toBe(100);
    expect(deriveCapabilities(completed).canResume).toBe(false);
  });

  it('models running -> failed -> resume -> running', () => {
    const running = createSnapshot({
      status: 'running',
      totalChunks: 2,
      completedChunks: 0,
      totalChapters: 3,
      hasReusableChunks: true,
    });
    const failed = {
      ...running,
      ...deriveJobPatchForChunkFailure('boom'),
      status: 'failed' as const,
      lastError: 'boom',
    };
    expect(deriveCapabilities(failed).canResume).toBe(true);

    const resumed = {
      ...failed,
      ...deriveJobPatchForResume({
        totalChapters: 3,
        totalChunks: 2,
        completedChunks: 0,
        analyzedChapters: 0,
        currentChunkIndex: 0,
      }),
      status: 'running' as const,
      lastError: '',
    };
    expect(deriveCurrentStage(resumed)).toBe('chapters');
  });

  it('enforces resume, restart, and refreshOverview guards', () => {
    expectStateError(() => assertCanResume(createSnapshot({ status: 'running' })), AnalysisErrorCode.ANALYSIS_RUNNING);
    expectStateError(() => assertCanResume(createSnapshot({ status: 'idle' })), AnalysisErrorCode.JOB_NOT_RESUMABLE);
    expectStateError(
      () => assertCanResume(createSnapshot({ status: 'completed', hasReusableChunks: true, analysisComplete: true })),
      AnalysisErrorCode.ANALYSIS_COMPLETED,
    );
    expect(() => assertCanResume(createSnapshot({ status: 'completed', hasReusableChunks: true }))).not.toThrow();
    expect(() => assertCanResume(createSnapshot({ status: 'failed', hasReusableChunks: true }))).not.toThrow();
    expect(() => assertCanResume(createSnapshot({ status: 'idle', hasReusableChunks: true }))).not.toThrow();

    expectStateError(() => assertCanRestart(createSnapshot({ status: 'running' })), AnalysisErrorCode.PAUSE_FIRST);
    expect(() => assertCanRestart(createSnapshot({ status: 'paused', hasReusableChunks: true }))).not.toThrow();

    expectStateError(
      () => assertCanRefreshOverview(createSnapshot({ hasReusableChunks: false })),
      AnalysisErrorCode.NO_REUSEABLE_RESULTS,
    );
    expectStateError(
      () =>
        assertCanRefreshOverview(
          createSnapshot({ hasReusableChunks: true, totalChapters: 3, analyzedChapters: 2 }),
        ),
      AnalysisErrorCode.CHAPTERS_INCOMPLETE_FOR_OVERVIEW,
    );
  });

  it('derives recovery state and capabilities consistently', () => {
    const recovered = {
      ...createSnapshot({
        status: 'running',
        totalChunks: 2,
        completedChunks: 1,
        totalChapters: 4,
        analyzedChapters: 2,
        currentChunkIndex: 1,
        hasReusableChunks: true,
      }),
      ...deriveJobPatchForRecovery(createSnapshot({ status: 'running' })),
      status: 'paused' as const,
      pauseRequested: false,
      lastError: AnalysisErrorCode.APP_RESTARTED,
    };
    expect(recovered.lastError).toBe(AnalysisErrorCode.APP_RESTARTED);
    expect(deriveCapabilities(recovered).canResume).toBe(true);
  });
});
