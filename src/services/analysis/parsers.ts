import type { AnalysisAggregates, AnalysisChapterResult, AnalysisCharacter, AnalysisChunkPayload, AnalysisRelationship, ChunkAnalysisResult, OverviewAnalysisResult, OverviewRelationship } from './types';
import { AnalysisExecutionError } from './errors';
import { buildOverviewRelationshipMap, normalizeCharacterPair, normalizeRelationTags } from './relationships';
import { cleanText, coerceWeight } from './text';

export function normalizeChunkResult(
  raw: Record<string, unknown>,
  chunk: AnalysisChunkPayload,
): ChunkAnalysisResult {
  const rawItems = raw.chapterAnalyses;
  if (!Array.isArray(rawItems)) {
    throw new AnalysisExecutionError('AI 返回缺少 chapterAnalyses 数组。');
  }

  const expectedIndices = new Set(chunk.chapters.map(chapter => chapter.chapterIndex));
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

  const results: AnalysisChapterResult[] = [];
  for (const chapter of chunk.chapters) {
    const item = rawMap.get(chapter.chapterIndex);
    if (!item) {
      throw new AnalysisExecutionError(`AI 返回缺少第 ${chapter.chapterIndex + 1} 章的分析结果。`);
    }
    results.push(normalizeChapterAnalysis(item, chapter.chapterIndex, chapter.title, `第 ${chapter.chapterIndex + 1} 章`));
  }

  return {
    chunkSummary: cleanText(raw.chunkSummary, 500) || '该章节块分析已完成。',
    chapterAnalyses: results,
  };
}

export function normalizeSingleChapterResult(
  raw: Record<string, unknown>,
  chapter: { chapterIndex: number; title: string },
): ChunkAnalysisResult {
  const rawItems = raw.chapterAnalyses;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new AnalysisExecutionError('AI 返回缺少 chapterAnalyses 数组。');
  }
  const item = rawItems[0];
  if (typeof item !== 'object' || item === null) {
    throw new AnalysisExecutionError('AI 返回的 chapterAnalyses 项不是对象。');
  }
  const itemRecord = item as Record<string, unknown>;
  const normalizedChapterIndex = normalizeSingleChapterIndex(itemRecord.chapterIndex, chapter.chapterIndex);
  if (normalizedChapterIndex === null) {
    throw new AnalysisExecutionError(`AI 返回的 chapterIndex (${itemRecord.chapterIndex}) 与请求的 (${chapter.chapterIndex}) 不一致。`);
  }
  return {
    chunkSummary: '单章分析',
    chapterAnalyses: [normalizeChapterAnalysis(itemRecord, normalizedChapterIndex, chapter.title, '本章')],
  };
}

