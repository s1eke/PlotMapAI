import { describe, expect, it } from 'vitest';

import { AnalysisExecutionError } from '../analysis/errors';
import { normalizeChunkResult, normalizeOverviewResult, normalizeSingleChapterResult } from '../analysis/parsers';
import type { AnalysisAggregates, AnalysisChunkPayload } from '../analysis/types';

describe('analysis parsers', () => {
  it('rejects chunk results with mismatched chapter indices', () => {
    const chunk: AnalysisChunkPayload = {
      chunkIndex: 0,
      chapterIndices: [0],
      startChapterIndex: 0,
      endChapterIndex: 0,
      contentLength: 10,
      chapters: [
        { chapterIndex: 0, title: 'Ch1', content: 'body', text: 'body', length: 10 },
      ],
      text: 'body',
    };

    expect(() => normalizeChunkResult({
      chapterAnalyses: [
        {
          chapterIndex: 1,
          title: 'Ch2',
          summary: 'summary',
          keyPoints: [],
          tags: [],
          characters: [],
          relationships: [],
        },
      ],
    }, chunk)).toThrow(new AnalysisExecutionError('AI 返回了不属于当前块的章节索引：1。'));
  });

  it('normalizes valid chunk analysis data', () => {
    const chunk: AnalysisChunkPayload = {
      chunkIndex: 0,
      chapterIndices: [0],
      startChapterIndex: 0,
      endChapterIndex: 0,
      contentLength: 10,
      chapters: [
        { chapterIndex: 0, title: 'Ch1', content: 'body', text: 'body', length: 10 },
      ],
      text: 'body',
    };

    const result = normalizeChunkResult({
      chunkSummary: 'done',
      chapterAnalyses: [
        {
          chapterIndex: 0,
          title: 'Ch1',
          summary: ' summary ',
          keyPoints: ['a', 'a'],
          tags: ['成长'],
          characters: [{ name: 'Alice', role: '主角', description: 'hero', weight: 88 }],
          relationships: [{ source: 'Alice', target: 'Bob', type: '盟友', description: 'friend', weight: 50 }],
        },
      ],
    }, chunk);

    expect(result.chunkSummary).toBe('done');
    expect(result.chapterAnalyses[0]).toMatchObject({
      chapterIndex: 0,
      title: 'Ch1',
      summary: 'summary',
      keyPoints: ['a'],
      tags: ['成长'],
    });
  });

  it('accepts one-based single chapter index and remaps it to the requested internal index', () => {
    const result = normalizeSingleChapterResult({
      chapterAnalyses: [
        {
          chapterIndex: 543,
          title: 'Ch543',
          summary: 'summary',
          keyPoints: [],
          tags: [],
          characters: [],
          relationships: [],
        },
      ],
    }, {
      chapterIndex: 542,
      title: 'Ch543',
    });

    expect(result.chapterAnalyses[0].chapterIndex).toBe(542);
  });

  it('rescales overview sharePercent and falls back to local relation tags', () => {
    const aggregates: AnalysisAggregates = {
      chapters: [],
      themes: ['成长'],
      characterStats: [
        {
          name: 'Alice',
          role: '主角',
          description: 'hero',
          descriptionFragments: [],
          weight: 80,
          sharePercent: 50,
          chapters: [0],
          chapterCount: 1,
        },
        {
          name: 'Bob',
          role: '配角',
          description: 'friend',
          descriptionFragments: [],
          weight: 60,
          sharePercent: 50,
          chapters: [0],
          chapterCount: 1,
        },
      ],
      allCharacterStats: [
        {
          name: 'Alice',
          role: '主角',
          description: 'hero',
          descriptionFragments: [],
          weight: 80,
          sharePercent: 50,
          chapters: [0],
          chapterCount: 1,
        },
        {
          name: 'Bob',
          role: '配角',
          description: 'friend',
          descriptionFragments: [],
          weight: 60,
          sharePercent: 50,
          chapters: [0],
          chapterCount: 1,
        },
      ],
      relationshipGraph: [
        {
          source: 'Alice',
          target: 'Bob',
          type: '朋友',
          relationTags: ['朋友'],
          weight: 60,
          mentionCount: 2,
          chapterCount: 1,
          chapters: [0],
          description: 'friends',
          descriptionFragments: [],
        },
      ],
      allRelationshipGraph: [
        {
          source: 'Alice',
          target: 'Bob',
          type: '朋友',
          relationTags: ['朋友'],
          weight: 60,
          mentionCount: 2,
          chapterCount: 1,
          chapters: [0],
          description: 'friends',
          descriptionFragments: [],
        },
      ],
      analyzedChapters: 1,
    };

    const result = normalizeOverviewResult({
      bookIntro: 'intro',
      globalSummary: 'summary',
      themes: ['成长'],
      characterStats: [
        { name: 'Alice', role: '主角', description: 'hero', sharePercent: 90 },
        { name: 'Bob', role: '配角', description: 'friend', sharePercent: 90 },
      ],
      relationshipGraph: [
        { source: 'Alice', target: 'Bob', description: 'bond' },
      ],
    }, aggregates, 1);

    expect(result.characterStats[0].sharePercent + result.characterStats[1].sharePercent).toBe(100);
    expect(result.relationshipGraph[0].relationTags).toEqual(['朋友']);
  });
});
