import type {
  AnalysisChunkStatus,
  AnalysisJobStatus,
  AnalysisOverview as ApiAnalysisOverview,
  AnalysisStatusResponse,
  ChapterAnalysisResult,
} from '@shared/contracts';

import { isChapterAnalysisComplete, isOverviewComplete } from '../services/aggregates';
import { deriveCapabilities, deriveCurrentStage, deriveProgress, type RuntimeSnapshot } from './stateMachine';
import type {
  AnalysisChunkState,
  AnalysisJobState,
  LoadedAnalysisRuntimeState,
  StoredAnalysisOverview,
  StoredChapterAnalysis,
} from './types';

function serializeChunk(chunk: AnalysisChunkState): AnalysisChunkStatus {
  return {
    chunkIndex: chunk.chunkIndex,
    startChapterIndex: chunk.startChapterIndex,
    endChapterIndex: chunk.endChapterIndex,
    chapterIndices: chunk.chapterIndices,
    status: chunk.status,
    chunkSummary: chunk.chunkSummary,
    errorMessage: chunk.errorMessage,
    updatedAt: chunk.updatedAt,
  };
}

export function serializeOverview(overview?: StoredAnalysisOverview): ApiAnalysisOverview | null {
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

export function serializeChapter(row?: StoredChapterAnalysis): ChapterAnalysisResult | null {
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

export function countCompleteChapterAnalyses(rows: StoredChapterAnalysis[]): number {
  return rows.filter((row) => isChapterAnalysisComplete(row)).length;
}

export function findIncompleteChunkIndices(
  chunks: AnalysisChunkState[],
  chapterRows: StoredChapterAnalysis[],
): Set<number> {
  if (!chunks.length) return new Set();
  const chapterMap = new Map<number, StoredChapterAnalysis>();
  for (const row of chapterRows) chapterMap.set(row.chapterIndex, row);
  return new Set(
    chunks
      .filter(
        (chunk) =>
          chunk.status !== 'completed' ||
          !chunk.chapterIndices.length ||
          chunk.chapterIndices.some((index) => !isChapterAnalysisComplete(chapterMap.get(index))),
      )
      .map((chunk) => chunk.chunkIndex),
  );
}

interface DerivedAnalysisRuntimeState {
  job?: AnalysisJobState;
  overview?: StoredAnalysisOverview;
  chunks: AnalysisChunkState[];
  chapterRows: StoredChapterAnalysis[];
  incompleteChunkIndices: Set<number>;
  completedChunks: number;
  totalChunks: number;
  totalChapters: number;
  analyzedChapters: number;
  overviewComplete: boolean;
  analysisComplete: boolean;
}

export function deriveAnalysisRuntimeState(
  state: LoadedAnalysisRuntimeState,
): DerivedAnalysisRuntimeState {
  const incompleteChunkIndices = findIncompleteChunkIndices(state.chunks, state.chapterRows);
  const completedChunks = state.chunks.filter(
    (chunk) => chunk.status === 'completed' && !incompleteChunkIndices.has(chunk.chunkIndex),
  ).length;
  const totalChapters =
    state.job && state.job.totalChapters > 0 ? state.job.totalChapters : state.totalChapterCount;
  const analyzedChapters = countCompleteChapterAnalyses(state.chapterRows);
  const totalChunks = state.chunks.length;
  const overviewComplete = isOverviewComplete(state.overview, totalChapters);
  const analysisComplete =
    totalChunks > 0 &&
    incompleteChunkIndices.size === 0 &&
    overviewComplete &&
    completedChunks >= totalChunks;
  return {
    job: state.job,
    overview: state.overview,
    chunks: state.chunks,
    chapterRows: state.chapterRows,
    incompleteChunkIndices,
    completedChunks,
    totalChunks,
    totalChapters,
    analyzedChapters,
    overviewComplete,
    analysisComplete,
  };
}

export function createRuntimeSnapshot(state: LoadedAnalysisRuntimeState): RuntimeSnapshot {
  const derived = deriveAnalysisRuntimeState(state);
  return {
    status: (derived.job?.status as AnalysisJobStatus['status']) ?? 'idle',
    pauseRequested: derived.job?.pauseRequested ?? false,
    totalChunks: derived.totalChunks,
    completedChunks: derived.completedChunks,
    totalChapters: derived.totalChapters,
    analyzedChapters: derived.analyzedChapters,
    currentChunkIndex: derived.job?.currentChunkIndex ?? 0,
    overviewComplete: derived.overviewComplete,
    analysisComplete: derived.analysisComplete,
    hasReusableChunks: derived.totalChunks > 0,
    hasIncompleteChunks: derived.incompleteChunkIndices.size > 0,
    lastError: derived.job?.lastError ?? '',
  };
}

export function buildAnalysisStatusResponse(
  state: LoadedAnalysisRuntimeState,
): AnalysisStatusResponse {
  const derived = deriveAnalysisRuntimeState(state);
  const snapshot = createRuntimeSnapshot(state);
  const currentStage = deriveCurrentStage(snapshot);
  let currentChunk = derived.job && currentStage === 'chapters'
    ? derived.chunks.find((chunk) => chunk.chunkIndex === derived.job?.currentChunkIndex) ?? null
    : null;
  if (
    currentChunk &&
    currentChunk.status === 'completed' &&
    derived.incompleteChunkIndices.has(currentChunk.chunkIndex)
  ) {
    currentChunk =
      derived.chunks.find(
        (chunk) =>
          chunk.status === 'running' ||
          chunk.status === 'pending' ||
          chunk.status === 'failed' ||
          derived.incompleteChunkIndices.has(chunk.chunkIndex),
      ) ?? null;
  }
  return {
    job: {
      status: snapshot.status,
      currentStage,
      analysisComplete: snapshot.analysisComplete,
      totalChapters: snapshot.totalChapters,
      analyzedChapters: snapshot.analyzedChapters,
      totalChunks: derived.job ? derived.job.totalChunks : derived.totalChunks,
      completedChunks: snapshot.completedChunks,
      currentChunkIndex: snapshot.currentChunkIndex,
      progressPercent: deriveProgress(snapshot),
      pauseRequested: snapshot.pauseRequested,
      lastError: snapshot.lastError,
      startedAt: derived.job?.startedAt ?? null,
      completedAt: derived.job?.completedAt ?? null,
      lastHeartbeat: derived.job?.lastHeartbeat ?? null,
      updatedAt: derived.job?.updatedAt ?? null,
      currentChunk: currentChunk ? serializeChunk(currentChunk) : null,
      ...deriveCapabilities(snapshot),
    },
    overview: serializeOverview(derived.overview),
    chunks: derived.chunks.map(serializeChunk),
  };
}
