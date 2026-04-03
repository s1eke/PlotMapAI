import type {
  AnalysisOverview as ApiAnalysisOverview,
  AnalysisStatusResponse,
  BookChapter,
  ChapterAnalysisResult,
  CharacterGraphResponse,
} from '@shared/contracts';
import type { Transaction } from 'dexie';

import { db } from '@infra/db';

import { buildCharacterGraphPayload } from '../services/aggregates';
import { AnalysisErrorCode, AnalysisJobStateError } from '../services/errors';
import type { AnalysisChunkPayload, ChunkAnalysisResult, OverviewAnalysisResult } from '../services/types';
import { deriveJobPatchForRecovery, type RuntimeSnapshot } from './stateMachine';
import {
  buildAnalysisStatusResponse,
  createRuntimeSnapshot,
  countCompleteChapterAnalyses,
  findIncompleteChunkIndices,
  serializeChapter,
  serializeOverview,
} from './readModel';
import {
  toAnalysisChunkRecord,
  toAnalysisChunkState,
  toAnalysisJobRecord,
  toAnalysisJobState,
  toAnalysisOverviewRecord,
  toStoredAnalysisOverview,
  toStoredChapterAnalysis,
  toChapterAnalysisRecord,
} from './mappers';
import type {
  AnalysisChunkState,
  AnalysisJobState,
  LoadedAnalysisRuntimeState,
  StoredAnalysisOverview,
  StoredChapterAnalysis,
} from './types';

export interface AnalysisRuntimeRepository {
  loadJob: (novelId: number) => Promise<AnalysisJobState | undefined>;
  ensureJob: (novelId: number) => Promise<AnalysisJobState>;
  ensureJobRecord: (novelId: number) => Promise<AnalysisJobState>;
  loadChunks: (novelId: number) => Promise<AnalysisChunkState[]>;
  loadChapterAnalyses: (novelId: number) => Promise<StoredChapterAnalysis[]>;
  loadOverview: (novelId: number) => Promise<StoredAnalysisOverview | undefined>;
  getSnapshot: (novelId: number) => Promise<RuntimeSnapshot>;
  buildStatusResponse: (novelId: number) => Promise<AnalysisStatusResponse>;
  resetAnalysisPlan: (
    novelId: number,
    totalChapters: number,
    chunks: AnalysisChunkPayload[],
  ) => Promise<void>;
  saveJobPatch: (
    novelId: number,
    patch: Partial<AnalysisJobState>,
    extra?: Partial<AnalysisJobState>,
  ) => Promise<AnalysisJobState>;
  refreshJobProgress: (novelId: number, totalChapters: number) => Promise<RuntimeSnapshot>;
  resetIncompleteCompletedChunks: (novelId: number) => Promise<void>;
  resetChunksForResume: (novelId: number) => Promise<void>;
  clearOverview: (novelId: number) => Promise<void>;
  deleteAnalysisArtifacts: (novelId: number, transaction?: Transaction) => Promise<void>;
  markChunkRunning: (novelId: number, chunkIndex: number) => Promise<void>;
  markChunkFailed: (novelId: number, chunkIndex: number, errorMessage: string) => Promise<void>;
  saveChunkAnalysisResult: (
    novelId: number,
    chunkIndex: number,
    result: ChunkAnalysisResult,
  ) => Promise<void>;
  saveOverviewAnalysisResult: (novelId: number, result: OverviewAnalysisResult) => Promise<void>;
  recoverInterruptedJobs: () => Promise<void>;
  saveSingleChapterAnalysis: (
    novelId: number,
    chapterIndex: number,
    chapterTitle: string,
    result: ChunkAnalysisResult,
  ) => Promise<ChapterAnalysisResult | null>;
  getChapterAnalysis: (
    novelId: number,
    chapterIndex: number,
  ) => Promise<{ analysis: ChapterAnalysisResult | null }>;
  getOverview: (novelId: number) => Promise<{ overview: ApiAnalysisOverview | null }>;
  getCharacterGraph: (novelId: number, chapters: BookChapter[]) => Promise<CharacterGraphResponse>;
}

function nowISO(): string {
  return new Date().toISOString();
}

