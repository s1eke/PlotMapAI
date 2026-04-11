import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeAnalysisConfig } from '../../services/types';
import { AnalysisErrorCode } from '../../services/errors';

const {
  mockBuildAnalysisChunks,
  mockRunAnalysisExecution,
  mockRunSingleChapterAnalysis,
} = vi.hoisted(() => ({
  mockBuildAnalysisChunks: vi.fn(),
  mockRunAnalysisExecution: vi.fn(),
  mockRunSingleChapterAnalysis: vi.fn(),
}));

vi.mock('../../services', async () => {
  const actual = await vi.importActual<typeof import('../../services')>('../../services');
  return {
    ...actual,
    buildAnalysisChunks: mockBuildAnalysisChunks,
    runSingleChapterAnalysis: mockRunSingleChapterAnalysis,
  };
});

vi.mock('../executor', () => ({
  runAnalysisExecution: mockRunAnalysisExecution,
}));

const runtimeConfig: RuntimeAnalysisConfig = {
  contextSize: 12000,
  providerConfig: {
    apiBaseUrl: 'http://127.0.0.1:5000',
    apiKey: 'token',
    modelName: 'gpt-test',
  },
  providerId: 'openai-compatible',
};

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createChapter(novelId: number, chapterIndex: number) {
  return {
    chapterIndex,
    content: `content ${chapterIndex + 1}`,
    id: chapterIndex + 1,
    novelId,
    title: `Chapter ${chapterIndex + 1}`,
    wordCount: 100,
  };
}

function createExecutionContext(novelId = 1, chapterCount = 2) {
  const chapters = Array.from(
    { length: chapterCount },
    (_, index) => createChapter(novelId, index),
  );
  mockBuildAnalysisChunks.mockReturnValue(
    chapters.map((chapter) => ({
      chapterIndices: [chapter.chapterIndex],
      chapters: [
        {
          chapterIndex: chapter.chapterIndex,
          content: chapter.content,
          length: 100,
          text: chapter.content,
          title: chapter.title,
        },
      ],
      chunkIndex: chapter.chapterIndex,
      contentLength: 100,
      endChapterIndex: chapter.chapterIndex,
      startChapterIndex: chapter.chapterIndex,
      text: chapter.content,
    })),
  );

  return {
    chapters,
    novelId,
    novelTitle: `Novel ${novelId}`,
    runtimeConfig,
  };
}

function createChunkRow(
  novelId: number,
  chunkIndex: number,
  chapterIndices: number[],
  status: 'pending' | 'running' | 'completed' | 'failed',
) {
  return {
    chapterIndices,
    chunkIndex,
    chunkSummary: status === 'completed' ? 'done' : '',
    endChapterIndex: chapterIndices[chapterIndices.length - 1],
    errorMessage: status === 'failed' ? 'failed' : '',
    novelId,
    startChapterIndex: chapterIndices[0],
    status,
    updatedAt: new Date().toISOString(),
  };
}

function createChapterAnalysisRow(novelId: number, chapterIndex: number, chunkIndex: number) {
  return {
    chapterIndex,
    chapterTitle: `Chapter ${chapterIndex + 1}`,
    characters: [],
    chunkIndex,
    keyPoints: ['point'],
    novelId,
    relationships: [],
    summary: 'summary',
    tags: ['tag'],
    updatedAt: new Date().toISOString(),
  };
}

function createOverviewRow(novelId: number, totalChapters: number) {
  return {
    analyzedChapters: totalChapters,
    bookIntro: 'intro',
    characterStats: [],
    globalSummary: 'summary',
    novelId,
    relationshipGraph: [],
    themes: ['theme'],
    totalChapters,
    updatedAt: new Date().toISOString(),
  };
}

