import type { AnalysisOverview, Chapter, ChapterAnalysis } from '../db';
import type { AnalysisAggregates, CharacterGraphPayload, SerializedChapterAnalysis, SerializedOverview } from './types';
import { cleanText, coerceWeight } from './text';
import { buildLocalRelationshipGraphMap, buildOverviewRelationshipMap, normalizeCharacterPair, normalizeRelationTags } from './relationships';

interface CharacterAccumulator {
  name: string;
  weight: number;
  chapters: Set<number>;
  roles: Map<string, number>;
  descriptions: string[];
}

interface RelationshipAccumulator {
  source: string;
  target: string;
  weight: number;
  mentionCount: number;
  descriptions: string[];
  chapters: Set<number>;
  relationTypes: Map<string, number>;
}

export function isChapterAnalysisComplete(row: ChapterAnalysis | undefined): boolean {
  if (!row) return false;
  if (!cleanText(row.summary, 400)) return false;
  return [row.keyPoints, row.characters, row.relationships, row.tags].every(Array.isArray);
}

export function isOverviewComplete(overview: AnalysisOverview | undefined, totalChapters: number): boolean {
  if (!overview) return false;
  if (totalChapters <= 0) return false;
  if (!cleanText(overview.bookIntro, 400)) return false;
  if (!cleanText(overview.globalSummary, 2000)) return false;
  if (overview.analyzedChapters < totalChapters || overview.totalChapters < totalChapters) return false;
  return [overview.themes, overview.characterStats, overview.relationshipGraph].every(Array.isArray);
}

export function serializeOverview(overview: AnalysisOverview | undefined): SerializedOverview | null {
  if (!overview) return null;
  return {
    bookIntro: overview.bookIntro,
    globalSummary: overview.globalSummary,
    themes: overview.themes,
    characterStats: overview.characterStats as unknown as SerializedOverview['characterStats'],
    relationshipGraph: overview.relationshipGraph as unknown as SerializedOverview['relationshipGraph'],
    totalChapters: overview.totalChapters,
    analyzedChapters: overview.analyzedChapters,
    updatedAt: overview.updatedAt,
  };
}

export function serializeChapterAnalysis(row: ChapterAnalysis | undefined): SerializedChapterAnalysis | null {
  if (!row) return null;
  return {
    chapterIndex: row.chapterIndex,
    chapterTitle: row.chapterTitle,
    summary: row.summary,
    keyPoints: row.keyPoints,
    characters: row.characters as unknown as SerializedChapterAnalysis['characters'],
    relationships: row.relationships as unknown as SerializedChapterAnalysis['relationships'],
    tags: row.tags,
    chunkIndex: row.chunkIndex,
    updatedAt: row.updatedAt,
  };
}

