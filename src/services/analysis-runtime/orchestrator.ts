import { loadAndPurifyChapters } from '../../api/reader';
import { getAiConfig } from '../../api/settings/aiConfig';
import { debugLog } from '../debug';
import { buildRuntimeAnalysisConfig, buildAnalysisChunks, runSingleChapterAnalysis } from '../analysis';
import { AnalysisErrorCode, AnalysisJobStateError } from '../analysis/errors';
import type { RuntimeAnalysisConfig } from '../analysis/types';
import { runAnalysisExecution } from './executor';
import {
  createDexieAnalysisRuntimeRepository,
} from './repository';
import {
  assertCanPause,
  assertCanRefreshOverview,
  assertCanRestart,
  assertCanResume,
  assertCanStart,
  deriveJobPatchForOverviewStart,
  deriveJobPatchForPauseRequest,
  deriveJobPatchForResume,
} from './stateMachine';

import type {
  AnalysisOverview as ApiAnalysisOverview,
  AnalysisStatusResponse,
  ChapterAnalysisResult,
  CharacterGraphResponse,
} from '../../api/analysis';

const ACTIVE_RUNNERS = new Map<number, AbortController>();
const repository = createDexieAnalysisRuntimeRepository();

let initialized = false;

function nowISO(): string {
  return new Date().toISOString();
}

async function loadRuntimeConfig(): Promise<RuntimeAnalysisConfig> {
  return buildRuntimeAnalysisConfig(await getAiConfig());
}

function spawnRunner(
  novelId: number,
  novelTitle: string,
  runtimeConfig: RuntimeAnalysisConfig,
  chapters: Awaited<ReturnType<typeof loadAndPurifyChapters>>,
): AbortController {
  const existing = ACTIVE_RUNNERS.get(novelId);
  if (existing && !existing.signal.aborted) return existing;
  const controller = new AbortController();
  ACTIVE_RUNNERS.set(novelId, controller);
  runAnalysisExecution({
    novelId,
    novelTitle,
    runtimeConfig,
    chapters,
    signal: controller.signal,
    repository,
  })
    .catch(() => {
      // execution errors are persisted inside executor
    })
    .finally(() => {
      if (ACTIVE_RUNNERS.get(novelId) === controller) ACTIVE_RUNNERS.delete(novelId);
    });
  return controller;
}

export async function initializeAnalysisRuntime(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await repository.recoverInterruptedJobs();
}

export async function getAnalysisStatus(novelId: number): Promise<AnalysisStatusResponse> {
  return repository.buildStatusResponse(novelId);
}

export async function startAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  const [novel, runtimeConfig, chapters] = await Promise.all([
    repository.loadNovel(novelId),
    loadRuntimeConfig(),
    loadAndPurifyChapters(novelId),
  ]);
  const chunks = buildAnalysisChunks(chapters, runtimeConfig.contextSize);
  assertCanStart(await repository.getSnapshot(novelId));
  await repository.resetAnalysisPlan(novelId, chapters.length, chunks);
  debugLog('Analysis', `job started: novelId=${novelId} chunks=${chunks.length} chapters=${chapters.length}`);
  spawnRunner(novelId, novel.title, runtimeConfig, chapters);
  return repository.buildStatusResponse(novelId);
}

export async function pauseAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  await repository.ensureJob(novelId);
  assertCanPause(await repository.getSnapshot(novelId));
  await repository.saveJobPatch(novelId, deriveJobPatchForPauseRequest());
  ACTIVE_RUNNERS.get(novelId)?.abort();
  return repository.buildStatusResponse(novelId);
}

export async function resumeAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  const [novel, runtimeConfig, chapters] = await Promise.all([
    repository.loadNovel(novelId),
    loadRuntimeConfig(),
    loadAndPurifyChapters(novelId),
  ]);
  await repository.ensureJob(novelId);
  assertCanResume(await repository.getSnapshot(novelId));
  await repository.resetChunksForResume(novelId);
  const chunks = await repository.loadChunks(novelId);
  const snapshot = await repository.getSnapshot(novelId);
  const nextPending = chunks.find(chunk => chunk.status !== 'completed');
  await repository.saveJobPatch(
    novelId,
    deriveJobPatchForResume({
      totalChapters: chapters.length,
      totalChunks: chunks.length,
      completedChunks: snapshot.completedChunks,
      analyzedChapters: snapshot.analyzedChapters,
      currentChunkIndex: nextPending ? nextPending.chunkIndex : chunks[chunks.length - 1].chunkIndex,
    }),
    { lastHeartbeat: nowISO() },
  );
  spawnRunner(novelId, novel.title, runtimeConfig, chapters);
  return repository.buildStatusResponse(novelId);
}

export async function restartAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  const [novel, runtimeConfig, chapters] = await Promise.all([
    repository.loadNovel(novelId),
    loadRuntimeConfig(),
    loadAndPurifyChapters(novelId),
  ]);
  assertCanRestart(await repository.getSnapshot(novelId));
  const chunks = buildAnalysisChunks(chapters, runtimeConfig.contextSize);
  await repository.resetAnalysisPlan(novelId, chapters.length, chunks);
  spawnRunner(novelId, novel.title, runtimeConfig, chapters);
  return repository.buildStatusResponse(novelId);
}

export async function refreshOverview(novelId: number): Promise<AnalysisStatusResponse> {
  const [novel, runtimeConfig, chapters] = await Promise.all([
    repository.loadNovel(novelId),
    loadRuntimeConfig(),
    loadAndPurifyChapters(novelId),
  ]);
  const snapshot = await repository.getSnapshot(novelId);
  assertCanRefreshOverview(snapshot);
  await repository.clearOverview(novelId);
  await repository.ensureJobRecord(novelId);
  await repository.saveJobPatch(
    novelId,
    {
      ...deriveJobPatchForOverviewStart(snapshot.totalChunks),
      pauseRequested: false,
      totalChunks: snapshot.totalChunks,
      completedChunks: snapshot.totalChunks,
      totalChapters: chapters.length,
      analyzedChapters: snapshot.analyzedChapters,
    },
    { lastHeartbeat: nowISO() },
  );
  spawnRunner(novelId, novel.title, runtimeConfig, chapters);
  return repository.buildStatusResponse(novelId);
}

export async function analyzeSingleChapter(
  novelId: number,
  chapterIndex: number,
): Promise<ChapterAnalysisResult | null> {
  const [runtimeConfig, novel, chapters] = await Promise.all([
    loadRuntimeConfig(),
    repository.loadNovel(novelId),
    loadAndPurifyChapters(novelId),
  ]);
  const chapter = chapters.find(item => item.chapterIndex === chapterIndex);
  if (!chapter) throw new AnalysisJobStateError(AnalysisErrorCode.CHAPTER_NOT_FOUND);
  const result = await runSingleChapterAnalysis(runtimeConfig, novel.title, chapter);
  return repository.saveSingleChapterAnalysis(
    novelId,
    chapterIndex,
    chapter.title || '',
    result,
  );
}

export async function getCharacterGraph(novelId: number): Promise<CharacterGraphResponse> {
  const chapters = await loadAndPurifyChapters(novelId);
  return repository.getCharacterGraph(novelId, chapters);
}

export async function getChapterAnalysis(
  novelId: number,
  chapterIndex: number,
): Promise<{ analysis: ChapterAnalysisResult | null }> {
  return repository.getChapterAnalysis(novelId, chapterIndex);
}

export async function getOverview(
  novelId: number,
): Promise<{ overview: ApiAnalysisOverview | null }> {
  return repository.getOverview(novelId);
}
