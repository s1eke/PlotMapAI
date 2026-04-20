import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectNovelText } from '@application/read-models/novel-text-projection';
import { analysisService, buildRuntimeAnalysisConfig } from '@domains/analysis';
import { novelRepository } from '@domains/library';
import { getAiConfig } from '@domains/settings';

import { startNovelAnalysis } from '../analysis';

vi.mock('@domains/analysis', () => ({
  analysisService: {
    start: vi.fn(),
  },
  buildRuntimeAnalysisConfig: vi.fn(),
}));

vi.mock('@domains/library', () => ({
  novelRepository: {
    get: vi.fn(),
  },
}));

vi.mock('@application/read-models/novel-text-projection', () => ({
  projectNovelText: vi.fn(),
}));

vi.mock('@domains/settings', () => ({
  getAiConfig: vi.fn(),
}));

describe('application analysis use-cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAiConfig).mockResolvedValue({
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'token',
      contextSize: 32000,
      modelName: 'gpt-test',
      providerId: 'openai-compatible',
    });
    vi.mocked(novelRepository.get).mockResolvedValue({
      author: '',
      createdAt: new Date().toISOString(),
      description: '',
      fileType: 'txt',
      hasCover: false,
      id: 1,
      originalEncoding: 'utf-8',
      originalFilename: 'novel.txt',
      tags: [],
      title: 'Mock Novel',
      totalWords: 100,
    });
    vi.mocked(projectNovelText).mockResolvedValue([
      {
        chapterIndex: 0,
        content: 'chapter content',
        id: 1,
        novelId: 1,
        title: 'Chapter 1',
        wordCount: 14,
      },
    ]);
    vi.mocked(buildRuntimeAnalysisConfig).mockReturnValue({
      contextSize: 32000,
      providerConfig: {
        apiBaseUrl: 'http://localhost:5000',
        apiKey: 'token',
        modelName: 'gpt-test',
      },
      providerId: 'openai-compatible',
    });
    vi.mocked(analysisService.start).mockResolvedValue({
      chunks: [],
      job: {
        analysisComplete: false,
        analyzedChapters: 0,
        canPause: true,
        canRestart: false,
        canResume: false,
        canStart: false,
        completedAt: null,
        completedChunks: 0,
        currentChunk: null,
        currentChunkIndex: 0,
        currentStage: 'chapters',
        lastError: '',
        lastHeartbeat: null,
        pauseRequested: false,
        progressPercent: 0,
        startedAt: null,
        status: 'running',
        totalChapters: 1,
        totalChunks: 1,
        updatedAt: null,
      },
      overview: null,
    });
  });

  it('startNovelAnalysis loads ai config, projected chapters, and novel metadata before delegating', async () => {
    await startNovelAnalysis(1);

    expect(buildRuntimeAnalysisConfig).toHaveBeenCalledWith({
      contextSize: 32000,
      providerId: 'openai-compatible',
      providerConfig: {
        apiBaseUrl: 'http://localhost:5000',
        apiKey: 'token',
        modelName: 'gpt-test',
      },
    });
    expect(analysisService.start).toHaveBeenCalledWith({
      chapters: [
        {
          chapterIndex: 0,
          content: 'chapter content',
          id: 1,
          novelId: 1,
          title: 'Chapter 1',
          wordCount: 14,
        },
      ],
      novelId: 1,
      novelTitle: 'Mock Novel',
      runtimeConfig: {
        contextSize: 32000,
        providerConfig: {
          apiBaseUrl: 'http://localhost:5000',
          apiKey: 'token',
          modelName: 'gpt-test',
        },
        providerId: 'openai-compatible',
      },
    });
  });
});
