import type { Chapter, ChapterAnalysis, AnalysisOverview } from './db';
import { debugLog } from './debug';

const PROMPT_RESERVE_BUDGET = 6000;
const MIN_CONTEXT_SIZE = 12000;
const LLM_TIMEOUT_SECONDS = 120000;
const LLM_MAX_OUTPUT_TOKENS = 4000;
const ANALYSIS_RETRY_LIMIT = 3;

export class AnalysisConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisConfigError';
  }
}

export class AnalysisExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisExecutionError';
  }
}

export class ChunkingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChunkingError';
  }
}

export interface RuntimeAnalysisConfig {
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
  contextSize: number;
}

const RELATION_TAG_CANONICAL_PATTERNS: Array<[string, string[]]> = [
  ['父女', ['父女']],
  ['父子', ['父子']],
  ['母女', ['母女']],
  ['母子', ['母子']],
  ['兄妹', ['兄妹']],
  ['姐弟', ['姐弟']],
  ['姐妹', ['姐妹']],
  ['兄弟', ['兄弟']],
  ['夫妻', ['夫妻', '夫妇']],
  ['恋人', ['恋人', '情侣', '爱人', '相恋', '相爱']],
  ['亲情', ['亲情', '家人', '亲人', '血亲', '骨肉']],
  ['师徒', ['师徒', '师生']],
  ['君臣', ['君臣', '忠臣', '臣子', '臣属']],
  ['主仆', ['主仆', '仆从', '侍从']],
  ['盟友', ['盟友', '同盟']],
  ['同伴', ['同伴', '伙伴', '搭档']],
  ['朋友', ['朋友', '友人', '友情']],
  ['对立', ['对立', '敌对', '宿敌', '仇敌', '仇人', '敌人', '死敌']],
  ['利用', ['利用', '操控']],
  ['暧昧', ['暧昧']],
];

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(4, apiKey.length - 8))}${apiKey.slice(-4)}`;
}

export function validateAnalysisConfig(config: RuntimeAnalysisConfig): void {
  if (!config) throw new AnalysisConfigError('请先在设置中完成 AI 接口配置。');
  if (!cleanText(config.apiBaseUrl)) throw new AnalysisConfigError('AI 接口地址不能为空。');
  if (!cleanText(config.apiKey)) throw new AnalysisConfigError('AI Token 未配置，请先在设置中保存。');
  if (!cleanText(config.modelName)) throw new AnalysisConfigError('AI 模型名称不能为空。');
  if (coerceContextSize(config.contextSize, MIN_CONTEXT_SIZE) < MIN_CONTEXT_SIZE) {
    throw new AnalysisConfigError(`上下文大小不能小于 ${MIN_CONTEXT_SIZE}。`);
  }
}

export async function testAiProviderConnection(config: RuntimeAnalysisConfig): Promise<{ message: string; preview: string }> {
  const payload = {
    model: config.modelName,
    temperature: 0,
    max_tokens: 16,
    messages: [
      { role: 'system', content: '你是连通性测试助手。请简短回复。' },
      { role: 'user', content: '如果你能看到这条消息，只回复：连接成功' },
    ],
  };
  const content = await callOpenAiApiContent(config.apiBaseUrl, config.apiKey, payload);
  return {
    message: 'AI 接口连接测试成功。',
    preview: cleanText(content, 80) || '连接成功',
  };
}

export function buildAnalysisChunks(
  chapters: Array<{ chapterIndex: number; title: string; content: string }>,
  contextSize: number,
): Array<Record<string, unknown>> {
  if (contextSize < MIN_CONTEXT_SIZE) {
    throw new ChunkingError(`上下文大小过小，至少需要 ${MIN_CONTEXT_SIZE}。`);
  }
  const contentBudget = contextSize - PROMPT_RESERVE_BUDGET;
  if (contentBudget <= 0) {
    throw new ChunkingError('上下文大小不足以容纳分析提示词，请增大上下文大小。');
  }

  const chunks: Array<Record<string, unknown>> = [];
  const currentChapters: Array<Record<string, unknown>> = [];
  let currentLength = 0;

  for (const chapter of chapters) {
    const chapterText = renderChapterForPrompt(chapter);
    const chapterLength = estimatePromptBudget(chapterText);
    if (chapterLength > contentBudget) {
      throw new ChunkingError(
        `第 ${chapter.chapterIndex + 1} 章《${chapter.title || '未命名章节'}》长度超过当前上下文预算，请增大上下文大小后重试。`,
      );
    }
    if (currentChapters.length > 0 && currentLength + chapterLength > contentBudget) {
      chunks.push(buildChunk(chunks.length, currentChapters, currentLength));
      currentChapters.length = 0;
      currentLength = 0;
    }
    currentChapters.push({
      chapterIndex: chapter.chapterIndex,
      title: chapter.title,
      content: chapter.content,
      text: chapterText,
      length: chapterLength,
    });
    currentLength += chapterLength;
  }
  if (currentChapters.length > 0) {
    chunks.push(buildChunk(chunks.length, currentChapters, currentLength));
  }
  return chunks;
}

export async function runChunkAnalysis(
  config: RuntimeAnalysisConfig,
  novelTitle: string,
  chunk: Record<string, unknown>,
  totalChunks: number,
): Promise<Record<string, unknown>> {
  const prompt = buildPrompt(novelTitle, chunk, totalChunks);
  const payload = {
    model: config.modelName,
    temperature: 0.2,
    max_tokens: LLM_MAX_OUTPUT_TOKENS,
    messages: [
      {
        role: 'system',
        content: '你是一个严谨的小说结构分析器。你必须只返回 JSON 对象，不允许返回 markdown、解释文本或多余前后缀。',
      },
      { role: 'user', content: prompt },
    ],
  };
  return runAnalysisWithRetry(
    `第 ${(chunk.chunkIndex as number) + 1} 块章节分析`,
    async () => {
      const raw = await callOpenAiApiJson(config.apiBaseUrl, config.apiKey, payload);
      return normalizeChunkResult(raw, chunk);
    },
  );
}

export async function runSingleChapterAnalysis(
  config: RuntimeAnalysisConfig,
  novelTitle: string,
  chapter: { chapterIndex: number; title: string; content: string },
): Promise<Record<string, unknown>> {
  const prompt = buildSingleChapterPrompt(novelTitle, chapter);
  const payload = {
    model: config.modelName,
    temperature: 0.2,
    max_tokens: LLM_MAX_OUTPUT_TOKENS,
    messages: [
      {
        role: 'system',
        content: '你是一个严谨的小说结构分析器。你必须只返回 JSON 对象，不允许返回 markdown、解释文本或多余前后缀。',
      },
      { role: 'user', content: prompt },
    ],
  };
  return runAnalysisWithRetry(
    `第 ${chapter.chapterIndex + 1} 章单章分析`,
    async () => {
      const raw = await callOpenAiApiJson(config.apiBaseUrl, config.apiKey, payload);
      return normalizeSingleChapterResult(raw, chapter);
    },
  );
}

export async function runOverviewAnalysis(
  config: RuntimeAnalysisConfig,
  novelTitle: string,
  chapterRows: ChapterAnalysis[],
  totalChapters: number,
): Promise<Record<string, unknown>> {
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
      {
        role: 'system',
        content: '你是一个严谨的小说全书分析器。你必须只返回 JSON 对象，不允许返回 markdown、解释文本或多余前后缀。',
      },
      { role: 'user', content: prompt },
    ],
  };
  return runAnalysisWithRetry(
    '全书概览分析',
    async () => {
      const raw = await callOpenAiApiJson(config.apiBaseUrl, config.apiKey, payload);
      return normalizeOverviewResult(raw, aggregates, totalChapters);
    },
  );
}

export function isChapterAnalysisComplete(row: ChapterAnalysis | undefined): boolean {
  if (!row) return false;
  if (!cleanText(row.summary, 400)) return false;
  return [row.keyPoints, row.characters, row.relationships, row.tags].every(isList);
}

export function isOverviewComplete(overview: AnalysisOverview | undefined, totalChapters: number): boolean {
  if (!overview) return false;
  if (totalChapters <= 0) return false;
  if (!cleanText(overview.bookIntro, 400)) return false;
  if (!cleanText(overview.globalSummary, 2000)) return false;
  if (overview.analyzedChapters < totalChapters || overview.totalChapters < totalChapters) return false;
  return [overview.themes, overview.characterStats, overview.relationshipGraph].every(isList);
}

export function serializeOverview(overview: AnalysisOverview | undefined): Record<string, unknown> | null {
  if (!overview) return null;
  return {
    bookIntro: overview.bookIntro,
    globalSummary: overview.globalSummary,
    themes: overview.themes,
    characterStats: overview.characterStats,
    relationshipGraph: overview.relationshipGraph,
    totalChapters: overview.totalChapters,
    analyzedChapters: overview.analyzedChapters,
    updatedAt: overview.updatedAt,
  };
}

export function serializeChapterAnalysis(row: ChapterAnalysis | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    chapterIndex: row.chapterIndex,
    chapterTitle: row.chapterTitle,
    summary: row.summary,
    keyPoints: row.keyPoints,
    characters: row.characters,
    relationships: row.relationships,
    tags: row.tags,
    chunkIndex: row.chunkIndex,
    updatedAt: row.updatedAt,
  };
}

export function buildCharacterGraphPayload(
  chapters: Chapter[],
  chapterRows: ChapterAnalysis[],
  overview: AnalysisOverview | undefined,
): Record<string, unknown> {
  const totalChapters = chapters.length;
  const overviewPayload = serializeOverview(overview);
  const aggregates = chapterRows.length > 0
    ? collectAnalysisAggregates(chapterRows)
    : { allCharacterStats: [], relationshipGraph: [], analyzedChapters: 0 };

  const aggregateCharacterMap = new Map<string, Record<string, unknown>>();
  for (const item of (aggregates.allCharacterStats as Array<Record<string, unknown>>)) {
    const name = cleanText(item.name as string, 80);
    if (name) aggregateCharacterMap.set(name, item);
  }

  const overviewCharacterStats = (overviewPayload?.characterStats as Array<Record<string, unknown>>) || [];
  const overviewRelationshipGraph = (overviewPayload?.relationshipGraph as Array<Record<string, unknown>>) || [];
  const overviewCharacterMap = new Map<string, Record<string, unknown>>();
  for (const item of overviewCharacterStats) {
    const name = cleanText(item.name as string, 80);
    if (name) overviewCharacterMap.set(name, item);
  }

  const relationshipGraph = ((aggregates.relationshipGraph as Array<Record<string, unknown>>) || [])
    .filter(i => typeof i === 'object');
  const localRelationshipMap = buildLocalRelationshipGraphMap(relationshipGraph);
  const overviewRelationshipMap = buildOverviewRelationshipMap(overviewRelationshipGraph);

  const graphSeedEdges = [...overviewRelationshipGraph, ...relationshipGraph];
  const selectedNames = selectCharacterGraphNames(
    (aggregates.allCharacterStats as Array<Record<string, unknown>>) || [],
    overviewCharacterStats,
    graphSeedEdges,
  );
  const selectedNameSet = new Set(selectedNames);

  const mergedPairs: Array<[string, string]> = [];
  for (const edge of graphSeedEdges) {
    const pair = normalizeCharacterPair(edge.source, edge.target);
    if (!pair || mergedPairs.some(p => p[0] === pair[0] && p[1] === pair[1])) continue;
    mergedPairs.push(pair);
  }

  const edges: Array<Record<string, unknown>> = [];
  for (const [source, target] of mergedPairs) {
    if (!selectedNameSet.has(source) || !selectedNameSet.has(target)) continue;
    const pairKey = `${source}::${target}`;
    const overviewEdge = overviewRelationshipMap.get(pairKey) || {};
    const localEdge = localRelationshipMap.get(pairKey) || {};
    const relationTags = normalizeRelationTags(
      overviewEdge.relationTags, overviewEdge.type,
      localEdge.relationTags, localEdge.type,
    ) || ['未分类'];
    const chapterCount = Number(localEdge.chapterCount) || 0;
    const mentionCount = Number(localEdge.mentionCount) || 0;
    edges.push({
      id: `${source}::${target}`,
      source,
      target,
      type: relationTags[0],
      relationTags,
      description: cleanText(overviewEdge.description as string, 280)
        || buildCharacterGraphEdgeDescription(source, target, relationTags, chapterCount, mentionCount),
      weight: Math.round((Number(localEdge.weight) || 0) * 100) / 100,
      mentionCount,
      chapterCount,
      chapters: (localEdge.chapters as number[]) || [],
    });
  }
  edges.sort((a, b) => (b.weight as number) - (a.weight as number) || (b.mentionCount as number) - (a.mentionCount as number));

  const relatedEdgeMap = new Map<string, Array<Record<string, unknown>>>();
  for (const name of selectedNames) relatedEdgeMap.set(name, []);
  for (const edge of edges) {
    const src = edge.source as string;
    const tgt = edge.target as string;
    relatedEdgeMap.get(src)?.push(edge);
    relatedEdgeMap.get(tgt)?.push(edge);
  }

  const nodes: Array<Record<string, unknown>> = [];
  for (const name of selectedNames) {
    const aggregateItem = aggregateCharacterMap.get(name) || {};
    const overviewItem = overviewCharacterMap.get(name) || {};
    const role = cleanText(overviewItem.role as string, 80) || cleanText(aggregateItem.role as string, 80);
    const sharePercent = Math.round((Number(overviewItem.sharePercent || aggregateItem.sharePercent) || 0) * 100) / 100;
    const chapterCount = Number(aggregateItem.chapterCount) || 0;
    let description = cleanText(overviewItem.description as string, 220);
    if (!description) {
      description = buildCharacterGraphNodeDescription(
        name, role, sharePercent, chapterCount, relatedEdgeMap.get(name) || [],
      );
    }
    nodes.push({
      id: name,
      name,
      role,
      description,
      weight: Math.round((Number(aggregateItem.weight) || 0) * 100) / 100,
      sharePercent,
      chapterCount,
      chapters: (aggregateItem.chapters as number[]) || [],
      isCore: overviewCharacterMap.has(name),
    });
  }

  let generatedAt: string | null = overview?.updatedAt || null;
  if (!generatedAt && chapterRows.length > 0) {
    generatedAt = chapterRows.reduce<string | null>((latest, row) => {
      if (!row.updatedAt) return latest;
      return !latest || row.updatedAt > latest ? row.updatedAt : latest;
    }, null);
  }

  return {
    nodes,
    edges,
    meta: {
      totalChapters,
      analyzedChapters: (aggregates.analyzedChapters as number) || 0,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      hasOverview: !!overviewPayload,
      hasData: nodes.length > 0 || edges.length > 0,
      isComplete: isOverviewComplete(overview, totalChapters),
      generatedAt,
    },
  };
}

// --- LLM API ---

async function callOpenAiApiJson(
  apiBaseUrl: string, apiKey: string, payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const content = await callOpenAiApiContent(apiBaseUrl, apiKey, payload);
  return extractJsonObject(content);
}

async function callOpenAiApiContent(
  apiBaseUrl: string, apiKey: string, payload: Record<string, unknown>,
): Promise<string> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_SECONDS);
  debugLog('AI', `POST ${url} model=${payload.model} maxTokens=${payload.max_tokens}`);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AnalysisExecutionError('AI 接口请求超时，请稍后重试。');
    }
    throw new AnalysisExecutionError(`AI 接口连接失败：${err instanceof Error ? err.message : String(err)}`);
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AnalysisExecutionError(`AI 接口返回错误（HTTP ${response.status}）：${extractErrorMessage(detail)}`);
  }

  const rawResponse = await response.text();
  debugLog('AI', `response HTTP ${response.status} contentLen=${rawResponse.length}`);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawResponse);
  } catch {
    throw new AnalysisExecutionError('AI 接口返回的不是合法 JSON 响应。');
  }
  if (typeof data !== 'object' || data === null) {
    throw new AnalysisExecutionError('AI 接口返回格式无效。');
  }
  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AnalysisExecutionError('AI 接口返回内容为空。');
  }
  const message = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
  let content = message?.content;
  if (Array.isArray(content)) {
    content = content.map((i: Record<string, unknown>) => (typeof i === 'object' ? (i.text as string) || '' : '')).join('');
  }
  if (typeof content !== 'string' || !content.trim()) {
    throw new AnalysisExecutionError('AI 接口未返回有效文本内容。');
  }
  return content;
}

// --- Normalization ---

function normalizeChunkResult(raw: Record<string, unknown>, chunk: Record<string, unknown>): Record<string, unknown> {
  const rawItems = raw.chapterAnalyses;
  if (!Array.isArray(rawItems)) {
    throw new AnalysisExecutionError('AI 返回缺少 chapterAnalyses 数组。');
  }
  const expectedIndices = new Set((chunk.chapters as Array<Record<string, unknown>>).map(c => c.chapterIndex as number));
  const rawMap = new Map<number, Record<string, unknown>>();
  for (const item of rawItems) {
    if (typeof item !== 'object' || item === null) {
      throw new AnalysisExecutionError('AI 返回的 chapterAnalyses 项不是对象。');
    }
    const chapterIndex = Number((item as Record<string, unknown>).chapterIndex);
    if (!Number.isInteger(chapterIndex)) {
      throw new AnalysisExecutionError('AI 返回的 chapterIndex 不是有效整数。');
    }
    if (!expectedIndices.has(chapterIndex)) {
      throw new AnalysisExecutionError(`AI 返回了不属于当前块的章节索引：${chapterIndex}。`);
    }
    if (rawMap.has(chapterIndex)) {
      throw new AnalysisExecutionError(`AI 返回了重复的章节索引：${chapterIndex}。`);
    }
    rawMap.set(chapterIndex, item as Record<string, unknown>);
  }

  const results: Array<Record<string, unknown>> = [];
  for (const chapter of chunk.chapters as Array<Record<string, unknown>>) {
    const chapterIndex = chapter.chapterIndex as number;
    const item = rawMap.get(chapterIndex);
    if (!item) {
      throw new AnalysisExecutionError(`AI 返回缺少第 ${chapterIndex + 1} 章的分析结果。`);
    }
    if (!cleanText(item.summary as string, 400)) {
      throw new AnalysisExecutionError(`AI 返回的第 ${chapterIndex + 1} 章 summary 为空。`);
    }
    for (const field of ['keyPoints', 'tags', 'characters', 'relationships']) {
      if (!Array.isArray(item[field])) {
        throw new AnalysisExecutionError(`AI 返回的第 ${chapterIndex + 1} 章缺少有效的 ${field} 数组。`);
      }
    }
    results.push({
      chapterIndex,
      title: cleanText(item.title as string, 256) || (chapter.title as string),
      summary: cleanText(item.summary as string, 400),
      keyPoints: normalizeStringList(item.keyPoints, 8, 120),
      tags: normalizeStringList(item.tags, 8, 40),
      characters: normalizeCharacterList(item.characters),
      relationships: normalizeRelationshipList(item.relationships),
    });
  }

  return {
    chunkSummary: cleanText(raw.chunkSummary as string, 500) || '该章节块分析已完成。',
    chapterAnalyses: results,
  };
}

function normalizeOverviewResult(
  raw: Record<string, unknown>,
  aggregates: Record<string, unknown>,
  totalChapters: number,
): Record<string, unknown> {
  const bookIntro = cleanText(raw.bookIntro as string, 400);
  const globalSummary = cleanText(raw.globalSummary as string, 2400);
  if (!bookIntro) throw new AnalysisExecutionError('AI 返回的 bookIntro 为空。');
  if (!globalSummary) throw new AnalysisExecutionError('AI 返回的 globalSummary 为空。');
  if (!Array.isArray(raw.themes)) throw new AnalysisExecutionError('AI 返回缺少有效的 themes 数组。');
  if (!Array.isArray(raw.characterStats)) throw new AnalysisExecutionError('AI 返回缺少有效的 characterStats 数组。');
  if (!Array.isArray(raw.relationshipGraph)) throw new AnalysisExecutionError('AI 返回缺少有效的 relationshipGraph 数组。');

  const localCharacterMap = new Map<string, Record<string, unknown>>();
  const sourceChars = (aggregates.allCharacterStats || aggregates.characterStats) as Array<Record<string, unknown>>;
  for (const item of sourceChars) {
    if (item.name) localCharacterMap.set(item.name as string, item);
  }

  const localRelationshipMap = buildOverviewRelationshipMap(
    (aggregates.allRelationshipGraph || []) as Array<Record<string, unknown>>,
  );

  const characterStats: Array<Record<string, unknown>> = [];
  const seenNames = new Set<string>();
  const rawSharePercents: number[] = [];

  for (const item of (raw.characterStats as Array<unknown>).slice(0, 8)) {
    if (typeof item !== 'object' || item === null) throw new AnalysisExecutionError('AI 返回的 characterStats 项不是对象。');
    const obj = item as Record<string, unknown>;
    const name = cleanText(obj.name as string, 80);
    if (!name) throw new AnalysisExecutionError('AI 返回的核心角色缺少 name。');
    if (seenNames.has(name)) continue;
    const localItem = localCharacterMap.get(name);
    if (!localItem) throw new AnalysisExecutionError(`AI 返回了未在章节分析中出现的核心角色：${name}。`);
    const sharePercent = coerceWeight(obj.sharePercent);
    if (sharePercent <= 0) throw new AnalysisExecutionError(`AI 返回的核心角色 ${name} 缺少有效的 sharePercent。`);
    seenNames.add(name);
    rawSharePercents.push(sharePercent);
    characterStats.push({
      name,
      role: cleanText(obj.role as string, 80) || (localItem.role as string),
      description: cleanText(obj.description as string, 200) || (localItem.description as string),
      weight: localItem.weight,
      sharePercent,
      chapters: localItem.chapters,
      chapterCount: localItem.chapterCount,
    });
  }

  if (localCharacterMap.size > 0 && characterStats.length === 0) {
    throw new AnalysisExecutionError('AI 返回的核心角色列表为空。');
  }

  const normalizedSharePercents = normalizeSharePercentValues(rawSharePercents);
  for (let i = 0; i < normalizedSharePercents.length; i++) {
    characterStats[i].sharePercent = normalizedSharePercents[i];
  }
  characterStats.sort((a, b) =>
    (b.sharePercent as number) - (a.sharePercent as number) ||
    (b.weight as number) - (a.weight as number) ||
    String(a.name).localeCompare(String(b.name)),
  );

  const relationshipGraph: Array<Record<string, unknown>> = [];
  const seenPairs = new Set<string>();
  for (const item of (raw.relationshipGraph as Array<unknown>).slice(0, 24)) {
    if (typeof item !== 'object' || item === null) throw new AnalysisExecutionError('AI 返回的 relationshipGraph 项不是对象。');
    const obj = item as Record<string, unknown>;
    const pair = normalizeCharacterPair(obj.source, obj.target);
    if (!pair) continue;
    const pairKey = `${pair[0]}::${pair[1]}`;
    if (seenPairs.has(pairKey)) continue;
    const [source, target] = pair;
    const missingNames = [source, target].filter(n => !localCharacterMap.has(n));
    if (missingNames.length > 0) continue;
    const localEdge = localRelationshipMap.get(pairKey) || {};
    let relationTags = normalizeRelationTags(obj.relationTags, obj.type);
    if (!relationTags) {
      relationTags = normalizeRelationTags(localEdge.relationTags, localEdge.type);
    }
    if (!relationTags) throw new AnalysisExecutionError(`AI 返回的关系 ${source} / ${target} 缺少有效的 relationTags。`);
    const description = cleanText(obj.description as string, 280) || cleanText(localEdge.description as string, 280);
    relationshipGraph.push({
      source,
      target,
      type: relationTags[0],
      relationTags: relationTags.slice(0, 6),
      description,
    });
    seenPairs.add(pairKey);
  }

  return {
    bookIntro,
    globalSummary,
    themes: normalizeStringList(raw.themes, 12, 40),
    characterStats,
    relationshipGraph,
    totalChapters,
    analyzedChapters: aggregates.analyzedChapters as number,
  };
}

// --- Aggregation ---

function collectAnalysisAggregates(chapterRows: ChapterAnalysis[]): Record<string, unknown> {
  const themeCounter = new Map<string, number>();
  const characterMap = new Map<string, Record<string, unknown>>();
  const relationshipMap = new Map<string, Record<string, unknown>>();
  const chaptersPayload: Array<Record<string, unknown>> = [];

  for (const row of chapterRows) {
    const tags = row.tags;
    const characters = row.characters;
    const relationships = row.relationships;
    const keyPoints = row.keyPoints;
    chaptersPayload.push({
      chapterIndex: row.chapterIndex,
      chapterTitle: row.chapterTitle,
      summary: row.summary,
      keyPoints,
      tags,
      characters,
      relationships,
    });

    for (const tag of tags) {
      if (typeof tag === 'string' && tag.trim()) {
        themeCounter.set(tag.trim(), (themeCounter.get(tag.trim()) || 0) + 1);
      }
    }

    for (const item of characters) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;
      const name = cleanText(obj.name as string, 80);
      if (!name) continue;
      const weight = coerceWeight(obj.weight);
      const role = cleanText(obj.role as string, 80);
      const description = cleanText(obj.description as string, 200);
      let target = characterMap.get(name);
      if (!target) {
        target = { name, weight: 0, chapters: new Set<number>(), roles: new Map<string, number>(), descriptions: [] as string[] };
        characterMap.set(name, target);
      }
      (target.weight as number) += weight;
      (target.chapters as Set<number>).add(row.chapterIndex);
      if (role) {
        const roles = target.roles as Map<string, number>;
        roles.set(role, (roles.get(role) || 0) + Math.max(weight, 1));
      }
      if (description && !(target.descriptions as string[]).includes(description) && (target.descriptions as string[]).length < 6) {
        (target.descriptions as string[]).push(description);
      }
    }

    for (const item of relationships) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;
      const source = cleanText(obj.source as string, 80);
      const targetName = cleanText(obj.target as string, 80);
      const relationTags = normalizeRelationTags(obj.relationTags, obj.type) || ['未分类'];
      if (!source || !targetName || source === targetName) continue;
      const [src, tgt] = [source, targetName].sort();
      const key = `${src}::${tgt}`;
      const relationWeight = coerceWeight(obj.weight);
      let edge = relationshipMap.get(key);
      if (!edge) {
        edge = {
          source: src,
          target: tgt,
          weight: 0,
          mentionCount: 0,
          descriptions: [] as string[],
          chapters: new Set<number>(),
          relationTypes: new Map<string, number>(),
        };
        relationshipMap.set(key, edge);
      }
      (edge.weight as number) += relationWeight;
      (edge.mentionCount as number) += 1;
      (edge.chapters as Set<number>).add(row.chapterIndex);
      for (const tag of relationTags) {
        const types = edge.relationTypes as Map<string, number>;
        types.set(tag, (types.get(tag) || 0) + Math.max(relationWeight, 1));
      }
      const description = cleanText(obj.description as string, 160);
      if (description && !(edge.descriptions as string[]).includes(description) && (edge.descriptions as string[]).length < 6) {
        (edge.descriptions as string[]).push(description);
      }
    }
  }

  const totalWeight = Array.from(characterMap.values()).reduce((s, i) => s + (i.weight as number), 0) || 1;
  const allCharacterStats = Array.from(characterMap.values())
    .map(item => {
      const roles = item.roles as Map<string, number>;
      const topRole = [...roles.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      return {
        name: item.name as string,
        role: topRole?.[0] || '',
        description: (item.descriptions as string[])[0] || '',
        descriptionFragments: (item.descriptions as string[]).slice(0, 4),
        weight: Math.round((item.weight as number) * 100) / 100,
        sharePercent: Math.round((item.weight as number) / totalWeight * 10000) / 100,
        chapters: [...(item.chapters as Set<number>)].sort((a, b) => a - b),
        chapterCount: (item.chapters as Set<number>).size,
      };
    })
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));

  const relationshipGraph = Array.from(relationshipMap.values())
    .map(item => {
      const types = item.relationTypes as Map<string, number>;
      const topTypes = [...types.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 6)
        .map(e => e[0]);
      return {
        source: item.source as string,
        target: item.target as string,
        type: topTypes[0] || '未分类',
        relationTags: topTypes,
        weight: Math.round((item.weight as number) * 100) / 100,
        mentionCount: item.mentionCount as number,
        chapterCount: (item.chapters as Set<number>).size,
        chapters: [...(item.chapters as Set<number>)].sort((a, b) => a - b),
        description: (item.descriptions as string[]).slice(0, 3).join('；'),
        descriptionFragments: (item.descriptions as string[]).slice(0, 4),
      };
    })
    .sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  return {
    chapters: chaptersPayload,
    themes: [...themeCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e[0]),
    characterStats: allCharacterStats.slice(0, 20),
    allCharacterStats,
    allRelationshipGraph: relationshipGraph,
    relationshipGraph: relationshipGraph.slice(0, 30),
    analyzedChapters: chapterRows.length,
  };
}

// --- Helpers ---

function buildChunk(chunkIndex: number, chapters: Array<Record<string, unknown>>, contentLength: number): Record<string, unknown> {
  return {
    chunkIndex,
    chapterIndices: chapters.map(c => c.chapterIndex),
    startChapterIndex: chapters[0].chapterIndex,
    endChapterIndex: chapters[chapters.length - 1].chapterIndex,
    contentLength,
    chapters,
    text: chapters.map(c => c.text).join('\n\n'),
  };
}

function renderChapterForPrompt(chapter: { chapterIndex: number; title: string; content: string }): string {
  return `[章节索引]${chapter.chapterIndex}\n[章节标题]${chapter.title || '未命名章节'}\n[章节正文]\n${chapter.content || ''}`;
}

function buildPrompt(novelTitle: string, chunk: Record<string, unknown>, totalChunks: number): string {
  const chapters = chunk.chapters as Array<Record<string, unknown>>;
  const chapterList = chapters.map(c => `${c.chapterIndex}:${c.title || '未命名章节'}`).join(', ');
  return `请分析小说《${novelTitle}》的以下章节块。当前是第 ${(chunk.chunkIndex as number) + 1}/${totalChunks} 个块。

