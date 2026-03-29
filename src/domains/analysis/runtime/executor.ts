import { reportAppError } from '@app/debug/service';
import { AppErrorCode, toAppError } from '@shared/errors';
import { buildChunkFromChapters } from '../services/chunking';
import {
  AnalysisErrorCode,
  AnalysisJobStateError,
} from '../services/errors';
import { isChapterAnalysisComplete } from '../services/aggregates';
import {
  runChunkAnalysis,
  runOverviewAnalysis,
} from '../services/service';
import type { AnalysisChunkPayload, RuntimeAnalysisConfig } from '../services/types';
import type { AnalysisChunk, Chapter } from '@infra/db';
import type { AnalysisRuntimeRepository } from './repository';
import {
  deriveJobPatchForChunkFailure,
  deriveJobPatchForChunkStart,
  deriveJobPatchForChunkSuccess,
  deriveJobPatchForOverviewFailure,
  deriveJobPatchForOverviewStart,
  deriveJobPatchForOverviewSuccess,
  deriveJobPatchForPauseCommit,
} from './stateMachine';

function nowISO(): string {
  return new Date().toISOString();
}

function normalizeRuntimeError(error: unknown, details?: Record<string, unknown>) {
  return toAppError(error, {
    code: AppErrorCode.INTERNAL_ERROR,
    kind: 'internal',
    source: 'analysis',
    userMessageKey: 'errors.INTERNAL_ERROR',
    details,
  });
}

function hydrateChunkPayload(chunk: AnalysisChunk, chapterMap: Map<number, Chapter>): AnalysisChunkPayload {
  const chapters: Chapter[] = [];
  for (const chapterIndex of chunk.chapterIndices) {
    const chapter = chapterMap.get(chapterIndex);
    if (!chapter) throw new AnalysisJobStateError(AnalysisErrorCode.CHAPTER_MISSING);
    chapters.push(chapter);
  }
  return buildChunkFromChapters(chunk.chunkIndex, chapters);
}

async function commitPause(repository: AnalysisRuntimeRepository, novelId: number): Promise<boolean> {
  const job = await repository.loadJob(novelId);
  if (!job) return true;
  await repository.saveJobPatch(novelId, deriveJobPatchForPauseCommit(), {
    lastHeartbeat: nowISO(),
  });
  return true;
}

async function handlePauseCheckpoint(
  repository: AnalysisRuntimeRepository,
  novelId: number,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return commitPause(repository, novelId);
  const job = await repository.loadJob(novelId);
  if (!job) return true;
  if (job.pauseRequested) return commitPause(repository, novelId);
  return false;
}

async function failJob(
  repository: AnalysisRuntimeRepository,
  novelId: number,
  totalChapters: number,
  patch: ReturnType<typeof deriveJobPatchForChunkFailure>,
): Promise<void> {
  await repository.refreshJobProgress(novelId, totalChapters);
  await repository.saveJobPatch(novelId, patch, { lastHeartbeat: nowISO() });
}

