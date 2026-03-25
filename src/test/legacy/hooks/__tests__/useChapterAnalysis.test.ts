import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChapterAnalysis } from '../useChapterAnalysis';
import { analysisApi } from '../../api/analysis';
import type { AnalysisStatusResponse, ChapterAnalysisResult } from '../../api/analysis';

vi.mock('../../api/analysis', () => ({
  analysisApi: {
    getStatus: vi.fn(),
    getChapterAnalysis: vi.fn(),
    analyzeChapter: vi.fn(),
  },
}));

const mockedApi = vi.mocked(analysisApi);

const idleStatus: AnalysisStatusResponse = {
  job: {
    status: 'idle',
    currentStage: 'idle',
    analysisComplete: false,
    totalChapters: 2,
    analyzedChapters: 0,
    totalChunks: 1,
    completedChunks: 0,
    currentChunkIndex: 0,
    progressPercent: 0,
    pauseRequested: false,
    lastError: '',
    startedAt: null,
    completedAt: null,
    lastHeartbeat: null,
    updatedAt: null,
    currentChunk: null,
    canStart: true,
    canPause: false,
    canResume: false,
    canRestart: false,
  },
  overview: null,
  chunks: [],
};

const runningStatus: AnalysisStatusResponse = {
  ...idleStatus,
  job: { ...idleStatus.job, status: 'running', canPause: true, canStart: false },
};

const chapterAnalysisResult: ChapterAnalysisResult = {
  chapterIndex: 0,
  chapterTitle: 'Chapter 1',
  summary: 'A great summary',
  keyPoints: ['point1', 'point2'],
  characters: [{ name: 'Hero', role: 'Lead', description: 'Main character', weight: 90 }],
  relationships: [],
  tags: ['action'],
  chunkIndex: 0,
  updatedAt: null,
};

