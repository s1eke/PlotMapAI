import { db } from '@infra/db';
import type { AnalysisChunk, AnalysisJob, AnalysisOverview, ChapterAnalysis } from '@infra/db';
import { isChapterAnalysisComplete, isOverviewComplete } from '../services/aggregates';
import { deriveCapabilities, deriveCurrentStage, deriveProgress, type RuntimeSnapshot } from './stateMachine';

import type {
  AnalysisChunkStatus,
  AnalysisJobStatus,
  AnalysisOverview as ApiAnalysisOverview,
  AnalysisStatusResponse,
  ChapterAnalysisResult,
} from '../api/analysisApi';

function serializeChunk(chunk: AnalysisChunk): AnalysisChunkStatus {
  return {
    chunkIndex: chunk.chunkIndex,
    startChapterIndex: chunk.startChapterIndex,
    endChapterIndex: chunk.endChapterIndex,
    chapterIndices: chunk.chapterIndices,
    status: chunk.status as AnalysisChunkStatus['status'],
    chunkSummary: chunk.chunkSummary,
    errorMessage: chunk.errorMessage,
    updatedAt: chunk.updatedAt,
  };
}

export function serializeOverview(overview?: AnalysisOverview): ApiAnalysisOverview | null {
  return overview
    ? {
        bookIntro: overview.bookIntro,
        globalSummary: overview.globalSummary,
        themes: overview.themes,
        characterStats: overview.characterStats,
        relationshipGraph: overview.relationshipGraph,
        totalChapters: overview.totalChapters,
        analyzedChapters: overview.analyzedChapters,
        updatedAt: overview.updatedAt,
      }
    : null;
}

export function serializeChapter(row?: ChapterAnalysis): ChapterAnalysisResult | null {
  return row
    ? {
        chapterIndex: row.chapterIndex,
        chapterTitle: row.chapterTitle,
        summary: row.summary,
        keyPoints: row.keyPoints,
        characters: row.characters,
        relationships: row.relationships,
        tags: row.tags,
        chunkIndex: row.chunkIndex,
        updatedAt: row.updatedAt,
      }
    : null;
}

export function countCompleteChapterAnalyses(rows: ChapterAnalysis[]): number {
  return rows.filter(row => isChapterAnalysisComplete(row)).length;
}

export async function findIncompleteChunkIndices(
  novelId: number,
  chunks: AnalysisChunk[],
  chapterRows?: ChapterAnalysis[],
): Promise<Set<number>> {
  if (!chunks.length) return new Set();
  const chapterMap = new Map<number, ChapterAnalysis>();
  const rows = chapterRows ?? await db.chapterAnalyses.where('novelId').equals(novelId).sortBy('chapterIndex');
  for (const row of rows) chapterMap.set(row.chapterIndex, row);
  return new Set(
    chunks
      .filter(
        chunk =>
          chunk.status !== 'completed' ||
          !chunk.chapterIndices.length ||
          chunk.chapterIndices.some(index => !isChapterAnalysisComplete(chapterMap.get(index))),
      )
      .map(chunk => chunk.chunkIndex),
  );
}