export async function runAnalysisExecution({
  novelId,
  novelTitle,
  chapters,
  runtimeConfig,
  signal,
  repository,
}: {
  novelId: number;
  novelTitle: string;
  chapters: Chapter[];
  runtimeConfig: RuntimeAnalysisConfig;
  signal: AbortSignal;
  repository: AnalysisRuntimeRepository;
}): Promise<void> {
  const totalChapters = chapters.length;
  const chapterMap = new Map(chapters.map(chapter => [chapter.chapterIndex, chapter]));
  try {
    let chunks = await repository.loadChunks(novelId);
    if (!chunks.length) {
      await failJob(
        repository,
        novelId,
        totalChapters,
        deriveJobPatchForChunkFailure(AnalysisErrorCode.CHUNKS_NOT_FOUND),
      );
      return;
    }

    await repository.resetIncompleteCompletedChunks(novelId);
    chunks = await repository.loadChunks(novelId);
    for (const chunk of chunks) {
      if (await handlePauseCheckpoint(repository, novelId, signal)) return;
      if (chunk.status === 'completed') continue;

      const payload = hydrateChunkPayload(chunk, chapterMap);
      await repository.markChunkRunning(novelId, payload.chunkIndex);
      await repository.saveJobPatch(novelId, deriveJobPatchForChunkStart(payload.chunkIndex), {
        lastHeartbeat: nowISO(),
      });

      try {
        const result = await runChunkAnalysis(runtimeConfig, novelTitle, payload, chunks.length, signal);
        await repository.saveChunkAnalysisResult(novelId, payload.chunkIndex, result);
        const snapshot = await repository.refreshJobProgress(novelId, totalChapters);
        if (snapshot.pauseRequested) {
          await commitPause(repository, novelId);
          return;
        }
        await repository.saveJobPatch(novelId, deriveJobPatchForChunkSuccess(), {
          lastHeartbeat: nowISO(),
        });
      } catch (error) {
        if (await handlePauseCheckpoint(repository, novelId, signal)) return;
        const normalized = normalizeRuntimeError(error, {
          novelId,
          stage: 'chunk',
          chunkIndex: chunk.chunkIndex,
        });
        reportAppError(normalized);
        const message = `Chunk ${chunk.chunkIndex + 1} failed: ${normalized.debugMessage}`;
        await repository.markChunkFailed(novelId, payload.chunkIndex, message);
        await failJob(repository, novelId, totalChapters, deriveJobPatchForChunkFailure(normalized.code));
        return;
      }
    }

    const snapshot = await repository.refreshJobProgress(novelId, totalChapters);
    if (snapshot.completedChunks >= snapshot.totalChunks && snapshot.totalChunks > 0 && !snapshot.overviewComplete) {
      const chapterRows = await repository.loadChapterAnalyses(novelId);
      if (
        chapterRows.length < totalChapters ||
        chapterRows.some(row => !isChapterAnalysisComplete(row))
      ) {
        await failJob(
          repository,
          novelId,
          totalChapters,
          deriveJobPatchForChunkFailure(AnalysisErrorCode.CHAPTERS_INCOMPLETE),
        );
        return;
      }
      if (await handlePauseCheckpoint(repository, novelId, signal)) return;

      await repository.saveJobPatch(novelId, deriveJobPatchForOverviewStart(snapshot.totalChunks), {
        lastHeartbeat: nowISO(),
      });
      try {
        const result = await runOverviewAnalysis(runtimeConfig, novelTitle, chapterRows, totalChapters, signal);
        await repository.saveOverviewAnalysisResult(novelId, result);
        await repository.refreshJobProgress(novelId, totalChapters);
        await repository.saveJobPatch(novelId, deriveJobPatchForOverviewSuccess(), {
          completedAt: nowISO(),
          lastHeartbeat: nowISO(),
        });
        return;
      } catch (error) {
        if (await handlePauseCheckpoint(repository, novelId, signal)) return;
        const normalized = normalizeRuntimeError(error, {
          novelId,
          stage: 'overview',
        });
        reportAppError(normalized);
        await failJob(repository, novelId, totalChapters, deriveJobPatchForOverviewFailure(normalized.code));
        return;
      }
    }

    if (snapshot.completedChunks >= snapshot.totalChunks && snapshot.totalChunks > 0 && snapshot.overviewComplete) {
      const job = await repository.ensureJob(novelId);
      await repository.saveJobPatch(novelId, deriveJobPatchForOverviewSuccess(), {
        completedAt: job.completedAt || nowISO(),
      });
      return;
    }

    if (snapshot.pauseRequested) {
      await commitPause(repository, novelId);
      return;
    }

    await repository.saveJobPatch(novelId, deriveJobPatchForChunkSuccess(), {
      lastHeartbeat: nowISO(),
    });
  } catch (error) {
    try {
      if (await handlePauseCheckpoint(repository, novelId, signal)) return;
      const normalized = normalizeRuntimeError(error, {
        novelId,
        stage: 'execution',
      });
      reportAppError(normalized);
      await failJob(
        repository,
        novelId,
        totalChapters,
        deriveJobPatchForChunkFailure(
          normalized.code === AppErrorCode.INTERNAL_ERROR
            ? AnalysisErrorCode.INTERNAL_ERROR
            : normalized.code,
        ),
      );
    } catch {
      // swallow secondary errors
    }
  }
}