describe('analysis runtime orchestrator', () => {
  let currentDb: typeof import('@infra/db').db;

  function setCurrentDb(nextDb: typeof import('@infra/db').db): void {
    currentDb = nextDb;
  }

  beforeEach(async () => {
    currentDb?.close();
    vi.resetModules();
    mockBuildAnalysisChunks.mockReset();
    mockRunAnalysisExecution.mockReset();
    mockRunSingleChapterAnalysis.mockReset();

    const dbModule = await import('@infra/db');
    const nextDb = dbModule.db;
    await nextDb.delete();
    await nextDb.open();
    setCurrentDb(nextDb);
    localStorage.clear();

    mockRunAnalysisExecution.mockResolvedValue(undefined);
    mockRunSingleChapterAnalysis.mockResolvedValue({
      chapterAnalyses: [],
      chunkSummary: 'one',
    });
  });

  async function loadRuntime() {
    return import('../orchestrator');
  }

  it('startAnalysis clears stale data, seeds chunks, and spawns one runner', async () => {
    const context = createExecutionContext();
    await currentDb.analysisChunks.add(createChunkRow(1, 99, [0], 'failed'));
    await currentDb.chapterAnalyses.add(createChapterAnalysisRow(1, 0, 99));
    await currentDb.analysisOverviews.add(createOverviewRow(1, 2));

    const runtime = await loadRuntime();
    const result = await runtime.startAnalysis(context);

    expect(result.job.status).toBe('running');
    expect(result.chunks).toHaveLength(2);
    expect(await currentDb.chapterAnalyses.count()).toBe(0);
    expect(await currentDb.analysisOverviews.count()).toBe(0);
    expect(mockRunAnalysisExecution).toHaveBeenCalledTimes(1);
    expect(mockRunAnalysisExecution).toHaveBeenCalledWith(expect.objectContaining({
      chapters: context.chapters,
      novelId: 1,
      novelTitle: 'Novel 1',
      runtimeConfig: expect.objectContaining({
        providerConfig: expect.objectContaining({
          apiBaseUrl: 'http://127.0.0.1:5000',
          modelName: 'gpt-test',
        }),
        providerId: 'openai-compatible',
      }),
    }));
  });

  it('pauseAnalysis marks pausing, aborts the active runner, and keeps completed work', async () => {
    const context = createExecutionContext();
    const deferred = createDeferred();
    const signals: AbortSignal[] = [];
    mockRunAnalysisExecution.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return deferred.promise;
    });

    const runtime = await loadRuntime();
    await runtime.startAnalysis(context);
    await currentDb.chapterAnalyses.add(createChapterAnalysisRow(1, 0, 0));

    const result = await runtime.pauseAnalysis(1);

    expect(result.job.status).toBe('pausing');
    expect(signals[0]?.aborted).toBe(true);
    expect(await currentDb.chapterAnalyses.count()).toBe(1);
    deferred.resolve();
  });

  it('resumeAnalysis resets failed, running, and incomplete completed chunks back to pending', async () => {
    const context = createExecutionContext(1, 4);
    await currentDb.analysisJobs.add({
      analyzedChapters: 1,
      completedAt: null,
      completedChunks: 1,
      currentChunkIndex: 1,
      lastError: 'previous failure',
      lastHeartbeat: null,
      novelId: 1,
      pauseRequested: false,
      startedAt: new Date().toISOString(),
      status: 'paused',
      totalChapters: 4,
      totalChunks: 4,
      updatedAt: new Date().toISOString(),
    });
    await currentDb.analysisChunks.bulkAdd([
      createChunkRow(1, 0, [0], 'completed'),
      createChunkRow(1, 1, [1], 'completed'),
      createChunkRow(1, 2, [2], 'failed'),
      createChunkRow(1, 3, [3], 'running'),
    ]);
    await currentDb.chapterAnalyses.add(createChapterAnalysisRow(1, 0, 0));

    const runtime = await loadRuntime();
    const result = await runtime.resumeAnalysis(context);
    const chunks = await currentDb.analysisChunks.where('novelId').equals(1).sortBy('chunkIndex');

    expect(result.job.status).toBe('running');
    expect(result.job.currentChunkIndex).toBe(1);
    expect(chunks.map((chunk) => chunk.status)).toEqual([
      'completed',
      'pending',
      'pending',
      'pending',
    ]);
    expect(mockRunAnalysisExecution).toHaveBeenCalledTimes(1);
  });

  it('restartAnalysis clears previous results and recreates the plan from scratch', async () => {
    const context = createExecutionContext();
    await currentDb.analysisJobs.add({
      analyzedChapters: 2,
      completedAt: null,
      completedChunks: 2,
      currentChunkIndex: 1,
      lastError: '',
      lastHeartbeat: null,
      novelId: 1,
      pauseRequested: false,
      startedAt: new Date().toISOString(),
      status: 'paused',
      totalChapters: 2,
      totalChunks: 2,
      updatedAt: new Date().toISOString(),
    });
    await currentDb.analysisChunks.bulkAdd([
      createChunkRow(1, 0, [0], 'completed'),
      createChunkRow(1, 1, [1], 'failed'),
    ]);
    await currentDb.chapterAnalyses.add(createChapterAnalysisRow(1, 0, 0));
    await currentDb.analysisOverviews.add(createOverviewRow(1, 2));

    const runtime = await loadRuntime();
    const result = await runtime.restartAnalysis(context);

    expect(result.job.status).toBe('running');
    expect(await currentDb.chapterAnalyses.count()).toBe(0);
    expect(await currentDb.analysisOverviews.count()).toBe(0);
    expect(
      (await currentDb.analysisChunks.where('novelId').equals(1).sortBy('chunkIndex'))
        .map((chunk) => chunk.status),
    ).toEqual(['pending', 'pending']);
  });

  it('refreshOverview clears only the overview and reuses completed chunk results', async () => {
    const context = createExecutionContext();
    await currentDb.analysisJobs.add({
      analyzedChapters: 2,
      completedAt: new Date().toISOString(),
      completedChunks: 2,
      currentChunkIndex: 1,
      lastError: '',
      lastHeartbeat: null,
      novelId: 1,
      pauseRequested: false,
      startedAt: new Date().toISOString(),
      status: 'completed',
      totalChapters: 2,
      totalChunks: 2,
      updatedAt: new Date().toISOString(),
    });
    await currentDb.analysisChunks.bulkAdd([
      createChunkRow(1, 0, [0], 'completed'),
      createChunkRow(1, 1, [1], 'completed'),
    ]);
    await currentDb.chapterAnalyses.bulkAdd([
      createChapterAnalysisRow(1, 0, 0),
      createChapterAnalysisRow(1, 1, 1),
    ]);
    await currentDb.analysisOverviews.add(createOverviewRow(1, 2));

    const runtime = await loadRuntime();
    const result = await runtime.refreshOverview(context);
    const chunks = await currentDb.analysisChunks.where('novelId').equals(1).sortBy('chunkIndex');

    expect(result.job.status).toBe('running');
    expect(result.job.currentStage).toBe('overview');
    expect(await currentDb.analysisOverviews.count()).toBe(0);
    expect(chunks.map((chunk) => chunk.status)).toEqual(['completed', 'completed']);
    expect(mockRunAnalysisExecution).toHaveBeenCalledTimes(1);
  });

  it('initializeAnalysisRuntime pauses interrupted jobs and resets running chunks', async () => {
    await currentDb.analysisJobs.bulkAdd([
      {
        analyzedChapters: 0,
        completedAt: null,
        completedChunks: 0,
        currentChunkIndex: 0,
        lastError: '',
        lastHeartbeat: null,
        novelId: 1,
        pauseRequested: true,
        startedAt: new Date().toISOString(),
        status: 'running',
        totalChapters: 2,
        totalChunks: 2,
        updatedAt: new Date().toISOString(),
      },
      {
        analyzedChapters: 0,
        completedAt: null,
        completedChunks: 0,
        currentChunkIndex: 0,
        lastError: '',
        lastHeartbeat: null,
        novelId: 2,
        pauseRequested: true,
        startedAt: new Date().toISOString(),
        status: 'pausing',
        totalChapters: 1,
        totalChunks: 1,
        updatedAt: new Date().toISOString(),
      },
    ]);
    await currentDb.analysisChunks.bulkAdd([
      createChunkRow(1, 0, [0], 'running'),
      createChunkRow(2, 0, [0], 'running'),
    ]);

    const runtime = await loadRuntime();
    await runtime.initializeAnalysisRuntime();

    const jobs = await currentDb.analysisJobs.orderBy('novelId').toArray();
    const chunks = await currentDb.analysisChunks.orderBy('novelId').toArray();

    expect(jobs.map((job) => job.status)).toEqual(['paused', 'paused']);
    expect(jobs.map((job) => job.lastError)).toEqual([
      AnalysisErrorCode.APP_RESTARTED,
      AnalysisErrorCode.APP_RESTARTED,
    ]);
    expect(chunks.map((chunk) => chunk.status)).toEqual(['pending', 'pending']);
  });

  it('does not let an old runner finally remove a newer resumed runner', async () => {
    const context = createExecutionContext();
    const deferredRuns: Array<{ resolve: () => void; signal: AbortSignal }> = [];
    mockRunAnalysisExecution.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      const deferred = createDeferred();
      deferredRuns.push({ resolve: deferred.resolve, signal });
      return deferred.promise;
    });

    const runtime = await loadRuntime();
    await runtime.startAnalysis(context);
    await runtime.pauseAnalysis(1);
    await currentDb.analysisJobs.where('novelId').equals(1).modify({
      pauseRequested: false,
      status: 'paused',
      updatedAt: new Date().toISOString(),
    });

    await runtime.resumeAnalysis(context);
    deferredRuns[0].resolve();
    await Promise.resolve();
    await Promise.resolve();

    await runtime.pauseAnalysis(1);

    expect(deferredRuns[1]?.signal.aborted).toBe(true);
  });
});
