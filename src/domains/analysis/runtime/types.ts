import type {
  AnalysisChunkStatus,
  AnalysisJobStatus,
  ChapterAnalysisResult,
} from '@shared/contracts';

import type { OverviewCharacterStat, OverviewRelationship } from '../services/types';

export interface AnalysisJobState {
  id: number;
  novelId: number;
  status: AnalysisJobStatus['status'];
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

export interface AnalysisChunkState {
  id: number;
  novelId: number;
  chunkIndex: number;
  startChapterIndex: number;
  endChapterIndex: number;
  chapterIndices: number[];
  status: AnalysisChunkStatus['status'];
  chunkSummary: string;
  errorMessage: string;
  updatedAt: string;
}

export interface StoredChapterAnalysis {
  id: number;
  novelId: number;
  chapterIndex: number;
  chapterTitle: string;
  summary: string;
  keyPoints: string[];
  characters: ChapterAnalysisResult['characters'];
  relationships: ChapterAnalysisResult['relationships'];
  tags: string[];
  chunkIndex: number;
  updatedAt: string;
}

export interface StoredAnalysisOverview {
  id: number;
  novelId: number;
  bookIntro: string;
  globalSummary: string;
  themes: string[];
  characterStats: OverviewCharacterStat[];
  relationshipGraph: OverviewRelationship[];
  totalChapters: number;
  analyzedChapters: number;
  updatedAt: string;
}

export interface LoadedAnalysisRuntimeState {
  job?: AnalysisJobState;
  overview?: StoredAnalysisOverview;
  chunks: AnalysisChunkState[];
  chapterRows: StoredChapterAnalysis[];
  totalChapterCount: number;
}
