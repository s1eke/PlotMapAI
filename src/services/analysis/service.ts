import type { ChapterAnalysis } from '../db';
import { ANALYSIS_RETRY_LIMIT, LLM_MAX_OUTPUT_TOKENS } from './constants';
import { AnalysisExecutionError } from './errors';
import { collectAnalysisAggregates } from './aggregates';
import { requestChatJson } from './client';
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
  const payload = {
    model: config.modelName,
    temperature: 0.2,
    max_tokens: LLM_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system' as const, content: CHAPTER_ANALYZER_SYSTEM_PROMPT },
      { role: 'user' as const, content: prompt },
    ],
  };
  return runAnalysisWithRetry(
    `第 ${chunk.chunkIndex + 1} 块章节分析`,
    async () => normalizeChunkResult(await requestChatJson(config.apiBaseUrl, config.apiKey, payload), chunk),
  );
}

export async function runSingleChapterAnalysis(
  config: RuntimeAnalysisConfig,
  novelTitle: string,
  chapter: PromptChapter,
): Promise<ChunkAnalysisResult> {
  const prompt = buildSingleChapterPrompt(novelTitle, chapter);
  const payload = {
    model: config.modelName,
    temperature: 0.2,
    max_tokens: LLM_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system' as const, content: CHAPTER_ANALYZER_SYSTEM_PROMPT },
      { role: 'user' as const, content: prompt },
    ],
  };
  return runAnalysisWithRetry(
    `第 ${chapter.chapterIndex + 1} 章单章分析`,
    async () => normalizeSingleChapterResult(await requestChatJson(config.apiBaseUrl, config.apiKey, payload), chapter),
  );
}

export async function runOverviewAnalysis(
  config: RuntimeAnalysisConfig,
  novelTitle: string,
  chapterRows: ChapterAnalysis[],
  totalChapters: number,
): Promise<OverviewAnalysisResult> {
  if (chapterRows.length < totalChapters) {
    throw new AnalysisExecutionError('章节分析尚未全部完成，无法生成全书概览。');
  }
  const aggregates = collectAnalysisAggregates(chapterRows);
  const prompt = buildOverviewPrompt(novelTitle, aggregates, totalChapters, config.contextSize);
  const payload = {
    model: config.modelName,
    temperature: 0.2,
    max_tokens: LLM_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system' as const, content: OVERVIEW_ANALYZER_SYSTEM_PROMPT },
      { role: 'user' as const, content: prompt },
    ],
  };
  return runAnalysisWithRetry(
    '全书概览分析',
    async () => normalizeOverviewResult(await requestChatJson(config.apiBaseUrl, config.apiKey, payload), aggregates, totalChapters),
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
        throw new AnalysisExecutionError(`${taskName}已重试 ${ANALYSIS_RETRY_LIMIT} 次仍失败。${errors.join('；')}`);
      }
    }
  }
  throw new AnalysisExecutionError(`${taskName}执行失败。`);
}