export function normalizeOverviewResult(
  raw: Record<string, unknown>,
  aggregates: AnalysisAggregates,
  totalChapters: number,
): OverviewAnalysisResult {
  const bookIntro = cleanText(raw.bookIntro, 400);
  const globalSummary = cleanText(raw.globalSummary, 2400);
  if (!bookIntro) throw new AnalysisExecutionError('AI 返回的 bookIntro 为空。');
  if (!globalSummary) throw new AnalysisExecutionError('AI 返回的 globalSummary 为空。');
  if (!Array.isArray(raw.themes)) throw new AnalysisExecutionError('AI 返回缺少有效的 themes 数组。');
  if (!Array.isArray(raw.characterStats)) throw new AnalysisExecutionError('AI 返回缺少有效的 characterStats 数组。');
  if (!Array.isArray(raw.relationshipGraph)) throw new AnalysisExecutionError('AI 返回缺少有效的 relationshipGraph 数组。');

  const localCharacterMap = new Map<string, Record<string, unknown>>();
  for (const item of aggregates.allCharacterStats) {
    localCharacterMap.set(item.name, item as unknown as Record<string, unknown>);
  }

  const localRelationshipMap = buildOverviewRelationshipMap(
    aggregates.allRelationshipGraph as unknown as Array<Record<string, unknown>>,
  );

  const characterStats: OverviewAnalysisResult['characterStats'] = [];
  const seenNames = new Set<string>();
  const rawSharePercents: number[] = [];

  for (const item of (raw.characterStats as Array<unknown>).slice(0, 8)) {
    if (typeof item !== 'object' || item === null) {
      throw new AnalysisExecutionError('AI 返回的 characterStats 项不是对象。');
    }
    const obj = item as Record<string, unknown>;
    const name = cleanText(obj.name, 80);
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
      role: cleanText(obj.role, 80) || cleanText(localItem.role, 80),
      description: cleanText(obj.description, 200) || cleanText(localItem.description, 200),
      weight: Number(localItem.weight) || 0,
      sharePercent,
      chapters: (localItem.chapters as number[]) || [],
      chapterCount: Number(localItem.chapterCount) || 0,
    });
  }

  if (localCharacterMap.size > 0 && characterStats.length === 0) {
    throw new AnalysisExecutionError('AI 返回的核心角色列表为空。');
  }

  const normalizedSharePercents = normalizeSharePercentValues(rawSharePercents);
  for (let index = 0; index < normalizedSharePercents.length; index++) {
    characterStats[index].sharePercent = normalizedSharePercents[index];
  }
  characterStats.sort((a, b) =>
    b.sharePercent - a.sharePercent ||
    b.weight - a.weight ||
    a.name.localeCompare(b.name),
  );

  const relationshipGraph: OverviewRelationship[] = [];
  const seenPairs = new Set<string>();
  for (const item of (raw.relationshipGraph as Array<unknown>).slice(0, 24)) {
    if (typeof item !== 'object' || item === null) {
      throw new AnalysisExecutionError('AI 返回的 relationshipGraph 项不是对象。');
    }
    const obj = item as Record<string, unknown>;
    const pair = normalizeCharacterPair(obj.source, obj.target);
    if (!pair) continue;
    const pairKey = `${pair[0]}::${pair[1]}`;
    if (seenPairs.has(pairKey)) continue;
    const [source, target] = pair;
    const missingNames = [source, target].filter(name => !localCharacterMap.has(name));
    if (missingNames.length > 0) continue;
    const localEdge = localRelationshipMap.get(pairKey) || {};
    let relationTags = normalizeRelationTags(obj.relationTags, obj.type);
    if (!relationTags) {
      relationTags = normalizeRelationTags(localEdge.relationTags, localEdge.type);
    }
    if (!relationTags) throw new AnalysisExecutionError(`AI 返回的关系 ${source} / ${target} 缺少有效的 relationTags。`);
    relationshipGraph.push({
      source,
      target,
      type: relationTags[0],
      relationTags: relationTags.slice(0, 6),
      description: cleanText(obj.description, 280) || cleanText(localEdge.description, 280),
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
    analyzedChapters: aggregates.analyzedChapters,
  };
}

function normalizeChapterAnalysis(
  item: Record<string, unknown>,
  chapterIndex: number,
  fallbackTitle: string,
  label: string,
): AnalysisChapterResult {
  if (!cleanText(item.summary, 400)) {
    throw new AnalysisExecutionError(`AI 返回的${label} summary 为空。`);
  }
  for (const field of ['keyPoints', 'tags', 'characters', 'relationships']) {
    if (!Array.isArray(item[field])) {
      throw new AnalysisExecutionError(`AI 返回的${label}缺少有效的 ${field} 数组。`);
    }
  }
  return {
    chapterIndex,
    title: cleanText(item.title, 256) || fallbackTitle,
    summary: cleanText(item.summary, 400),
    keyPoints: normalizeStringList(item.keyPoints, 8, 120),
    tags: normalizeStringList(item.tags, 8, 40),
    characters: normalizeCharacterList(item.characters),
    relationships: normalizeRelationshipList(item.relationships),
  };
}

function normalizeCharacterList(value: unknown): AnalysisCharacter[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 20)
    .filter(item => typeof item === 'object' && item !== null)
    .map(item => {
      const obj = item as Record<string, unknown>;
      const name = cleanText(obj.name, 80);
      if (!name) return null;
      return {
        name,
        role: cleanText(obj.role, 80),
        description: cleanText(obj.description, 200),
        weight: coerceWeight(obj.weight),
      };
    })
    .filter(Boolean) as AnalysisCharacter[];
}

function normalizeRelationshipList(value: unknown): AnalysisRelationship[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 20)
    .filter(item => typeof item === 'object' && item !== null)
    .map(item => {
      const obj = item as Record<string, unknown>;
      const source = cleanText(obj.source, 80);
      const target = cleanText(obj.target, 80);
      if (!source || !target || source === target) return null;
      return {
        source,
        target,
        type: cleanText(obj.type, 80) || '未分类',
        description: cleanText(obj.description, 160),
        weight: coerceWeight(obj.weight),
      };
    })
    .filter(Boolean) as AnalysisRelationship[];
}

function normalizeStringList(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const results: string[] = [];
  for (const item of value.slice(0, limit)) {
    const text = cleanText(item, maxLength);
    if (text && !results.includes(text)) results.push(text);
  }
  return results;
}

function normalizeSharePercentValues(values: number[]): number[] {
  if (!values.length) return [];
  const sanitized = values.map(value => Math.max(0, Math.min(value, 100)));
  const total = sanitized.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return sanitized.map(() => 0);
  if (total <= 100) return sanitized.map(value => Math.round(value * 100) / 100);
  const scale = 100 / total;
  const normalized = sanitized.map(value => Math.round(value * scale * 100) / 100);
  const diff = Math.round((100 - normalized.reduce((sum, value) => sum + value, 0)) * 100) / 100;
  if (normalized.length > 0 && diff !== 0) {
    normalized[0] = Math.round(Math.max(0, Math.min(100, normalized[0] + diff)) * 100) / 100;
  }
  return normalized;
}

function normalizeSingleChapterIndex(rawIndex: unknown, requestedIndex: number): number | null {
  const parsedIndex = Number(rawIndex);
  if (!Number.isInteger(parsedIndex)) return null;
  if (parsedIndex === requestedIndex) return requestedIndex;
  if (parsedIndex === requestedIndex + 1) return requestedIndex;
  return null;
}
