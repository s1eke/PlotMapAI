import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisErrorCode } from '../analysis/errors';

const {
  mockBuildAnalysisChunks,
  mockGetAiConfig,
  mockLoadAndPurifyChapters,
  mockRunAnalysisExecution,
  mockRunSingleChapterAnalysis,
} = vi.hoisted(() => ({
  mockBuildAnalysisChunks: vi.fn(),
  mockGetAiConfig: vi.fn(),
  mockLoadAndPurifyChapters: vi.fn(),
  mockRunAnalysisExecution: vi.fn(),
  mockRunSingleChapterAnalysis: vi.fn(),
}));

vi.mock('../../api/reader', () => ({
  loadAndPurifyChapters: mockLoadAndPurifyChapters,
}));

vi.mock('../../api/settings/aiConfig', () => ({
  getAiConfig: mockGetAiConfig,
}));

vi.mock('../analysis', async () => {
  const actual = await vi.importActual<typeof import('../analysis')>('../analysis');
  return {
    ...actual,
    buildAnalysisChunks: mockBuildAnalysisChunks,
    runSingleChapterAnalysis: mockRunSingleChapterAnalysis,
  };
});

vi.mock('../analysis-runtime/executor', () => ({
  runAnalysisExecution: mockRunAnalysisExecution,
}));

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function createNovel(id = 1) {
  return {
    id,
    title: `Novel ${id}`,
    author: 'Author',
    description: '',
    tags: [],
    fileType: 'txt',
    fileHash: `hash-${id}`,
    coverPath: '',
    originalFilename: `novel-${id}.txt`,
    originalEncoding: 'utf-8',
    totalWords: 1000,
    createdAt: new Date().toISOString(),
  };
}

function createChapter(novelId: number, chapterIndex: number) {
  return {
    id: chapterIndex + 1,
    novelId,
    title: `Chapter ${chapterIndex + 1}`,
    content: `content ${chapterIndex + 1}`,
    chapterIndex,
    wordCount: 100,
  };
}

function createChunkPayload(index: number, chapterIndices: number[]) {
  return {
    chunkIndex: index,
    chapterIndices,
    startChapterIndex: chapterIndices[0],
    endChapterIndex: chapterIndices[chapterIndices.length - 1],
    contentLength: 100,
    chapters: chapterIndices.map(chapterIndex => ({
      chapterIndex,
      title: `Chapter ${chapterIndex + 1}`,
      content: `content ${chapterIndex + 1}`,
      text: `content ${chapterIndex + 1}`,
      length: 100,
    })),
    text: chapterIndices.map(chapterIndex => `content ${chapterIndex + 1}`).join('\n'),
  };
}

function createChunkRow(
  novelId: number,
  chunkIndex: number,
  chapterIndices: number[],
  status: 'pending' | 'running' | 'completed' | 'failed',
) {
  return {
    id: undefined as unknown as number,
    novelId,
    chunkIndex,
    startChapterIndex: chapterIndices[0],
    endChapterIndex: chapterIndices[chapterIndices.length - 1],
    chapterIndices,
    status,
    chunkSummary: status === 'completed' ? 'done' : '',
    errorMessage: status === 'failed' ? 'failed' : '',
    updatedAt: new Date().toISOString(),
  };
}

function createChapterAnalysisRow(novelId: number, chapterIndex: number, chunkIndex: number) {
  return {
    id: undefined as unknown as number,
    novelId,
    chapterIndex,
    chapterTitle: `Chapter ${chapterIndex + 1}`,
    summary: 'summary',
    keyPoints: ['point'],
    characters: [],
    relationships: [],
    tags: ['tag'],
    chunkIndex,
    updatedAt: new Date().toISOString(),
  };
}

function createOverviewRow(novelId: number, totalChapters: number) {
  return {
    id: undefined as unknown as number,
    novelId,
    bookIntro: 'intro',
    globalSummary: 'summary',
    themes: ['theme'],
    characterStats: [],
    relationshipGraph: [],
    totalChapters,
    analyzedChapters: totalChapters,
    updatedAt: new Date().toISOString(),
  };
}