export function createDexieAnalysisRuntimeRepository(): AnalysisRuntimeRepository {
  async function loadStatusState(novelId: number): Promise<LoadedAnalysisRuntimeState> {
    const [job, overview, chunks, chapterRows] = await Promise.all([
      db.analysisJobs.where('novelId').equals(novelId).first(),
      db.analysisOverviews.where('novelId').equals(novelId).first(),
      db.analysisChunks.where('novelId').equals(novelId).sortBy('chunkIndex'),
      db.chapterAnalyses.where('novelId').equals(novelId).sortBy('chapterIndex'),
    ]);

    return {
      job: job ? toAnalysisJobState(job) : undefined,
      overview: overview ? toStoredAnalysisOverview(overview) : undefined,
      chunks: chunks.map(toAnalysisChunkState),
      chapterRows: chapterRows.map(toStoredChapterAnalysis),
      totalChapterCount: 0,
    };
  }

  async function loadJob(novelId: number): Promise<AnalysisJobState | undefined> {
    const record = await db.analysisJobs.where('novelId').equals(novelId).first();
    return record ? toAnalysisJobState(record) : undefined;
  }

  async function ensureJob(novelId: number): Promise<AnalysisJobState> {
    const job = await loadJob(novelId);
    if (!job) throw new AnalysisJobStateError(AnalysisErrorCode.JOB_NOT_FOUND);
    return job;
  }

  async function loadChunks(novelId: number): Promise<AnalysisChunkState[]> {
    return (await db.analysisChunks.where('novelId').equals(novelId).sortBy('chunkIndex'))
      .map(toAnalysisChunkState);
  }

  async function loadChapterAnalyses(novelId: number): Promise<StoredChapterAnalysis[]> {
    return (await db.chapterAnalyses.where('novelId').equals(novelId).sortBy('chapterIndex'))
      .map(toStoredChapterAnalysis);
  }

  async function loadOverview(novelId: number): Promise<StoredAnalysisOverview | undefined> {
    const record = await db.analysisOverviews.where('novelId').equals(novelId).first();
    return record ? toStoredAnalysisOverview(record) : undefined;
  }

  async function clearAnalysisData(novelId: number): Promise<void> {
    await Promise.all([
      db.analysisChunks.where('novelId').equals(novelId).delete(),
      db.chapterAnalyses.where('novelId').equals(novelId).delete(),
      db.analysisOverviews.where('novelId').equals(novelId).delete(),
    ]);
  }

  async function saveJobPatch(
    novelId: number,
    patch: Partial<AnalysisJobState>,
    extra: Partial<AnalysisJobState> = {},
  ): Promise<AnalysisJobState> {
    const job = await ensureJob(novelId);
    Object.assign(job, patch, { updatedAt: nowISO() }, extra);
    await db.analysisJobs.put(toAnalysisJobRecord(job));
    return job;
  }

  async function ensureJobRecord(novelId: number): Promise<AnalysisJobState> {
    const existing = await loadJob(novelId);
    if (existing) return existing;
    const id = await db.analysisJobs.add({
      novelId,
      status: 'idle',
      totalChapters: 0,
      analyzedChapters: 0,
      totalChunks: 0,
      completedChunks: 0,
      currentChunkIndex: 0,
      pauseRequested: false,
      lastError: '',
      startedAt: null,
      completedAt: null,
      lastHeartbeat: null,
      updatedAt: nowISO(),
    });
    const job = await db.analysisJobs.get(id);
    if (!job) throw new AnalysisJobStateError(AnalysisErrorCode.JOB_CREATE_FAILED);
    return toAnalysisJobState(job);
  }

  async function resetAnalysisPlan(
    novelId: number,
    totalChapters: number,
    chunks: AnalysisChunkPayload[],
  ): Promise<void> {
    if (!chunks.length) throw new AnalysisJobStateError(AnalysisErrorCode.NO_CHAPTERS);
    await clearAnalysisData(novelId);
    const job = await ensureJobRecord(novelId);
    const timestamp = nowISO();
    Object.assign(job, {
      status: 'running',
      totalChapters,
      analyzedChapters: 0,
      totalChunks: chunks.length,
      completedChunks: 0,
      currentChunkIndex: chunks[0].chunkIndex,
      pauseRequested: false,
      lastError: '',
      startedAt: timestamp,
      completedAt: null,
      lastHeartbeat: null,
      updatedAt: timestamp,
    });
    await db.analysisJobs.put(toAnalysisJobRecord(job));
    await db.analysisChunks.bulkAdd(
      chunks.map((chunk) => ({
        novelId,
        chunkIndex: chunk.chunkIndex,
        startChapterIndex: chunk.startChapterIndex,
        endChapterIndex: chunk.endChapterIndex,
        chapterIndices: chunk.chapterIndices,
        status: 'pending' as const,
        chunkSummary: '',
        errorMessage: '',
        updatedAt: timestamp,
      })),
    );
  }

  async function refreshJobProgress(
    novelId: number,
    totalChapters: number,
  ): Promise<RuntimeSnapshot> {
    const state = await loadStatusState(novelId);
    const job = state.job ?? (await ensureJobRecord(novelId));
    const incompleteChunkIndices = findIncompleteChunkIndices(state.chunks, state.chapterRows);

    job.totalChapters = totalChapters;
    job.totalChunks = state.chunks.length;
    job.completedChunks = state.chunks.filter(
      (chunk) => chunk.status === 'completed' && !incompleteChunkIndices.has(chunk.chunkIndex),
    ).length;
    job.analyzedChapters = countCompleteChapterAnalyses(state.chapterRows);

    await db.analysisJobs.put(toAnalysisJobRecord(job));

    return createRuntimeSnapshot({
      ...state,
      job,
      totalChapterCount: totalChapters,
    });
  }

  async function saveChunkStatus(
    novelId: number,
    chunkIndex: number,
    patch: Partial<AnalysisChunkState>,
  ): Promise<void> {
    const chunk = await db.analysisChunks.where('[novelId+chunkIndex]').equals([novelId, chunkIndex]).first();
    if (!chunk) return;
    const chunkState = toAnalysisChunkState(chunk);
    Object.assign(chunkState, patch, { updatedAt: nowISO() });
    await db.analysisChunks.put(toAnalysisChunkRecord(chunkState));
  }

  return {
    loadJob,
    ensureJob,
    ensureJobRecord,
    loadChunks,
    loadChapterAnalyses,
    loadOverview,
    getSnapshot: async (novelId) => createRuntimeSnapshot(await loadStatusState(novelId)),
    buildStatusResponse: async (novelId) =>
      buildAnalysisStatusResponse(await loadStatusState(novelId)),
    resetAnalysisPlan,
    saveJobPatch,
    refreshJobProgress,
    resetIncompleteCompletedChunks: async (novelId) => {
      for (const chunk of await loadChunks(novelId)) {
        if (
          chunk.status === 'completed' &&
          findIncompleteChunkIndices([chunk], await loadChapterAnalyses(novelId)).size > 0
        ) {
          await saveChunkStatus(novelId, chunk.chunkIndex, { status: 'pending', errorMessage: '' });
        }
      }
    },
    resetChunksForResume: async (novelId) => {
      const chunks = await loadChunks(novelId);
      const incompleteChunkIndices = findIncompleteChunkIndices(
        chunks,
        await loadChapterAnalyses(novelId),
      );
      for (const chunk of chunks) {
        if (
          incompleteChunkIndices.has(chunk.chunkIndex) ||
          chunk.status === 'failed' ||
          chunk.status === 'running'
        ) {
          await saveChunkStatus(novelId, chunk.chunkIndex, { status: 'pending', errorMessage: '' });
        }
      }
    },
    clearOverview: async (novelId) => {
      const overview = await loadOverview(novelId);
      if (overview) await db.analysisOverviews.delete(overview.id);
    },
    deleteAnalysisArtifacts: async (novelId, transaction) => {
      const analysisJobTable = transaction
        ? transaction.table('analysisJobs')
        : db.analysisJobs;
      const analysisChunkTable = transaction
        ? transaction.table('analysisChunks')
        : db.analysisChunks;
      const chapterAnalysisTable = transaction
        ? transaction.table('chapterAnalyses')
        : db.chapterAnalyses;
      const analysisOverviewTable = transaction
        ? transaction.table('analysisOverviews')
        : db.analysisOverviews;

      const deleteArtifacts = async (): Promise<void> => {
        await Promise.all([
          analysisJobTable.where('novelId').equals(novelId).delete(),
          analysisChunkTable.where('novelId').equals(novelId).delete(),
          chapterAnalysisTable.where('novelId').equals(novelId).delete(),
          analysisOverviewTable.where('novelId').equals(novelId).delete(),
        ]);
      };

      if (transaction) {
        await deleteArtifacts();
        return;
      }

      await db.transaction(
        'rw',
        [
          db.analysisJobs,
          db.analysisChunks,
          db.analysisOverviews,
          db.chapterAnalyses,
        ],
        async () => {
          await deleteArtifacts();
        },
      );
    },
    markChunkRunning: async (novelId, chunkIndex) => saveChunkStatus(novelId, chunkIndex, { status: 'running', errorMessage: '' }),
    markChunkFailed: async (novelId, chunkIndex, errorMessage) => saveChunkStatus(novelId, chunkIndex, { status: 'failed', errorMessage }),
    saveChunkAnalysisResult: async (novelId, chunkIndex, result) => {
      await saveChunkStatus(novelId, chunkIndex, {
        status: 'completed',
        chunkSummary: result.chunkSummary || 'Chunk analysis completed.',
        errorMessage: '',
      });
      for (const item of result.chapterAnalyses) {
        const existing = await db.chapterAnalyses.where('[novelId+chapterIndex]').equals([novelId, item.chapterIndex]).first();
        const chapterAnalysis: StoredChapterAnalysis = {
          id: existing?.id ?? 0,
          novelId,
          chapterIndex: item.chapterIndex,
          chapterTitle: item.title || '',
          summary: item.summary,
          keyPoints: item.keyPoints,
          characters: item.characters,
          relationships: item.relationships,
          tags: item.tags,
          chunkIndex,
          updatedAt: nowISO(),
        };
        if (existing) {
          await db.chapterAnalyses.put(toChapterAnalysisRecord(chapterAnalysis));
        } else {
          const { id: _unusedId, ...record } = toChapterAnalysisRecord(chapterAnalysis);
          await db.chapterAnalyses.add(record);
        }
      }
    },
    saveOverviewAnalysisResult: async (novelId, result) => {
      const existing = await loadOverview(novelId);
      const overview: StoredAnalysisOverview = {
        id: existing?.id ?? 0,
        novelId,
        ...result,
        updatedAt: nowISO(),
      };
      if (existing) {
        await db.analysisOverviews.put(toAnalysisOverviewRecord(overview));
      } else {
        const { id: _unusedId, ...record } = toAnalysisOverviewRecord(overview);
        await db.analysisOverviews.add(record);
      }
    },
    recoverInterruptedJobs: async () => {
      const timestamp = nowISO();
      for (const job of await db.analysisJobs.filter((row) => ['running', 'pausing'].includes(row.status)).toArray()) {
        const snapshot = createRuntimeSnapshot(await loadStatusState(job.novelId));
        await saveJobPatch(job.novelId, deriveJobPatchForRecovery(snapshot), {
          updatedAt: timestamp,
        });
      }
      await db.analysisChunks.filter((chunk) => chunk.status === 'running').modify({ status: 'pending', errorMessage: '', updatedAt: timestamp });
    },
    saveSingleChapterAnalysis: async (novelId, chapterIndex, chapterTitle, result) => {
      if (result.chapterAnalyses.length === 0) return null;
      const item = result.chapterAnalyses[0];
      const existing = await db.chapterAnalyses.where('[novelId+chapterIndex]').equals([novelId, chapterIndex]).first();
      const chapterAnalysis: StoredChapterAnalysis = {
        id: existing?.id ?? 0,
        novelId,
        chapterIndex,
        chapterTitle: item.title || chapterTitle,
        summary: item.summary,
        keyPoints: item.keyPoints,
        characters: item.characters,
        relationships: item.relationships,
        tags: item.tags,
        chunkIndex: -1,
        updatedAt: nowISO(),
      };
      if (existing) {
        await db.chapterAnalyses.put(toChapterAnalysisRecord(chapterAnalysis));
        return serializeChapter(chapterAnalysis);
      }
      const { id: _unusedId, ...record } = toChapterAnalysisRecord(chapterAnalysis);
      const id = await db.chapterAnalyses.add(record);
      return serializeChapter({ ...chapterAnalysis, id });
    },
    getChapterAnalysis: async (novelId, chapterIndex) => {
      const row = await db.chapterAnalyses.where('[novelId+chapterIndex]').equals([novelId, chapterIndex]).first();
      return { analysis: serializeChapter(row ? toStoredChapterAnalysis(row) : undefined) };
    },
    getOverview: async (novelId) => ({ overview: serializeOverview(await loadOverview(novelId)) }),
    getCharacterGraph: async (novelId, chapters) =>
      buildCharacterGraphPayload(
        chapters,
        await loadChapterAnalyses(novelId),
        await loadOverview(novelId),
      ),
  };
}