分析目标：
1. 为每一章生成剧情梗概；
2. 提取每一章的关键剧情点；
3. 识别该章角色，并为每个角色给出 role、description、weight；其中 weight 为 0~100 的数值，表示该角色在本章的篇幅/存在感权重；
4. 提取本章中明确出现的人物关系；
5. 给出该章标签 tags。

返回要求：
- 只能返回 JSON 对象；
- 不要遗漏输入中的任何章节，也不要输出额外章节；
- chapterIndex 必须与输入一致，且每章都必须有独立结果；
- 每章都必须返回非空 summary；
- keyPoints、characters、relationships、tags 四个字段必须始终存在，哪怕没有内容也要返回空数组；
- 不要编造未在正文中出现的人物关系；
- 每章 summary 尽量控制在 120 字以内；
- relationship 中 weight 为 0~100 数值，source/target 为人物名；
- characters 中必须尽量覆盖本章核心角色；
- 权重请使用相对占比，便于后续统计人物篇幅。

JSON 结构示例：
{
  "chunkSummary": "该块总体概括",
  "chapterAnalyses": [
    {
      "chapterIndex": 0,
      "title": "章节标题",
      "summary": "章节梗概",
      "keyPoints": ["事件1", "事件2"],
      "tags": ["冲突", "成长"],
      "characters": [
        {"name": "角色名", "role": "角色定位", "description": "本章作用", "weight": 78}
      ],
      "relationships": [
        {"source": "角色A", "target": "角色B", "type": "盟友", "description": "关系变化", "weight": 65}
      ]
    }
  ]
}

