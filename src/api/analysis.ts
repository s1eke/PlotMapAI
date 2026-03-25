import {
  getAnalysisStatus,
  startAnalysis,
  pauseAnalysis,
  resumeAnalysis,
  restartAnalysis,
  refreshOverview,
  analyzeSingleChapter,
  getCharacterGraph as getCharacterGraphService,
  getChapterAnalysis as getChapterAnalysisService,
  getOverview as getOverviewService,
  initializeAnalysisRuntime,
} from '../services/analysis-runtime/orchestrator';

void initializeAnalysisRuntime().catch(() => {
  // best effort recovery
});

export interface AnalysisCharacter {
  name: string;
  role: string;
  description: string;
  weight: number;
}

export interface AnalysisRelationship {
  source: string;
  target: string;
  type: string;
  description: string;
  weight: number;
}

export interface ChapterAnalysisResult {
  chapterIndex: number;
  chapterTitle: string;
  summary: string;
  keyPoints: string[];
  characters: AnalysisCharacter[];
  relationships: AnalysisRelationship[];
  tags: string[];
  chunkIndex: number;
  updatedAt?: string | null;
}

export interface AnalysisOverview {
  bookIntro: string;
  globalSummary: string;
  themes: string[];
  characterStats: Array<{
    name: string;
    role: string;
    description: string;
    weight: number;
    sharePercent: number;
    chapters: number[];
    chapterCount: number;
  }>;
  relationshipGraph: Array<{
    source: string;
    target: string;
    type: string;
    relationTags?: string[];
    weight?: number;
    mentionCount?: number;
    chapterCount?: number;
    chapters?: number[];
    description: string;
  }>;
  totalChapters: number;
  analyzedChapters: number;
  updatedAt?: string | null;
}

export interface AnalysisChunkStatus {
  chunkIndex: number;
  startChapterIndex: number;
  endChapterIndex: number;
  chapterIndices: number[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  chunkSummary: string;
  errorMessage: string;
  updatedAt?: string | null;
}

export interface AnalysisJobStatus {
  status: 'idle' | 'running' | 'pausing' | 'paused' | 'completed' | 'failed';
  currentStage: 'idle' | 'chapters' | 'overview' | 'completed';
  analysisComplete: boolean;
  totalChapters: number;
  analyzedChapters: number;
  totalChunks: number;
  completedChunks: number;
  currentChunkIndex: number;
  progressPercent: number;
  pauseRequested: boolean;
  lastError: string;
  startedAt?: string | null;
  completedAt?: string | null;
  lastHeartbeat?: string | null;
  updatedAt?: string | null;
  currentChunk?: AnalysisChunkStatus | null;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canRestart: boolean;
}

export interface AnalysisStatusResponse {
  job: AnalysisJobStatus;
  overview: AnalysisOverview | null;
  chunks: AnalysisChunkStatus[];
}

export interface CharacterGraphNode {
  id: string;
  name: string;
  role: string;
  description: string;
  weight: number;
  sharePercent: number;
  chapterCount: number;
  chapters: number[];
  isCore: boolean;
}

export interface CharacterGraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  relationTags: string[];
  description: string;
  weight: number;
  mentionCount: number;
  chapterCount: number;
  chapters: number[];
}

export interface CharacterGraphResponse {
  nodes: CharacterGraphNode[];
  edges: CharacterGraphEdge[];
  meta: {
    totalChapters: number;
    analyzedChapters: number;
    nodeCount: number;
    edgeCount: number;
    hasOverview: boolean;
    hasData: boolean;
    isComplete: boolean;
    generatedAt?: string | null;
  };
}

export const analysisApi = {
  getStatus: (novelId: number): Promise<AnalysisStatusResponse> => {
    return getAnalysisStatus(novelId);
  },

  start: (novelId: number): Promise<AnalysisStatusResponse> => {
    return startAnalysis(novelId);
  },

  pause: (novelId: number): Promise<AnalysisStatusResponse> => {
    return pauseAnalysis(novelId);
  },

  resume: (novelId: number): Promise<AnalysisStatusResponse> => {
    return resumeAnalysis(novelId);
  },

  restart: (novelId: number): Promise<AnalysisStatusResponse> => {
    return restartAnalysis(novelId);
  },

  refreshOverview: (novelId: number): Promise<AnalysisStatusResponse> => {
    return refreshOverview(novelId);
  },

  getOverview: async (novelId: number): Promise<{ overview: AnalysisOverview | null }> => {
    return getOverviewService(novelId);
  },

  getChapterAnalysis: async (novelId: number, chapterIndex: number): Promise<{ analysis: ChapterAnalysisResult | null }> => {
    return getChapterAnalysisService(novelId, chapterIndex);
  },

  analyzeChapter: async (novelId: number, chapterIndex: number): Promise<{ analysis: ChapterAnalysisResult | null }> => {
    const analysis = await analyzeSingleChapter(novelId, chapterIndex);
    return { analysis };
  },

  getCharacterGraph: (novelId: number): Promise<CharacterGraphResponse> => {
    return getCharacterGraphService(novelId);
  },
};
