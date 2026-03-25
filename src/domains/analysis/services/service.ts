import { AppErrorCode } from '@shared/errors';
import type { ChapterAnalysis } from '@infra/db';
import { resolveAnalysisProviderAdapter } from '../providers';
import { ANALYSIS_RETRY_LIMIT, LLM_MAX_OUTPUT_TOKENS } from './constants';
import { AnalysisExecutionError } from './errors';
import { collectAnalysisAggregates } from './aggregates';
import { extractJsonObject } from './client';
import { buildAnalysisChunks } from './chunking';
import { normalizeChunkResult, normalizeOverviewResult, normalizeSingleChapterResult } from './parsers';
import { buildChunkPrompt, buildOverviewPrompt, buildSingleChapterPrompt } from './prompts';
import type { AnalysisChunkPayload, ChunkAnalysisResult, OverviewAnalysisResult, PromptChapter, RuntimeAnalysisConfig } from './types';

const CHAPTER_ANALYZER_SYSTEM_PROMPT =
  '你是一个严谨的小说结构分析器。你必须只返回 JSON 对象，不允许返回 markdown、解释文本或多余前后缀。';
const OVERVIEW_ANALYZER_SYSTEM_PROMPT =
  '你是一个严谨的小说全书分析器。你必须只返回 JSON 对象，不允许返回 markdown、解释文本或多余前后缀。';

export { buildAnalysisChunks };

export async function runChunkAnalysis(
  config: RuntimeAnalysisConfig,
  novelTitle: string,
  chunk: AnalysisChunkPayload,
  totalChunks: number,
): Promise<ChunkAnalysisResult> {
  const prompt = buildChunkPrompt(novelTitle, chunk, totalChunks);
  const request = {
    systemPrompt: CHAPTER_ANALYZER_SYSTEM_PROMPT,
    userPrompt: prompt,
    temperature: 0.2,
    maxOutputTokens: LLM_MAX_OUTPUT_TOKENS,
  };
  return runAnalysisWithRetry(
    `第 ${chunk.chunkIndex + 1} 块章节分析`,
    async () => {
      const content = await resolveAnalysisProviderAdapter(config.providerId)
        .generateText(config.providerConfig, request);
      return normalizeChunkResult(extractJsonObject(content), chunk);
    },
  );
}

export async function runSingleChapterAnalysis(
  config: RuntimeAnalysisConfig,
  novelTitle: string,
  chapter: PromptChapter,
): Promise<ChunkAnalysisResult> {
  const prompt = buildSingleChapterPrompt(novelTitle, chapter);
  const request = {
    systemPrompt: CHAPTER_ANALYZER_SYSTEM_PROMPT,
    userPrompt: prompt,
    temperature: 0.2,
    maxOutputTokens: LLM_MAX_OUTPUT_TOKENS,
  };
  return runAnalysisWithRetry(
    `第 ${chapter.chapterIndex + 1} 章单章分析`,
    async () => {
      const content = await resolveAnalysisProviderAdapter(config.providerId)
        .generateText(config.providerConfig, request);
      return normalizeSingleChapterResult(extractJsonObject(content), chapter);
    },
  );
}

export async function runOverviewAnalysis(
  config: RuntimeAnalysisConfig,
  novelTitle: string,
  chapterRows: ChapterAnalysis[],
  totalChapters: number,
): Promise<OverviewAnalysisResult> {
  if (chapterRows.length < totalChapters) {
    throw new AnalysisExecutionError('章节分析尚未全部完成，无法生成全书概览。', {
      code: AppErrorCode.CHAPTERS_INCOMPLETE,
      userMessageKey: 'errors.CHAPTERS_INCOMPLETE',
    });
  }
  const aggregates = collectAnalysisAggregates(chapterRows);
  const prompt = buildOverviewPrompt(novelTitle, aggregates, totalChapters, config.contextSize);
  const request = {
    systemPrompt: OVERVIEW_ANALYZER_SYSTEM_PROMPT,
    userPrompt: prompt,
    temperature: 0.2,
    maxOutputTokens: LLM_MAX_OUTPUT_TOKENS,
  };
  return runAnalysisWithRetry(
    '全书概览分析',
    async () => {
      const content = await resolveAnalysisProviderAdapter(config.providerId)
        .generateText(config.providerConfig, request);
      return normalizeOverviewResult(extractJsonObject(content), aggregates, totalChapters);
    },
  );
}

async function runAnalysisWithRetry<T>(taskName: string, operation: () => Promise<T>): Promise<T> {
  const errors: string[] = [];
  for (let attempt = 1; attempt <= ANALYSIS_RETRY_LIMIT; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if (!(err instanceof AnalysisExecutionError)) throw err;
      errors.push(`第 ${attempt} 次：${err.message}`);
      if (attempt >= ANALYSIS_RETRY_LIMIT) {
        throw new AnalysisExecutionError(`${taskName}已重试 ${ANALYSIS_RETRY_LIMIT} 次仍失败。${errors.join('；')}`, {
          code: AppErrorCode.ANALYSIS_EXECUTION_FAILED,
          retryable: true,
          userMessageKey: 'errors.ANALYSIS_EXECUTION_FAILED',
        });
      }
    }
  }
  throw new AnalysisExecutionError(`${taskName}执行失败。`, {
    code: AppErrorCode.ANALYSIS_EXECUTION_FAILED,
    userMessageKey: 'errors.ANALYSIS_EXECUTION_FAILED',
  });
}