当前块包含章节：${chapterList}

章节正文如下：
${chunk.text}`.trim();
}

function buildSingleChapterPrompt(novelTitle: string, chapter: { chapterIndex: number; title: string; content: string }): string {
  const chapterText = renderChapterForPrompt(chapter);
  return `请分析小说《${novelTitle}》的第 ${chapter.chapterIndex + 1} 章《${chapter.title || '未命名章节'}》。

分析目标：
1. 生成该章的剧情梗概；
2. 提取关键剧情点；
3. 识别该章角色，并为每个角色给出 role、description、weight；其中 weight 为 0~100 的数值，表示该角色在本章的篇幅/存在感权重；
4. 提取本章中明确出现的人物关系；
5. 给出该章标签 tags。

返回要求：
- 只能返回 JSON 对象；
- chapterIndex 必须与输入一致；
- 必须返回非空 summary；
- keyPoints、characters、relationships、tags 四个字段必须始终存在，哪怕没有内容也要返回空数组；
- 不要编造未在正文中出现的人物关系；
- summary 尽量控制在 120 字以内；
- relationship 中 weight 为 0~100 数值，source/target 为人物名；
- characters 中必须尽量覆盖本章核心角色；
- 权重请使用相对占比，便于后续统计人物篇幅。

JSON 结构示例：
{
  "chapterAnalyses": [
    {
      "chapterIndex": 0,
      "title": "章节标题",
      "summary": "章节梗概",
      "keyPoints": ["事件1", "事件2"],
      "tags": ["冲突", "成长"],
      "characters": [
        {"name": "角色名", "role": "角色定位", "description": "本章作用", "weight": 78}
      ],
      "relationships": [
        {"source": "角色A", "target": "角色B", "type": "盟友", "description": "关系变化", "weight": 65}
      ]
    }
  ]
}