export function collectAnalysisAggregates(chapterRows: ChapterAnalysis[]): AnalysisAggregates {
  const themeCounter = new Map<string, number>();
  const characterMap = new Map<string, CharacterAccumulator>();
  const relationshipMap = new Map<string, RelationshipAccumulator>();
  const chaptersPayload: AnalysisAggregates['chapters'] = [];

  for (const row of chapterRows) {
    chaptersPayload.push({
      chapterIndex: row.chapterIndex,
      chapterTitle: row.chapterTitle,
      summary: row.summary,
      keyPoints: row.keyPoints,
      tags: row.tags,
      characters: row.characters as unknown as AnalysisAggregates['chapters'][number]['characters'],
      relationships: row.relationships as unknown as AnalysisAggregates['chapters'][number]['relationships'],
    });

    for (const tag of row.tags) {
      if (typeof tag === 'string' && tag.trim()) {
        themeCounter.set(tag.trim(), (themeCounter.get(tag.trim()) || 0) + 1);
      }
    }

    for (const item of row.characters) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;
      const name = cleanText(obj.name, 80);
      if (!name) continue;
      const weight = coerceWeight(obj.weight);
      const role = cleanText(obj.role, 80);
      const description = cleanText(obj.description, 200);
      let target = characterMap.get(name);
      if (!target) {
        target = { name, weight: 0, chapters: new Set<number>(), roles: new Map<string, number>(), descriptions: [] };
        characterMap.set(name, target);
      }
      target.weight += weight;
      target.chapters.add(row.chapterIndex);
      if (role) {
        target.roles.set(role, (target.roles.get(role) || 0) + Math.max(weight, 1));
      }
      if (description && !target.descriptions.includes(description) && target.descriptions.length < 6) {
        target.descriptions.push(description);
      }
    }

    for (const item of row.relationships) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;
      const source = cleanText(obj.source, 80);
      const targetName = cleanText(obj.target, 80);
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
          descriptions: [],
          chapters: new Set<number>(),
          relationTypes: new Map<string, number>(),
        };
        relationshipMap.set(key, edge);
      }
      edge.weight += relationWeight;
      edge.mentionCount += 1;
      edge.chapters.add(row.chapterIndex);
      for (const tag of relationTags) {
        edge.relationTypes.set(tag, (edge.relationTypes.get(tag) || 0) + Math.max(relationWeight, 1));
      }
      const description = cleanText(obj.description, 160);
      if (description && !edge.descriptions.includes(description) && edge.descriptions.length < 6) {
        edge.descriptions.push(description);
      }
    }
  }

  const totalWeight = Array.from(characterMap.values()).reduce((sum, item) => sum + item.weight, 0) || 1;
  const allCharacterStats = Array.from(characterMap.values())
    .map(item => {
      const topRole = [...item.roles.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      return {
        name: item.name,
        role: topRole?.[0] || '',
        description: item.descriptions[0] || '',
        descriptionFragments: item.descriptions.slice(0, 4),
        weight: Math.round(item.weight * 100) / 100,
        sharePercent: Math.round(item.weight / totalWeight * 10000) / 100,
        chapters: [...item.chapters].sort((a, b) => a - b),
        chapterCount: item.chapters.size,
      };
    })
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));

  const relationshipGraph = Array.from(relationshipMap.values())
    .map(item => {
      const topTypes = [...item.relationTypes.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 6)
        .map(entry => entry[0]);
      return {
        source: item.source,
        target: item.target,
        type: topTypes[0] || '未分类',
        relationTags: topTypes,
        weight: Math.round(item.weight * 100) / 100,
        mentionCount: item.mentionCount,
        chapterCount: item.chapters.size,
        chapters: [...item.chapters].sort((a, b) => a - b),
        description: item.descriptions.slice(0, 3).join('；'),
        descriptionFragments: item.descriptions.slice(0, 4),
      };
    })
    .sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  return {
    chapters: chaptersPayload,
    themes: [...themeCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(entry => entry[0]),
    characterStats: allCharacterStats.slice(0, 20),
    allCharacterStats,
    allRelationshipGraph: relationshipGraph,
    relationshipGraph: relationshipGraph.slice(0, 30),
    analyzedChapters: chapterRows.length,
  };
}

