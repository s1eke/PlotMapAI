import type { AnalysisExecutionContext } from '@domains/analysis/analysisService';
import type { AnalysisStatusResponse } from '@shared/contracts';

import { analysisService, buildRuntimeAnalysisConfig } from '@domains/analysis';
import { novelRepository } from '@domains/library';
import { loadAndPurifyChapters } from '@domains/reader';
import { getAiConfig } from '@domains/settings/aiConfigRepository';

async function loadAnalysisExecutionContext(novelId: number): Promise<AnalysisExecutionContext> {
  const [storedConfig, novel, chapters] = await Promise.all([
    getAiConfig(),
    novelRepository.get(novelId),
    loadAndPurifyChapters(novelId),
  ]);

  return {
    chapters,
    novelId,
    novelTitle: novel.title,
    runtimeConfig: buildRuntimeAnalysisConfig(storedConfig),
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