章节正文如下：
${chapterText}`.trim();
}

function normalizeSingleChapterResult(raw: Record<string, unknown>, chapter: { chapterIndex: number; title: string }): Record<string, unknown> {
  const rawItems = raw.chapterAnalyses;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new AnalysisExecutionError('AI 返回缺少 chapterAnalyses 数组。');
  }
  const item = rawItems[0] as Record<string, unknown>;
  if (!Number.isInteger(Number(item.chapterIndex)) || Number(item.chapterIndex) !== chapter.chapterIndex) {
    throw new AnalysisExecutionError(`AI 返回的 chapterIndex (${item.chapterIndex}) 与请求的 (${chapter.chapterIndex}) 不一致。`);
  }
  if (!cleanText(item.summary as string, 400)) {
    throw new AnalysisExecutionError('AI 返回的 summary 为空。');
  }
  for (const field of ['keyPoints', 'tags', 'characters', 'relationships']) {
    if (!Array.isArray(item[field])) {
      throw new AnalysisExecutionError(`AI 返回缺少有效的 ${field} 数组。`);
    }
  }
  return {
    chunkSummary: '单章分析',
    chapterAnalyses: [{
      chapterIndex: chapter.chapterIndex,
      title: cleanText(item.title as string, 256) || chapter.title,
      summary: cleanText(item.summary as string, 400),
      keyPoints: normalizeStringList(item.keyPoints, 8, 120),
      tags: normalizeStringList(item.tags, 8, 40),
      characters: normalizeCharacterList(item.characters),
      relationships: normalizeRelationshipList(item.relationships),
    }],
  };
}

function buildOverviewPrompt(
  novelTitle: string,
  aggregates: Record<string, unknown>,
  totalChapters: number,
  contextSize: number,
): string {
  const sourcePayload = {
    totalChapters,
    chapterAnalyses: aggregates.chapters,
    localThemes: aggregates.themes,
    localCharacterStats: aggregates.characterStats,
    localRelationshipGraph: aggregates.relationshipGraph,
  };
  const sourceJson = JSON.stringify(sourcePayload);
  const sourceBudget = contextSize - PROMPT_RESERVE_BUDGET;
  if (sourceBudget <= 0 || estimatePromptBudget(sourceJson) > sourceBudget) {
    throw new ChunkingError('全部章节分析数据超过当前上下文预算，请增大上下文大小后继续分析。');
  }
  return `以下是小说《${novelTitle}》全部章节的 AI 分析数据，请基于这些现成分析结果统一汇总简介、全书概览、主题标签和核心角色篇幅占比，不要逐章罗列，不要回退成章节摘要拼接，也不要机械照搬局部统计结果。