describe('useChapterAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockedApi.getStatus.mockResolvedValue(idleStatus);
    mockedApi.getChapterAnalysis.mockResolvedValue({ analysis: null });
    mockedApi.analyzeChapter.mockResolvedValue({ analysis: null });
  });

  it('does not fetch when novelId is 0', async () => {
    renderHook(() => useChapterAnalysis(0, 0));
    await waitFor(() => {
      expect(mockedApi.getStatus).not.toHaveBeenCalled();
    });
  });

  it('loads analysis status on mount', async () => {
    renderHook(() => useChapterAnalysis(1, 0));
    await waitFor(() => {
      expect(mockedApi.getStatus).toHaveBeenCalledWith(1);
    });
  });

  it('loads chapter analysis on mount', async () => {
    renderHook(() => useChapterAnalysis(1, 0));
    await waitFor(() => {
      expect(mockedApi.getChapterAnalysis).toHaveBeenCalledWith(1, 0);
    });
  });

  it('exposes chapterAnalysis from getChapterAnalysis response', async () => {
    mockedApi.getChapterAnalysis.mockResolvedValue({ analysis: chapterAnalysisResult });
    const { result } = renderHook(() => useChapterAnalysis(1, 0));

    await waitFor(() => {
      expect(result.current.chapterAnalysis).toEqual(chapterAnalysisResult);
    });
  });

  it('calls analyzeChapter on handleAnalyzeChapter', async () => {
    mockedApi.analyzeChapter.mockResolvedValue({ analysis: chapterAnalysisResult });
    const { result } = renderHook(() => useChapterAnalysis(1, 0));

    await waitFor(() => {
      expect(result.current.isChapterAnalysisLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleAnalyzeChapter();
    });

    expect(mockedApi.analyzeChapter).toHaveBeenCalledWith(1, 0);
    expect(result.current.chapterAnalysis).toEqual(chapterAnalysisResult);
    expect(result.current.isAnalyzingChapter).toBe(false);
  });

  it('sets isAnalyzingChapter during analyzeChapter call', async () => {
    let resolveAnalyze: (value: { analysis: ChapterAnalysisResult | null }) => void;
    mockedApi.analyzeChapter.mockImplementation(
      () => new Promise(resolve => { resolveAnalyze = resolve; })
    );

    const { result } = renderHook(() => useChapterAnalysis(1, 0));

    await waitFor(() => {
      expect(result.current.isChapterAnalysisLoading).toBe(false);
    });

    act(() => { result.current.handleAnalyzeChapter(); });
    expect(result.current.isAnalyzingChapter).toBe(true);

    await act(async () => {
      resolveAnalyze!({ analysis: chapterAnalysisResult });
    });
    expect(result.current.isAnalyzingChapter).toBe(false);
  });

  it('does not call handleAnalyzeChapter when novelId is 0', async () => {
    const { result } = renderHook(() => useChapterAnalysis(0, 0));
    await act(async () => {
      await result.current.handleAnalyzeChapter();
    });
    expect(mockedApi.analyzeChapter).not.toHaveBeenCalled();
  });

  it('polls when job status is running', async () => {
    mockedApi.getStatus.mockResolvedValue(runningStatus);
    mockedApi.getChapterAnalysis.mockResolvedValue({ analysis: chapterAnalysisResult });

    renderHook(() => useChapterAnalysis(1, 0));

    // Wait for initial status to resolve and polling interval to be set up
    await waitFor(() => {
      expect(mockedApi.getStatus).toHaveBeenCalledTimes(1);
    });

    // The hook polls every 3 seconds. Wait for the polling to fire.
    // Using a longer timeout to account for the 3s interval.
    await waitFor(() => {
      expect(mockedApi.getStatus.mock.calls.length).toBeGreaterThan(1);
    }, { timeout: 5000 });
  });

  it('does not poll when job status is idle', async () => {
    mockedApi.getStatus.mockResolvedValue(idleStatus);

    vi.useFakeTimers();

    renderHook(() => useChapterAnalysis(1, 0));

    await vi.runAllTimersAsync();
    const statusCalls = mockedApi.getStatus.mock.calls.length;

    await vi.advanceTimersByTimeAsync(10000);
    expect(mockedApi.getStatus.mock.calls.length).toBe(statusCalls);

    vi.useRealTimers();
  });

  it('sets analysisStatus to null on getStatus error', async () => {
    mockedApi.getStatus.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useChapterAnalysis(1, 0));

    await waitFor(() => {
      expect(result.current.analysisStatus).toBeNull();
    });
  });

  it('sets chapterAnalysis to null on getChapterAnalysis error', async () => {
    mockedApi.getChapterAnalysis.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useChapterAnalysis(1, 0));

    await waitFor(() => {
      expect(result.current.chapterAnalysis).toBeNull();
    });
  });

  it('re-fetches when chapterIndex changes', async () => {
    const { rerender } = renderHook(
      ({ idx }) => useChapterAnalysis(1, idx),
      { initialProps: { idx: 0 } }
    );

    await waitFor(() => {
      expect(mockedApi.getChapterAnalysis).toHaveBeenCalledWith(1, 0);
    });

    rerender({ idx: 1 });

    await waitFor(() => {
      expect(mockedApi.getChapterAnalysis).toHaveBeenCalledWith(1, 1);
    });
  });

  it('reuses cached chapter analysis when toggling away from and back to the same chapter', async () => {
    mockedApi.getChapterAnalysis.mockResolvedValue({ analysis: chapterAnalysisResult });

    const { rerender, result } = renderHook(
      ({ idx }) => useChapterAnalysis(1, idx),
      { initialProps: { idx: -1 } },
    );

    rerender({ idx: 0 });

    await waitFor(() => {
      expect(result.current.chapterAnalysis).toEqual(chapterAnalysisResult);
    });
    expect(mockedApi.getChapterAnalysis).toHaveBeenCalledTimes(1);

    rerender({ idx: -1 });
    rerender({ idx: 0 });

    await waitFor(() => {
      expect(result.current.chapterAnalysis).toEqual(chapterAnalysisResult);
    });
    expect(mockedApi.getChapterAnalysis).toHaveBeenCalledTimes(1);
  });
});
