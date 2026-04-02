import type { EntityTable } from 'dexie';

import type {
  AnalysisCharacter,
  AnalysisRelationship,
} from '@shared/contracts';

export interface AnalysisJobRecord {
  id: number;
  novelId: number;
  status: string;
  totalChapters: number;
  analyzedChapters: number;
  totalChunks: number;
  completedChunks: number;
  currentChunkIndex: number;
  pauseRequested: boolean;
  lastError: string;
  startedAt: string | null;
  completedAt: string | null;
  lastHeartbeat: string | null;
  updatedAt: string;
}

export interface AnalysisChunkRecord {
  id: number;
  novelId: number;
  chunkIndex: number;
  startChapterIndex: number;
  endChapterIndex: number;
  chapterIndices: number[];
  status: string;
  chunkSummary: string;
  errorMessage: string;
  updatedAt: string;
}

export interface ChapterAnalysisRecord {
  id: number;
  novelId: number;
  chapterIndex: number;
  chapterTitle: string;
  summary: string;
  keyPoints: string[];
  characters: AnalysisCharacter[];
  relationships: AnalysisRelationship[];
  tags: string[];
  chunkIndex: number;
  updatedAt: string;
}

export interface AnalysisOverviewCharacterStatRecord {
  name: string;
  role: string;
  description: string;
  weight: number;
  sharePercent: number;
  chapters: number[];
  chapterCount: number;
}

export interface AnalysisOverviewRelationshipRecord {
  source: string;
  target: string;
  type: string;
  relationTags: string[];
  description: string;
  weight?: number;
  mentionCount?: number;
  chapterCount?: number;
  chapters?: number[];
}

export interface AnalysisOverviewRecord {
  id: number;
  novelId: number;
  bookIntro: string;
  globalSummary: string;
  themes: string[];
  characterStats: AnalysisOverviewCharacterStatRecord[];
  relationshipGraph: AnalysisOverviewRelationshipRecord[];
  totalChapters: number;
  analyzedChapters: number;
  updatedAt: string;
}

export const ANALYSIS_DB_SCHEMA = {
  analysisJobs: '++id, novelId',
  analysisChunks: '++id, novelId, [novelId+chunkIndex]',
  chapterAnalyses: '++id, novelId, [novelId+chapterIndex]',
  analysisOverviews: '++id, novelId',
} as const;

export interface AnalysisTables {
  analysisJobs: EntityTable<AnalysisJobRecord, 'id'>;
  analysisChunks: EntityTable<AnalysisChunkRecord, 'id'>;
  chapterAnalyses: EntityTable<ChapterAnalysisRecord, 'id'>;
  analysisOverviews: EntityTable<AnalysisOverviewRecord, 'id'>;
}