输出目标：
1. bookIntro：用于书籍详情页简介的文字，80~160 字，更像读者在详情页看到的导读或封底文案，重点交代故事设定、主角关系与核心悬念，尽量不要展开结局；
2. globalSummary：全书概览，220~500 字，完整概括主线推进、关键冲突、人物变化与结局走向，避免逐章列清单；
3. themes：3~12 个主题标签，应体现整本书的核心主题，而不是单纯重复高频章节标签；
4. characterStats：最多 8 个核心角色，必须复用输入 localCharacterStats 中已统计的角色名称，并输出 name、role、description、sharePercent；其中 sharePercent 为 0~100 的数值，表示该角色在整本书中的篇幅/存在感占比，请基于全部章节分析统一判断。
5. relationshipGraph：输出 6~24 条人物关系，只保留真正重要、稳定或对主线关键的关系；请综合章节 summary、characters、relationships 与 localRelationshipGraph 重新判断，不要简单照抄局部标签。

返回要求：
- 只能返回 JSON 对象；
- bookIntro 和 globalSummary 必须为非空字符串；
- bookIntro 和 globalSummary 必须明显区分层级，不能只是长短不同的同一段改写；
- bookIntro 应该更短、更像导读；globalSummary 才负责完整展开剧情与人物变化；
- themes、characterStats、relationshipGraph 必须为数组；
- characterStats 中不要输出未在 localCharacterStats 里出现的角色；
- 每个 characterStats 项都必须包含非空 name 和有效的 sharePercent；
- sharePercent 建议保留 1~2 位小数，全部角色的 sharePercent 总和不要超过 100；
- relationshipGraph 中的 source / target 必须来自输入里已出现的人物；
- relationshipGraph 每项都必须包含 source、target、relationTags、description；
- relationTags 为 1~4 个短标签，例如"师徒""盟友""对立""亲情""利用""暧昧"；
- relationTags 必须使用已经读完全书后的明确关系，不要写"疑似父女""父女（承认）""父女感应"这类阶段性或变体标签；如果最终关系明确为"父女"，就统一写"父女"；
- 优先保留能代表全书结构的关系，不要把同一对人物拆成多条；
- 不要输出 weight、chapters、chapterCount 等额外字段；
- characterStats.description 和 relationshipGraph.description 都要写成面向普通读者的自然表达，突出人物在剧情中的位置、冲突和变化；
- description 不要出现"在全书已分析内容中""覆盖X章""提及X次""篇幅占比约X%"这类系统口吻或统计口吻；
- 不要输出 markdown、解释文字或代码块。