export function buildCharacterGraphPayload(
  chapters: Chapter[],
  chapterRows: ChapterAnalysis[],
  overview: AnalysisOverview | undefined,
): CharacterGraphPayload {
  const totalChapters = chapters.length;
  const overviewPayload = serializeOverview(overview);
  const aggregates = chapterRows.length > 0
    ? collectAnalysisAggregates(chapterRows)
    : { allCharacterStats: [], relationshipGraph: [], analyzedChapters: 0 } as Pick<AnalysisAggregates, 'allCharacterStats' | 'relationshipGraph' | 'analyzedChapters'>;

  const aggregateCharacterMap = new Map<string, Record<string, unknown>>();
  for (const item of aggregates.allCharacterStats) {
    const name = cleanText(item.name, 80);
    if (name) aggregateCharacterMap.set(name, item as unknown as Record<string, unknown>);
  }

  const overviewCharacterStats = (overviewPayload?.characterStats as unknown as Array<Record<string, unknown>>) || [];
  const overviewRelationshipGraph = (overviewPayload?.relationshipGraph as unknown as Array<Record<string, unknown>>) || [];
  const overviewCharacterMap = new Map<string, Record<string, unknown>>();
  for (const item of overviewCharacterStats) {
    const name = cleanText(item.name, 80);
    if (name) overviewCharacterMap.set(name, item);
  }

  const relationshipGraph = (aggregates.relationshipGraph as unknown as Array<Record<string, unknown>>).filter(item => typeof item === 'object');
  const localRelationshipMap = buildLocalRelationshipGraphMap(relationshipGraph);
  const overviewRelationshipMap = buildOverviewRelationshipMap(overviewRelationshipGraph);

  const graphSeedEdges = [...overviewRelationshipGraph, ...relationshipGraph];
  const selectedNames = selectCharacterGraphNames(
    (aggregates.allCharacterStats as unknown as Array<Record<string, unknown>>) || [],
    overviewCharacterStats,
    graphSeedEdges,
  );
  const selectedNameSet = new Set(selectedNames);

  const mergedPairs: Array<[string, string]> = [];
  for (const edge of graphSeedEdges) {
    const pair = normalizeCharacterPair(edge.source, edge.target);
    if (!pair || mergedPairs.some(item => item[0] === pair[0] && item[1] === pair[1])) continue;
    mergedPairs.push(pair);
  }

  const edges = mergedPairs
    .filter(([source, target]) => selectedNameSet.has(source) && selectedNameSet.has(target))
    .map(([source, target]) => {
      const pairKey = `${source}::${target}`;
      const overviewEdge = overviewRelationshipMap.get(pairKey) || {};
      const localEdge = localRelationshipMap.get(pairKey) || {};
      const relationTags = normalizeRelationTags(
        overviewEdge.relationTags, overviewEdge.type,
        localEdge.relationTags, localEdge.type,
      ) || ['未分类'];
      const chapterCount = Number(localEdge.chapterCount) || 0;
      const mentionCount = Number(localEdge.mentionCount) || 0;
      return {
        id: `${source}::${target}`,
        source,
        target,
        type: relationTags[0],
        relationTags,
        description: cleanText(overviewEdge.description, 280)
          || buildCharacterGraphEdgeDescription(source, target, relationTags, chapterCount, mentionCount),
        weight: Math.round((Number(localEdge.weight) || 0) * 100) / 100,
        mentionCount,
        chapterCount,
        chapters: (localEdge.chapters as number[]) || [],
      };
    })
    .sort((a, b) => b.weight - a.weight || b.mentionCount - a.mentionCount);

  const relatedEdgeMap = new Map<string, typeof edges>();
  for (const name of selectedNames) relatedEdgeMap.set(name, []);
  for (const edge of edges) {
    relatedEdgeMap.get(edge.source)?.push(edge);
    relatedEdgeMap.get(edge.target)?.push(edge);
  }

  const nodes = selectedNames.map(name => {
    const aggregateItem = aggregateCharacterMap.get(name) || {};
    const overviewItem = overviewCharacterMap.get(name) || {};
    const role = cleanText(overviewItem.role, 80) || cleanText(aggregateItem.role, 80);
    const sharePercent = Math.round((Number(overviewItem.sharePercent || aggregateItem.sharePercent) || 0) * 100) / 100;
    const chapterCount = Number(aggregateItem.chapterCount) || 0;
    let description = cleanText(overviewItem.description, 220);
    if (!description) {
      description = buildCharacterGraphNodeDescription(
        name,
        role,
        sharePercent,
        chapterCount,
        relatedEdgeMap.get(name) || [],
      );
    }
    return {
      id: name,
      name,
      role,
      description,
      weight: Math.round((Number(aggregateItem.weight) || 0) * 100) / 100,
      sharePercent,
      chapterCount,
      chapters: (aggregateItem.chapters as number[]) || [],
      isCore: overviewCharacterMap.has(name),
    };
  });

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
      analyzedChapters: aggregates.analyzedChapters || 0,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      hasOverview: !!overviewPayload,
      hasData: nodes.length > 0 || edges.length > 0,
      isComplete: isOverviewComplete(overview, totalChapters),
      generatedAt,
    },
  };
}

function selectCharacterGraphNames(
  allCharacterStats: Array<Record<string, unknown>>,
  overviewCharacterStats: Array<Record<string, unknown>>,
  relationshipGraph: Array<Record<string, unknown>>,
  limit = 14,
): string[] {
  const orderedNames: string[] = [];
  const append = (name: unknown) => {
    const normalized = cleanText(name, 80);
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
  name: string,
  role: string,
  sharePercent: number,
  _chapterCount: number,
  relatedEdges: Array<Record<string, unknown>>,
): string {
  const counterpartNames: string[] = [];
  const relationTags: string[] = [];
  for (const edge of relatedEdges.sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0))) {
    const counterpart = edge.source === name ? edge.target : edge.source;
    const counterpartName = cleanText(counterpart, 80);
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
  source: string,
  target: string,
  relationTags: string[],
  _chapterCount: number,
  mentionCount: number,
): string {
  const fragments = [`${source}和${target}之间的关系是故事里的重要线索`];
  if (relationTags.length > 0) fragments.push(`整体更接近${relationTags.join('、')}`);
  else fragments.push('会持续影响彼此的选择');
  if (mentionCount >= 8) fragments.push('这条关系会在多段情节中反复推动剧情');
  else if (mentionCount >= 3) fragments.push('这条关系会在关键时刻左右剧情走向');
  else fragments.push('这条关系会对人物冲突和选择产生影响');
  return cleanText(`${fragments.join('，')}。`, 260);
}
