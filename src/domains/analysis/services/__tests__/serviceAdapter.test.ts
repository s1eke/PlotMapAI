import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisExecutionError } from '../errors';
import {
  runChunkAnalysis,
  runOverviewAnalysis,
  runSingleChapterAnalysis,
} from '../service';
import type { RuntimeAnalysisConfig } from '../types';

const mockGenerateText = vi.fn();

vi.mock('../../providers', () => ({
  resolveAnalysisProviderAdapter: vi.fn(() => ({
    generateText: mockGenerateText,
    testConnection: vi.fn(),
  })),
}));

const CONFIG: RuntimeAnalysisConfig = {
  providerId: 'openai-compatible',
  contextSize: 32000,
  providerConfig: {
    apiBaseUrl: 'http://localhost:5000',
    apiKey: 'token',
    modelName: 'gpt-test',
  },
};

describe('analysis service provider adapter integration', () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it('uses the provider adapter for chunk analysis and preserves prompt-level settings', async () => {
    const signal = new AbortController().signal;
    mockGenerateText.mockResolvedValue('```json\n'
      + '{"chunkSummary":"chunk","chapterAnalyses":[{"chapterIndex":0,"title":"第一章","summary":"剧情推进","keyPoints":["开场"],"tags":["成长"],"characters":[],"relationships":[]}]}\n'
      + '```');

    const result = await runChunkAnalysis(CONFIG, '测试小说', {
      chunkIndex: 0,
      chapterIndices: [0],
      startChapterIndex: 0,
      endChapterIndex: 0,
      contentLength: 100,
      chapters: [{
        chapterIndex: 0,
        title: '第一章',
        content: '内容',
        text: '内容',
        length: 100,
      }],
      text: '内容',
    }, 1, signal);

    expect(result.chapterAnalyses[0].summary).toBe('剧情推进');
    expect(mockGenerateText).toHaveBeenCalledWith(
      CONFIG.providerConfig,
      expect.objectContaining({
        maxOutputTokens: expect.any(Number),
        systemPrompt: expect.stringContaining('只返回 JSON 对象'),
        temperature: 0.2,
        userPrompt: expect.stringContaining('请分析小说《测试小说》'),
      }),
      signal,
    );
  });

  it('retries provider failures and still returns normalized single-chapter output', async () => {
    mockGenerateText
      .mockRejectedValueOnce(new AnalysisExecutionError('temporary'))
      .mockResolvedValueOnce('{"chapterAnalyses":[{"chapterIndex":0,"title":"第一章","summary":"单章总结","keyPoints":["冲突"],"tags":["冒险"],"characters":[],"relationships":[]}]}');

    const result = await runSingleChapterAnalysis(CONFIG, '测试小说', {
      chapterIndex: 0,
      title: '第一章',
      content: '内容',
    });

    expect(result.chapterAnalyses[0].summary).toBe('单章总结');
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it('uses the provider adapter for overview analysis and keeps overview normalization', async () => {
    const signal = new AbortController().signal;
    mockGenerateText.mockResolvedValue('{"bookIntro":"导读","globalSummary":"完整概览","themes":["成长"],"characterStats":[{"name":"主角","role":"核心主角","description":"推动主线","sharePercent":100}],"relationshipGraph":[{"source":"主角","target":"伙伴","relationTags":["同伴"],"description":"共同冒险"}]}');

    const result = await runOverviewAnalysis(
      CONFIG,
      '测试小说',
      [{
        id: 1,
        novelId: 1,
        chapterIndex: 0,
        chapterTitle: '第一章',
        summary: '章节总结',
        keyPoints: ['开场'],
        characters: [
          { name: '主角', role: '核心主角', description: '推动主线', weight: 100 },
          { name: '伙伴', role: '同伴', description: '重要配角', weight: 80 },
        ],
        relationships: [
          { source: '主角', target: '伙伴', type: '同伴', description: '共同冒险', weight: 90 },
        ],
        tags: ['成长'],
        chunkIndex: 0,
        updatedAt: new Date().toISOString(),
      }],
      1,
      signal,
    );

    expect(result.bookIntro).toBe('导读');
    expect(result.relationshipGraph[0]?.source).toBe('主角');
    expect(mockGenerateText).toHaveBeenCalledWith(
      CONFIG.providerConfig,
      expect.objectContaining({
        userPrompt: expect.stringContaining('全部分析数据如下'),
      }),
      signal,
    );
  });

  it('does not retry after the caller aborts the analysis request', async () => {
    const controller = new AbortController();
    mockGenerateText.mockImplementation(async () => {
      controller.abort();
      throw new AnalysisExecutionError('AI 请求已取消。', {
        retryable: false,
        userVisible: false,
      });
    });

    await expect(runChunkAnalysis(CONFIG, '测试小说', {
      chunkIndex: 0,
      chapterIndices: [0],
      startChapterIndex: 0,
      endChapterIndex: 0,
      contentLength: 100,
      chapters: [{
        chapterIndex: 0,
        title: '第一章',
        content: '内容',
        text: '内容',
        length: 100,
      }],
      text: '内容',
    }, 1, controller.signal)).rejects.toMatchObject({
      message: 'AI 请求已取消。',
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });
});