JSON 结构示例：
{
  "bookIntro": "简介文本",
  "globalSummary": "全书概览文本",
  "themes": ["江湖", "成长", "家国"],
  "characterStats": [
    {"name": "紫薇", "role": "核心主角", "description": "推动主线与情感冲突的关键人物", "sharePercent": 28.5}
  ],
  "relationshipGraph": [
    {"source": "紫薇", "target": "小燕子", "relationTags": ["同伴", "姐妹情谊"], "description": "两人长期并肩推进主线，并在身份与情感压力中互相扶持。"}
  ]
}

全部分析数据如下：
${sourceJson}`.trim();
}

async function runAnalysisWithRetry(taskName: string, operation: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const errors: string[] = [];
  for (let attempt = 1; attempt <= ANALYSIS_RETRY_LIMIT; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if (!(err instanceof AnalysisExecutionError)) throw err;
      errors.push(`第 ${attempt} 次：${err.message}`);
      debugLog('AI', `retry ${attempt}/${ANALYSIS_RETRY_LIMIT} for "${taskName}": ${err instanceof Error ? err.message : String(err)}`);
      if (attempt >= ANALYSIS_RETRY_LIMIT) {
        throw new AnalysisExecutionError(
          `${taskName}已重试 ${ANALYSIS_RETRY_LIMIT} 次仍失败。${errors.join('；')}`,
        );
      }
    }
  }
  throw new AnalysisExecutionError(`${taskName}执行失败。`);
}

function normalizeCharacterList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).filter(i => typeof i === 'object' && i !== null).map(item => {
    const obj = item as Record<string, unknown>;
    const name = cleanText(obj.name as string, 80);
    if (!name) return null;
    return { name, role: cleanText(obj.role as string, 80), description: cleanText(obj.description as string, 200), weight: coerceWeight(obj.weight) };
  }).filter(Boolean) as Array<Record<string, unknown>>;
}

function normalizeRelationshipList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).filter(i => typeof i === 'object' && i !== null).map(item => {
    const obj = item as Record<string, unknown>;
    const source = cleanText(obj.source as string, 80);
    const target = cleanText(obj.target as string, 80);
    if (!source || !target || source === target) return null;
    return { source, target, type: cleanText(obj.type as string, 80) || '未分类', description: cleanText(obj.description as string, 160), weight: coerceWeight(obj.weight) };
  }).filter(Boolean) as Array<Record<string, unknown>>;
}

function normalizeStringList(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const results: string[] = [];
  for (const item of value.slice(0, limit)) {
    const text = cleanText(item as string, maxLength);
    if (text && !results.includes(text)) results.push(text);
  }
  return results;
}

function normalizeSharePercentValues(values: number[]): number[] {
  if (!values.length) return [];
  const sanitized = values.map(v => Math.max(0, Math.min(v, 100)));
  const total = sanitized.reduce((s, v) => s + v, 0);
  if (total <= 0) return sanitized.map(() => 0);
  if (total <= 100) return sanitized.map(v => Math.round(v * 100) / 100);
  const scale = 100 / total;
  const normalized = sanitized.map(v => Math.round(v * scale * 100) / 100);
  const diff = Math.round((100 - normalized.reduce((s, v) => s + v, 0)) * 100) / 100;
  if (normalized.length > 0 && diff !== 0) {
    normalized[0] = Math.round(Math.max(0, Math.min(100, normalized[0] + diff)) * 100) / 100;
  }
  return normalized;
}

function normalizeCharacterPair(source: unknown, target: unknown): [string, string] | null {
  const first = cleanText(source as string, 80);
  const second = cleanText(target as string, 80);
  if (!first || !second || first === second) return null;
  return [first, second].sort() as [string, string];
}

function normalizeRelationTags(...values: unknown[]): string[] | null {
  const results: string[] = [];
  for (const value of values) {
    const candidates = Array.isArray(value) ? value : [value];
    for (const item of candidates) {
      const rawTag = cleanText(item as string, 80);
      if (!rawTag) continue;
      const fragments = rawTag.split(/[\\/|｜；;，,、]+/).map(f => cleanText(f, 80)).filter(Boolean);
      for (const candidate of fragments) {
        const tag = canonicalizeRelationTag(candidate);
        if (tag && !results.includes(tag)) results.push(tag);
      }
    }
  }
  return results.length > 0 ? results : null;
}

function canonicalizeRelationTag(tag: string): string {
  let cleaned = cleanText(tag.replace(/[(（][^)）]{0,20}[)）]/g, ''), 80);
  cleaned = cleaned.replace(/^(疑似|疑为|疑|可能是|可能为|可能|似乎是|似乎|或为|像是|看似|表面上)/, '');
  const compact = cleaned.replace(/\s+/g, '');
  if (!compact) return '';
  for (const [canonical, patterns] of RELATION_TAG_CANONICAL_PATTERNS) {
    if (patterns.some(p => compact.includes(p))) return canonical;
  }
  return compact;
}

function buildLocalRelationshipGraphMap(raw: Array<Record<string, unknown>>): Map<string, Record<string, unknown>> {
  const results = new Map<string, Record<string, unknown>>();
  for (const item of raw) {
    const pair = normalizeCharacterPair(item.source, item.target);
    if (!pair) continue;
    results.set(`${pair[0]}::${pair[1]}`, item);
  }
  return results;
}

function buildOverviewRelationshipMap(raw: Array<Record<string, unknown>>): Map<string, Record<string, unknown>> {
  const results = new Map<string, Record<string, unknown>>();
  for (const item of raw) {
    const pair = normalizeCharacterPair(item.source, item.target);
    if (!pair) continue;
    const key = `${pair[0]}::${pair[1]}`;
    let target = results.get(key);
    if (!target) {
      target = { source: pair[0], target: pair[1], relationTags: [] as string[], description: '' };
      results.set(key, target);
    }
    for (const tag of normalizeRelationTags(item.relationTags, item.type) || []) {
      if (!(target.relationTags as string[]).includes(tag) && (target.relationTags as string[]).length < 6) {
        (target.relationTags as string[]).push(tag);
      }
    }
    const description = cleanText(item.description as string, 280);
    if (description && description.length > (target.description as string).length) {
      target.description = description;
    }
  }
  return results;
}

function selectCharacterGraphNames(
  allCharacterStats: Array<Record<string, unknown>>,
  overviewCharacterStats: Array<Record<string, unknown>>,
  relationshipGraph: Array<Record<string, unknown>>,
  limit = 14,
): string[] {
  const orderedNames: string[] = [];
  const append = (name: unknown) => {
    const normalized = cleanText(name as string, 80);
    if (!normalized || orderedNames.includes(normalized) || orderedNames.length >= limit) return;
    orderedNames.push(normalized);
  };
  for (const item of overviewCharacterStats.slice(0, 8)) {
    if (typeof item === 'object' && item !== null) append((item as Record<string, unknown>).name);
  }
  for (const edge of relationshipGraph) {
    if (orderedNames.length >= limit) break;
    if (typeof edge !== 'object' || edge === null) continue;
    append((edge as Record<string, unknown>).source);
    append((edge as Record<string, unknown>).target);
  }
  for (const item of allCharacterStats) {
    if (orderedNames.length >= limit) break;
    if (typeof item === 'object' && item !== null) append((item as Record<string, unknown>).name);
  }
  return orderedNames;
}

function buildCharacterGraphNodeDescription(
  name: string, role: string, sharePercent: number, _chapterCount: number,
  relatedEdges: Array<Record<string, unknown>>,
): string {
  const counterpartNames: string[] = [];
  const relationTags: string[] = [];
  for (const edge of relatedEdges.sort((a, b) => (b.weight as number) - (a.weight as number))) {
    const counterpart = edge.source === name ? edge.target : edge.source;
    const counterpartName = cleanText(counterpart as string, 80);
    if (counterpartName && !counterpartNames.includes(counterpartName) && counterpartNames.length < 3) {
      counterpartNames.push(counterpartName);
    }
    for (const tag of normalizeRelationTags(edge.relationTags, edge.type) || []) {
      if (!relationTags.includes(tag) && relationTags.length < 4) relationTags.push(tag);
    }
  }
  const fragments = [`${name}${role ? `以${role}身份参与主要剧情` : '在故事里占有一席之地'}`];
  if (sharePercent >= 15) fragments.push('是推动主线的重要人物');
  else if (sharePercent >= 7) fragments.push('会持续影响关键情节的发展');
  else if (sharePercent > 0) fragments.push('会在重要情节里带来明显影响');
  if (counterpartNames.length > 0) {
    if (relationTags.length > 0) {
      fragments.push(`与${counterpartNames.join('、')}之间的${relationTags.join('、')}，构成了最值得关注的关系线`);
    } else {
      fragments.push(`与${counterpartNames.join('、')}的互动是理解这个人物的关键`);
    }
  }
  return cleanText(`${fragments.join('，')}。`, 220);
}

function buildCharacterGraphEdgeDescription(
  source: string, target: string, relationTags: string[], _chapterCount: number, mentionCount: number,
): string {
  const fragments = [`${source}和${target}之间的关系是故事里的重要线索`];
  if (relationTags.length > 0) fragments.push(`整体更接近${relationTags.join('、')}`);
  else fragments.push('会持续影响彼此的选择');
  if (mentionCount >= 8) fragments.push('这条关系会在多段情节中反复推动剧情');
  else if (mentionCount >= 3) fragments.push('这条关系会在关键时刻左右剧情走向');
  else fragments.push('这条关系会对人物冲突和选择产生影响');
  return cleanText(`${fragments.join('，')}。`, 260);
}

function extractJsonObject(content: string): Record<string, unknown> {
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
  } catch { /* ignore */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  throw new AnalysisExecutionError('AI 返回内容不是合法 JSON。');
}

function extractErrorMessage(detail: string): string {
  try {
    const parsed = JSON.parse(detail);
    if (typeof parsed === 'object' && parsed !== null) {
      if (typeof parsed.error === 'object' && parsed.error !== null) {
        return (parsed.error as Record<string, unknown>).message as string || detail;
      }
      if (parsed.error) return String(parsed.error);
    }
  } catch { /* ignore */ }
  return detail.slice(0, 300) || '未知错误';
}

function isList(raw: unknown): boolean {
  return Array.isArray(raw);
}

export function normalizeBaseUrl(value: unknown): string {
  const url = cleanText(value as string, 512);
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    throw new AnalysisConfigError('AI 接口地址必须以 http:// 或 https:// 开头。');
  }
  return url.replace(/\/+$/, '');
}

export function cleanText(value: unknown, maxLength?: number): string {
  if (value === null || value === undefined) return '';
  let text = String(value).trim();
  text = text.replace(/\s+/g, ' ');
  if (maxLength !== undefined) text = text.slice(0, maxLength);
  return text;
}

function coerceContextSize(value: unknown, defaultVal: number): number {
  const contextSize = Number(value);
  if (!Number.isFinite(contextSize)) throw new AnalysisConfigError('上下文大小必须是整数。');
  return contextSize || defaultVal;
}

function coerceWeight(value: unknown): number {
  const weight = Number(value);
  if (!Number.isFinite(weight)) return 0;
  return Math.max(0, Math.min(weight, 100));
}

function estimatePromptBudget(text: string): number {
  return new TextEncoder().encode(text).length;
}
