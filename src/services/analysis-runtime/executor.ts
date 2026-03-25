import { buildChunkFromChapters } from '../analysis/chunking';
import {
  AnalysisConfigError,
  AnalysisErrorCode,
  AnalysisExecutionError,
  AnalysisJobStateError,
  ChunkingError,
} from '../analysis/errors';
import { isChapterAnalysisComplete } from '../analysis/aggregates';
import {
  runChunkAnalysis,
  runOverviewAnalysis,
} from '../analysis/service';
import type { AnalysisChunkPayload, RuntimeAnalysisConfig } from '../analysis/types';
import type { AnalysisChunk, Chapter } from '../db';
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

function formatExceptionMessage(error: unknown): string {
  if (
    error instanceof AnalysisConfigError ||
    error instanceof AnalysisExecutionError ||
    error instanceof ChunkingError ||
    error instanceof AnalysisJobStateError
  ) {
    return error.message;
  }
  return `Internal error: ${error instanceof Error ? error.message : String(error)}`;
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
        const result = await runChunkAnalysis(runtimeConfig, novelTitle, payload, chunks.length);
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
        const message = `Chunk ${chunk.chunkIndex + 1} failed: ${formatExceptionMessage(error)}`;
        await repository.markChunkFailed(novelId, payload.chunkIndex, message);
        await failJob(repository, novelId, totalChapters, deriveJobPatchForChunkFailure(message));
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
        const result = await runOverviewAnalysis(runtimeConfig, novelTitle, chapterRows, totalChapters);
        await repository.saveOverviewAnalysisResult(novelId, result);
        await repository.refreshJobProgress(novelId, totalChapters);
        await repository.saveJobPatch(novelId, deriveJobPatchForOverviewSuccess(), {
          completedAt: nowISO(),
          lastHeartbeat: nowISO(),
        });
        return;
      } catch (error) {
        const message = `Overview generation failed: ${formatExceptionMessage(error)}`;
        await failJob(repository, novelId, totalChapters, deriveJobPatchForOverviewFailure(message));
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
      await failJob(
        repository,
        novelId,
        totalChapters,
        deriveJobPatchForChunkFailure(formatExceptionMessage(error)),
      );
    } catch {
      // swallow secondary errors
    }
  }
}
