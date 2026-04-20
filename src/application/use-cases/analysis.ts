import type { AnalysisStatusResponse } from '@shared/contracts';

import {
  analysisService,
  buildRuntimeAnalysisConfig,
  type AnalysisExecutionContext,
} from '@domains/analysis';
import { novelRepository } from '@domains/library';
import { getAiConfig } from '@domains/settings';

import { projectNovelText } from '@application/read-models/novel-text-projection';

async function loadAnalysisExecutionContext(novelId: number): Promise<AnalysisExecutionContext> {
  const [storedConfig, novel, chapters] = await Promise.all([
    getAiConfig(),
    novelRepository.get(novelId),
    projectNovelText(novelId),
  ]);

  return {
    chapters,
    novelId,
    novelTitle: novel.title,
    runtimeConfig: buildRuntimeAnalysisConfig(storedConfig
      ? {
        providerId: storedConfig.providerId,
        contextSize: storedConfig.contextSize,
        providerConfig: {
          apiBaseUrl: storedConfig.apiBaseUrl,
          apiKey: storedConfig.apiKey,
          modelName: storedConfig.modelName,
        },
      }
      : null),
  };
}

export async function analyzeChapter(
  novelId: number,
  chapterIndex: number,
): Promise<{ analysis: import('@shared/contracts').ChapterAnalysisResult | null }> {
  return analysisService.analyzeChapter({
    chapterIndex,
    ...(await loadAnalysisExecutionContext(novelId)),
  });
}

export async function pauseNovelAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  return analysisService.pause(novelId);
}

export async function refreshAnalysisOverview(
  novelId: number,
): Promise<AnalysisStatusResponse> {
  return analysisService.refreshOverview(await loadAnalysisExecutionContext(novelId));
}

export async function restartNovelAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  return analysisService.restart(await loadAnalysisExecutionContext(novelId));
}

export async function resumeNovelAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  return analysisService.resume(await loadAnalysisExecutionContext(novelId));
}

export async function startNovelAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  return analysisService.start(await loadAnalysisExecutionContext(novelId));
}