describe('analysis runtime orchestrator', () => {
  let currentDb: typeof import('../db').db;

  beforeEach(async () => {
    currentDb?.close();
    vi.resetModules();
    mockGetAiConfig.mockReset();
    mockLoadAndPurifyChapters.mockReset();
    mockBuildAnalysisChunks.mockReset();
    mockRunAnalysisExecution.mockReset();
    mockRunSingleChapterAnalysis.mockReset();

    currentDb = (await import('../db')).db;
    await currentDb.delete();
    await currentDb.open();
    localStorage.clear();

    mockGetAiConfig.mockResolvedValue({
      apiBaseUrl: 'http://127.0.0.1:5000',
      apiKey: 'token',
      modelName: 'gpt-test',
      contextSize: 12000,
    });
    mockRunAnalysisExecution.mockResolvedValue(undefined);
    mockRunSingleChapterAnalysis.mockResolvedValue({ chunkSummary: 'one', chapterAnalyses: [] });
  });

  async function loadRuntime() {
    return import('../analysis-runtime/orchestrator');
  }

  async function seedNovelAndChapters(novelId = 1, chapterCount = 2) {
    await currentDb.novels.add(createNovel(novelId));
    const chapters = Array.from({ length: chapterCount }, (_, index) => createChapter(novelId, index));
    await currentDb.chapters.bulkAdd(chapters);
    mockLoadAndPurifyChapters.mockResolvedValue(chapters);
    mockBuildAnalysisChunks.mockReturnValue(
      chapters.map(chapter => createChunkPayload(chapter.chapterIndex, [chapter.chapterIndex])),
    );
    return chapters;
  }

  it('startAnalysis clears stale data, seeds chunks, and spawns one runner', async () => {
    await seedNovelAndChapters();
    await currentDb.analysisChunks.add(createChunkRow(1, 99, [0], 'failed'));
    await currentDb.chapterAnalyses.add(createChapterAnalysisRow(1, 0, 99));
    await currentDb.analysisOverviews.add(createOverviewRow(1, 2));

    const runtime = await loadRuntime();
    const result = await runtime.startAnalysis(1);

    expect(result.job.status).toBe('running');
    expect(result.chunks).toHaveLength(2);
    expect(await currentDb.chapterAnalyses.count()).toBe(0);
    expect(await currentDb.analysisOverviews.count()).toBe(0);
    expect(mockRunAnalysisExecution).toHaveBeenCalledTimes(1);
  });

  it('pauseAnalysis marks pausing, aborts the active runner, and keeps completed work', async () => {
    await seedNovelAndChapters();
    const deferred = createDeferred();
    const signals: AbortSignal[] = [];
    mockRunAnalysisExecution.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return deferred.promise;
    });

    const runtime = await loadRuntime();
    await runtime.startAnalysis(1);
    await currentDb.chapterAnalyses.add(createChapterAnalysisRow(1, 0, 0));

    const result = await runtime.pauseAnalysis(1);

    expect(result.job.status).toBe('pausing');
    expect(signals[0]?.aborted).toBe(true);
    expect(await currentDb.chapterAnalyses.count()).toBe(1);
    deferred.resolve();
  });

  it('resumeAnalysis resets failed, running, and incomplete completed chunks back to pending', async () => {
    await seedNovelAndChapters(1, 4);
    await currentDb.analysisJobs.add({
      id: undefined as unknown as number,
      novelId: 1,
      status: 'paused',
      totalChapters: 4,
      analyzedChapters: 1,
      totalChunks: 4,
      completedChunks: 1,
      currentChunkIndex: 1,
      pauseRequested: false,
      lastError: 'previous failure',
      startedAt: new Date().toISOString(),
      completedAt: null,
      lastHeartbeat: null,
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
    const result = await runtime.resumeAnalysis(1);
    const chunks = await currentDb.analysisChunks.where('novelId').equals(1).sortBy('chunkIndex');

    expect(result.job.status).toBe('running');
    expect(result.job.currentChunkIndex).toBe(1);
    expect(chunks.map(chunk => chunk.status)).toEqual(['completed', 'pending', 'pending', 'pending']);
    expect(mockRunAnalysisExecution).toHaveBeenCalledTimes(1);
  });

  it('restartAnalysis clears previous results and recreates the plan from scratch', async () => {
    await seedNovelAndChapters();
    await currentDb.analysisJobs.add({
      id: undefined as unknown as number,
      novelId: 1,
      status: 'paused',
      totalChapters: 2,
      analyzedChapters: 2,
      totalChunks: 2,
      completedChunks: 2,
      currentChunkIndex: 1,
      pauseRequested: false,
      lastError: '',
      startedAt: new Date().toISOString(),
      completedAt: null,
      lastHeartbeat: null,
      updatedAt: new Date().toISOString(),
    });
    await currentDb.analysisChunks.bulkAdd([
      createChunkRow(1, 0, [0], 'completed'),
      createChunkRow(1, 1, [1], 'failed'),
    ]);
    await currentDb.chapterAnalyses.add(createChapterAnalysisRow(1, 0, 0));
    await currentDb.analysisOverviews.add(createOverviewRow(1, 2));

    const runtime = await loadRuntime();
    const result = await runtime.restartAnalysis(1);

    expect(result.job.status).toBe('running');
    expect(await currentDb.chapterAnalyses.count()).toBe(0);
    expect(await currentDb.analysisOverviews.count()).toBe(0);
    expect((await currentDb.analysisChunks.where('novelId').equals(1).sortBy('chunkIndex')).map(chunk => chunk.status)).toEqual(['pending', 'pending']);
  });

  it('refreshOverview clears only the overview and reuses completed chunk results', async () => {
    await seedNovelAndChapters();
    await currentDb.analysisJobs.add({
      id: undefined as unknown as number,
      novelId: 1,
      status: 'completed',
      totalChapters: 2,
      analyzedChapters: 2,
      totalChunks: 2,
      completedChunks: 2,
      currentChunkIndex: 1,
      pauseRequested: false,
      lastError: '',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      lastHeartbeat: null,
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
    const result = await runtime.refreshOverview(1);
    const chunks = await currentDb.analysisChunks.where('novelId').equals(1).sortBy('chunkIndex');

    expect(result.job.status).toBe('running');
    expect(result.job.currentStage).toBe('overview');
    expect(await currentDb.analysisOverviews.count()).toBe(0);
    expect(chunks.map(chunk => chunk.status)).toEqual(['completed', 'completed']);
    expect(mockRunAnalysisExecution).toHaveBeenCalledTimes(1);
  });

  it('initializeAnalysisRuntime pauses interrupted jobs and resets running chunks', async () => {
    await seedNovelAndChapters();
    await currentDb.analysisJobs.bulkAdd([
      {
        id: undefined as unknown as number,
        novelId: 1,
        status: 'running',
        totalChapters: 2,
        analyzedChapters: 0,
        totalChunks: 2,
        completedChunks: 0,
        currentChunkIndex: 0,
        pauseRequested: true,
        lastError: '',
        startedAt: new Date().toISOString(),
        completedAt: null,
        lastHeartbeat: null,
        updatedAt: new Date().toISOString(),
      },
      {
        id: undefined as unknown as number,
        novelId: 2,
        status: 'pausing',
        totalChapters: 1,
        analyzedChapters: 0,
        totalChunks: 1,
        completedChunks: 0,
        currentChunkIndex: 0,
        pauseRequested: true,
        lastError: '',
        startedAt: new Date().toISOString(),
        completedAt: null,
        lastHeartbeat: null,
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

    expect(jobs.map(job => job.status)).toEqual(['paused', 'paused']);
    expect(jobs.map(job => job.lastError)).toEqual([AnalysisErrorCode.APP_RESTARTED, AnalysisErrorCode.APP_RESTARTED]);
    expect(chunks.map(chunk => chunk.status)).toEqual(['pending', 'pending']);
  });

  it('does not let an old runner finally remove a newer resumed runner', async () => {
    await seedNovelAndChapters();
    const deferredRuns: Array<{ signal: AbortSignal; resolve: () => void }> = [];
    mockRunAnalysisExecution.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      const deferred = createDeferred();
      deferredRuns.push({ signal, resolve: deferred.resolve });
      return deferred.promise;
    });

    const runtime = await loadRuntime();
    await runtime.startAnalysis(1);
    await runtime.pauseAnalysis(1);
    await currentDb.analysisJobs.where('novelId').equals(1).modify({
      status: 'paused',
      pauseRequested: false,
      updatedAt: new Date().toISOString(),
    });

    await runtime.resumeAnalysis(1);
    deferredRuns[0].resolve();
    await Promise.resolve();
    await Promise.resolve();

    await runtime.pauseAnalysis(1);
    expect(deferredRuns[1]?.signal.aborted).toBe(true);
  });
});
