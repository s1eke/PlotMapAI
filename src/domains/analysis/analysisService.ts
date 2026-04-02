import type { Chapter as DbChapter } from '@infra/db';
import type {
  AnalysisOverview,
  AnalysisStatusResponse,
  ChapterAnalysisResult,
  CharacterGraphResponse,
} from '@shared/contracts';

import type { RuntimeAnalysisConfig } from './services/types';
import {
  analyzeSingleChapter,
  getAnalysisStatus,
  getChapterAnalysis as getChapterAnalysisRecord,
  getCharacterGraph as getCharacterGraphRecord,
  getOverview as getOverviewRecord,
  initializeAnalysisRuntime,
  pauseAnalysis,
  refreshOverview,
  restartAnalysis,
  resumeAnalysis,
  startAnalysis,
} from './runtime/orchestrator';

export interface AnalysisExecutionContext {
  chapters: DbChapter[];
  novelId: number;
  novelTitle: string;
  runtimeConfig: RuntimeAnalysisConfig;
}

export interface AnalyzeSingleChapterInput extends AnalysisExecutionContext {
  chapterIndex: number;
}

export const analysisService = {
  analyzeChapter: async (
    input: AnalyzeSingleChapterInput,
  ): Promise<{ analysis: ChapterAnalysisResult | null }> => {
    const analysis = await analyzeSingleChapter(input);
    return { analysis };
  },

  getChapterAnalysis: async (
    novelId: number,
    chapterIndex: number,
  ): Promise<{ analysis: ChapterAnalysisResult | null }> => {
    return getChapterAnalysisRecord(novelId, chapterIndex);
  },

  getCharacterGraph: (
    novelId: number,
    chapters: DbChapter[],
  ): Promise<CharacterGraphResponse> => {
    return getCharacterGraphRecord(novelId, chapters);
  },

  getOverview: async (novelId: number): Promise<{ overview: AnalysisOverview | null }> => {
    return getOverviewRecord(novelId);
  },

  getStatus: (novelId: number): Promise<AnalysisStatusResponse> => {
    return getAnalysisStatus(novelId);
  },

  initialize: (): Promise<void> => {
    return initializeAnalysisRuntime();
  },

  pause: (novelId: number): Promise<AnalysisStatusResponse> => {
    return pauseAnalysis(novelId);
  },

  refreshOverview: (input: AnalysisExecutionContext): Promise<AnalysisStatusResponse> => {
    return refreshOverview(input);
  },

  restart: (input: AnalysisExecutionContext): Promise<AnalysisStatusResponse> => {
    return restartAnalysis(input);
  },

  resume: (input: AnalysisExecutionContext): Promise<AnalysisStatusResponse> => {
    return resumeAnalysis(input);
  },

  start: (input: AnalysisExecutionContext): Promise<AnalysisStatusResponse> => {
    return startAnalysis(input);
  },
};
