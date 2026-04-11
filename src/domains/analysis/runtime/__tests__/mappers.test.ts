import { describe, expect, it } from 'vitest';

import type {
  AnalysisChunkRecord,
  AnalysisJobRecord,
  AnalysisOverviewRecord,
  ChapterAnalysisRecord,
} from '@infra/db/analysis';

import {
  toAnalysisChunkRecord,
  toAnalysisChunkState,
  toAnalysisJobRecord,
  toAnalysisJobState,
  toAnalysisOverviewRecord,
  toStoredAnalysisOverview,
  toStoredChapterAnalysis,
  toChapterAnalysisRecord,
} from '../mappers';

describe('analysis runtime mappers', () => {
  it('round-trips job and chunk state through persistence records', () => {
    const jobRecord: AnalysisJobRecord = {
      id: 1,
      novelId: 7,
      status: 'paused',
      totalChapters: 12,
      analyzedChapters: 5,
      totalChunks: 4,
      completedChunks: 2,
      currentChunkIndex: 2,
      pauseRequested: false,
      lastError: '',
      startedAt: '2026-04-01T00:00:00.000Z',
      completedAt: null,
      lastHeartbeat: '2026-04-01T01:00:00.000Z',
      updatedAt: '2026-04-01T01:00:00.000Z',
    };
    const chunkRecord: AnalysisChunkRecord = {
      id: 3,
      novelId: 7,
      chunkIndex: 1,
      startChapterIndex: 3,
      endChapterIndex: 5,
      chapterIndices: [3, 4, 5],
      status: 'completed',
      chunkSummary: 'done',
      errorMessage: '',
      updatedAt: '2026-04-01T01:00:00.000Z',
    };

    expect(toAnalysisJobRecord(toAnalysisJobState(jobRecord))).toEqual(jobRecord);
    expect(toAnalysisChunkRecord(toAnalysisChunkState(chunkRecord))).toEqual(chunkRecord);
  });

  it('round-trips chapter and overview records through stored runtime types', () => {
    const chapterRecord: ChapterAnalysisRecord = {
      id: 9,
      novelId: 7,
      chapterIndex: 2,
      chapterTitle: 'Chapter 3',
      summary: 'summary',
      keyPoints: ['point'],
      characters: [{ name: 'Alice', role: 'lead', description: 'hero', weight: 1 }],
      relationships: [],
      tags: ['mystery'],
      chunkIndex: 0,
      updatedAt: '2026-04-01T01:00:00.000Z',
    };
    const overviewRecord: AnalysisOverviewRecord = {
      id: 4,
      novelId: 7,
      bookIntro: 'intro',
      globalSummary: 'summary',
      themes: ['theme'],
      characterStats: [{
        name: 'Alice',
        role: 'lead',
        description: 'hero',
        weight: 1,
        sharePercent: 100,
        chapters: [2],
        chapterCount: 1,
      }],
      relationshipGraph: [{
        source: 'Alice',
        target: 'Bob',
        type: 'ally',
        relationTags: ['ally'],
        description: 'friends',
      }],
      totalChapters: 12,
      analyzedChapters: 12,
      updatedAt: '2026-04-01T01:00:00.000Z',
    };

    expect(toChapterAnalysisRecord(toStoredChapterAnalysis(chapterRecord))).toEqual(chapterRecord);
    expect(toAnalysisOverviewRecord(toStoredAnalysisOverview(overviewRecord))).toEqual(
      overviewRecord,
    );
  });
});
