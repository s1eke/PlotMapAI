import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalysisStatusResponse } from '@shared/contracts';

import {
  pauseNovelAnalysis,
  restartNovelAnalysis,
  resumeNovelAnalysis,
  startNovelAnalysis,
} from '@application/use-cases/analysis';

import { useBookDetailAnalysisController } from '../useBookDetailAnalysisController';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@shared/debug', () => ({
  reportAppError: vi.fn(),
}));

vi.mock('@application/use-cases/analysis', () => ({
  pauseNovelAnalysis: vi.fn(),
  restartNovelAnalysis: vi.fn(),
  resumeNovelAnalysis: vi.fn(),
  startNovelAnalysis: vi.fn(),
}));

function createStatusResponse(
  overrides: Partial<AnalysisStatusResponse['job']> = {},
): AnalysisStatusResponse {
  return {
    chunks: [],
    job: {
      analysisComplete: false,
      analyzedChapters: 0,
      canPause: false,
      canRestart: false,
      canResume: false,
      canStart: true,
      completedAt: null,
      completedChunks: 0,
      currentChunk: null,
      currentChunkIndex: 0,
      currentStage: 'idle',
      lastError: '',
      lastHeartbeat: null,
      pauseRequested: false,
      progressPercent: 0,
      startedAt: null,
      status: 'idle',
      totalChapters: 0,
      totalChunks: 0,
      updatedAt: null,
      ...overrides,
    },
    overview: null,
  };
}

describe('useBookDetailAnalysisController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(startNovelAnalysis).mockResolvedValue(
      createStatusResponse({ canPause: true, canStart: false, currentStage: 'chapters', status: 'running' }),
    );
    vi.mocked(pauseNovelAnalysis).mockResolvedValue(
      createStatusResponse({ canPause: true, canStart: false, currentStage: 'chapters', status: 'pausing' }),
    );
    vi.mocked(resumeNovelAnalysis).mockResolvedValue(
      createStatusResponse({ canPause: true, canStart: false, currentStage: 'chapters', status: 'running' }),
    );
    vi.mocked(restartNovelAnalysis).mockResolvedValue(
      createStatusResponse({ canPause: true, canRestart: false, canStart: false, currentStage: 'chapters', status: 'running' }),
    );
  });

  it('dispatches start and exposes the started banner', async () => {
    const onStatusUpdated = vi.fn();
    const { result } = renderHook(() => useBookDetailAnalysisController({
      job: createStatusResponse().job,
      novelId: 1,
      onStatusUpdated,
    }));

    await act(async () => {
      result.current.primaryAction?.onClick();
    });

    await waitFor(() => {
      expect(startNovelAnalysis).toHaveBeenCalledWith(1);
    });

    expect(onStatusUpdated).toHaveBeenCalledWith(expect.objectContaining({
      job: expect.objectContaining({ status: 'running' }),
    }));
    expect(result.current.actionMessage).toBe('bookDetail.analysisActionStarted');
  });

  it('dispatches pause and resume from the computed primary action', async () => {
    const onStatusUpdated = vi.fn();
    const { result, rerender } = renderHook(
      ({ job }) => useBookDetailAnalysisController({ job, novelId: 1, onStatusUpdated }),
      {
        initialProps: {
          job: createStatusResponse({
            canPause: true,
            canStart: false,
            currentStage: 'chapters',
            status: 'running',
          }).job,
        },
      },
    );

    await act(async () => {
      result.current.primaryAction?.onClick();
    });

    expect(pauseNovelAnalysis).toHaveBeenCalledWith(1);
    expect(result.current.actionMessage).toBe('bookDetail.analysisActionPauseRequested');

    rerender({
      job: createStatusResponse({
        canRestart: true,
        canResume: true,
        canStart: false,
        currentStage: 'chapters',
        status: 'paused',
      }).job,
    });

    await act(async () => {
      result.current.primaryAction?.onClick();
    });

    expect(resumeNovelAnalysis).toHaveBeenCalledWith(1);
    expect(result.current.actionMessage).toBe('bookDetail.analysisActionResumed');
  });

  it('clears stale messages and disables actions while work is in flight', async () => {
    const onStatusUpdated = vi.fn();
    let resolveRestart: (value: AnalysisStatusResponse) => void;
    vi.mocked(restartNovelAnalysis).mockImplementation(
      () => new Promise((resolve) => {
        resolveRestart = resolve;
      }),
    );

    const { result } = renderHook(() => useBookDetailAnalysisController({
      job: createStatusResponse({
        canRestart: true,
        canResume: true,
        canStart: false,
        status: 'paused',
      }).job,
      novelId: 1,
      onStatusUpdated,
    }));

    act(() => {
      result.current.primaryAction?.onClick();
    });

    await waitFor(() => {
      expect(result.current.actionMessage).toBe('bookDetail.analysisActionResumed');
    });

    act(() => {
      result.current.restartAction?.onClick();
    });

    expect(result.current.actionMessage).toBeNull();
    expect(result.current.restartAction?.loading).toBe(true);
    expect(result.current.restartAction?.disabled).toBe(true);
    expect(result.current.primaryAction?.disabled).toBe(true);

    await act(async () => {
      resolveRestart!(createStatusResponse({
        canPause: true,
        canStart: false,
        currentStage: 'chapters',
        status: 'running',
      }));
    });

    expect(restartNovelAnalysis).toHaveBeenCalledWith(1);
    expect(result.current.actionMessage).toBe('bookDetail.analysisActionRestarted');
  });
});