async function readStatusState(novelId: number): Promise<{
  job?: AnalysisJob;
  overview?: AnalysisOverview;
  chunks: AnalysisChunk[];
  incompleteChunkIndices: Set<number>;
  completedChunks: number;
  totalChunks: number;
  totalChapters: number;
  analyzedChapters: number;
  overviewComplete: boolean;
  analysisComplete: boolean;
}> {
  const [job, overview, chunks, chapterCount, chapterRows] = await Promise.all([
    db.analysisJobs.where('novelId').equals(novelId).first(),
    db.analysisOverviews.where('novelId').equals(novelId).first(),
    db.analysisChunks.where('novelId').equals(novelId).sortBy('chunkIndex'),
    db.chapters.where('novelId').equals(novelId).count(),
    db.chapterAnalyses.where('novelId').equals(novelId).sortBy('chapterIndex'),
  ]);
  const incompleteChunkIndices = await findIncompleteChunkIndices(novelId, chunks, chapterRows);
  const completedChunks = chunks.filter(
    chunk => chunk.status === 'completed' && !incompleteChunkIndices.has(chunk.chunkIndex),
  ).length;
  const totalChapters = job && job.totalChapters > 0 ? job.totalChapters : chapterCount;
  const analyzedChapters = countCompleteChapterAnalyses(chapterRows);
  const totalChunks = chunks.length;
  const overviewComplete = isOverviewComplete(overview, totalChapters);
  const analysisComplete =
    totalChunks > 0 &&
    incompleteChunkIndices.size === 0 &&
    overviewComplete &&
    completedChunks >= totalChunks;
  return {
    job,
    overview,
    chunks,
    incompleteChunkIndices,
    completedChunks,
    totalChunks,
    totalChapters,
    analyzedChapters,
    overviewComplete,
    analysisComplete,
  };
}

function toSnapshot(state: Awaited<ReturnType<typeof readStatusState>>): RuntimeSnapshot {
  return {
    status: (state.job?.status as AnalysisJobStatus['status']) ?? 'idle',
    pauseRequested: state.job?.pauseRequested ?? false,
    totalChunks: state.totalChunks,
    completedChunks: state.completedChunks,
    totalChapters: state.totalChapters,
    analyzedChapters: state.analyzedChapters,
    currentChunkIndex: state.job?.currentChunkIndex ?? 0,
    overviewComplete: state.overviewComplete,
    analysisComplete: state.analysisComplete,
    hasReusableChunks: state.totalChunks > 0,
    hasIncompleteChunks: state.incompleteChunkIndices.size > 0,
    lastError: state.job?.lastError ?? '',
  };
}

export async function readRuntimeSnapshot(novelId: number): Promise<RuntimeSnapshot> {
  return toSnapshot(await readStatusState(novelId));
}

export async function buildAnalysisStatusResponse(novelId: number): Promise<AnalysisStatusResponse> {
  const state = await readStatusState(novelId);
  const snapshot = toSnapshot(state);
  const currentStage = deriveCurrentStage(snapshot);
  let currentChunk = state.job && currentStage === 'chapters'
    ? state.chunks.find(chunk => chunk.chunkIndex === state.job?.currentChunkIndex) ?? null
    : null;
  if (
    currentChunk &&
    currentChunk.status === 'completed' &&
    state.incompleteChunkIndices.has(currentChunk.chunkIndex)
  ) {
    currentChunk =
      state.chunks.find(
        chunk =>
          chunk.status === 'running' ||
          chunk.status === 'pending' ||
          chunk.status === 'failed' ||
          state.incompleteChunkIndices.has(chunk.chunkIndex),
      ) ?? null;
  }
  return {
    job: {
      status: snapshot.status,
      currentStage,
      analysisComplete: snapshot.analysisComplete,
      totalChapters: snapshot.totalChapters,
      analyzedChapters: snapshot.analyzedChapters,
      totalChunks: state.job ? state.job.totalChunks : state.totalChunks,
      completedChunks: snapshot.completedChunks,
      currentChunkIndex: snapshot.currentChunkIndex,
      progressPercent: deriveProgress(snapshot),
      pauseRequested: snapshot.pauseRequested,
      lastError: snapshot.lastError,
      startedAt: state.job?.startedAt ?? null,
      completedAt: state.job?.completedAt ?? null,
      lastHeartbeat: state.job?.lastHeartbeat ?? null,
      updatedAt: state.job?.updatedAt ?? null,
      currentChunk: currentChunk ? serializeChunk(currentChunk) : null,
      ...deriveCapabilities(snapshot),
    },
    overview: serializeOverview(state.overview),
    chunks: state.chunks.map(serializeChunk),
  };
}
