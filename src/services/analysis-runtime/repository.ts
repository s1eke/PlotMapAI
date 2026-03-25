import { db } from '../db';
import type { AnalysisChunk, AnalysisJob, AnalysisOverview, Chapter, ChapterAnalysis, Novel } from '../db';
import { buildCharacterGraphPayload } from '../analysis/aggregates';
import { AnalysisErrorCode, AnalysisJobStateError } from '../analysis/errors';
import type { AnalysisChunkPayload, ChunkAnalysisResult, OverviewAnalysisResult } from '../analysis/types';
import { deriveJobPatchForRecovery, type RuntimeSnapshot } from './stateMachine';
import {
  buildAnalysisStatusResponse,
  countCompleteChapterAnalyses,
  findIncompleteChunkIndices,
  readRuntimeSnapshot,
  serializeChapter,
  serializeOverview,
} from './readModel';
import type {
  AnalysisOverview as ApiAnalysisOverview,
  AnalysisStatusResponse,
  ChapterAnalysisResult,
  CharacterGraphResponse,
} from '../../api/analysis';

export interface AnalysisRuntimeRepository {
  loadNovel(novelId: number): Promise<Novel>;
  loadJob(novelId: number): Promise<AnalysisJob | undefined>;
  ensureJob(novelId: number): Promise<AnalysisJob>;
  ensureJobRecord(novelId: number): Promise<AnalysisJob>;
  loadChunks(novelId: number): Promise<AnalysisChunk[]>;
  loadChapterAnalyses(novelId: number): Promise<ChapterAnalysis[]>;
  loadOverview(novelId: number): Promise<AnalysisOverview | undefined>;
  getSnapshot(novelId: number): Promise<RuntimeSnapshot>;
  buildStatusResponse(novelId: number): Promise<AnalysisStatusResponse>;
  resetAnalysisPlan(novelId: number, totalChapters: number, chunks: AnalysisChunkPayload[]): Promise<void>;
  saveJobPatch(novelId: number, patch: Partial<AnalysisJob>, extra?: Partial<AnalysisJob>): Promise<AnalysisJob>;
  refreshJobProgress(novelId: number, totalChapters: number): Promise<RuntimeSnapshot>;
  resetIncompleteCompletedChunks(novelId: number): Promise<void>;
  resetChunksForResume(novelId: number): Promise<void>;
  clearOverview(novelId: number): Promise<void>;
  markChunkRunning(novelId: number, chunkIndex: number): Promise<void>;
  markChunkFailed(novelId: number, chunkIndex: number, errorMessage: string): Promise<void>;
  saveChunkAnalysisResult(novelId: number, chunkIndex: number, result: ChunkAnalysisResult): Promise<void>;
  saveOverviewAnalysisResult(novelId: number, result: OverviewAnalysisResult): Promise<void>;
  recoverInterruptedJobs(): Promise<void>;
  saveSingleChapterAnalysis(novelId: number, chapterIndex: number, chapterTitle: string, result: ChunkAnalysisResult): Promise<ChapterAnalysisResult | null>;
  getChapterAnalysis(novelId: number, chapterIndex: number): Promise<{ analysis: ChapterAnalysisResult | null }>;
  getOverview(novelId: number): Promise<{ overview: ApiAnalysisOverview | null }>;
  getCharacterGraph(novelId: number, chapters: Chapter[]): Promise<CharacterGraphResponse>;
}

function nowISO(): string {
  return new Date().toISOString();
}

export function createDexieAnalysisRuntimeRepository(): AnalysisRuntimeRepository {
  async function loadNovel(novelId: number): Promise<Novel> {
    const novel = await db.novels.get(novelId);
    if (!novel) throw new AnalysisJobStateError(AnalysisErrorCode.NOVEL_NOT_FOUND);
    return novel;
  }

  async function loadJob(novelId: number): Promise<AnalysisJob | undefined> {
    return db.analysisJobs.where('novelId').equals(novelId).first();
  }

  async function ensureJob(novelId: number): Promise<AnalysisJob> {
    const job = await loadJob(novelId);
    if (!job) throw new AnalysisJobStateError(AnalysisErrorCode.JOB_NOT_FOUND);
    return job;
  }

  async function loadChunks(novelId: number): Promise<AnalysisChunk[]> {
    return db.analysisChunks.where('novelId').equals(novelId).sortBy('chunkIndex');
  }

  async function loadChapterAnalyses(novelId: number): Promise<ChapterAnalysis[]> {
    return db.chapterAnalyses.where('novelId').equals(novelId).sortBy('chapterIndex');
  }

  async function loadOverview(novelId: number): Promise<AnalysisOverview | undefined> {
    return db.analysisOverviews.where('novelId').equals(novelId).first();
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
    patch: Partial<AnalysisJob>,
    extra: Partial<AnalysisJob> = {},
  ): Promise<AnalysisJob> {
    const job = await ensureJob(novelId);
    Object.assign(job, patch, { updatedAt: nowISO() }, extra);
    await db.analysisJobs.put(job);
    return job;
  }

  async function ensureJobRecord(novelId: number): Promise<AnalysisJob> {
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
    return job;
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
    await db.analysisJobs.put(job);
    await db.analysisChunks.bulkAdd(
      chunks.map(chunk => ({
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

  async function refreshJobProgress(novelId: number, totalChapters: number): Promise<RuntimeSnapshot> {
    const job = await ensureJob(novelId);
    const chunks = await loadChunks(novelId);
    const chapterRows = await loadChapterAnalyses(novelId);
    const incompleteChunkIndices = await findIncompleteChunkIndices(novelId, chunks, chapterRows);
    job.totalChapters = totalChapters;
    job.totalChunks = chunks.length;
    job.completedChunks = chunks.filter(
      chunk => chunk.status === 'completed' && !incompleteChunkIndices.has(chunk.chunkIndex),
    ).length;
    job.analyzedChapters = await countCompleteChapterAnalyses(chapterRows);
    await db.analysisJobs.put(job);
    return readRuntimeSnapshot(novelId);
  }

  async function saveChunkStatus(novelId: number, chunkIndex: number, patch: Partial<AnalysisChunk>): Promise<void> {
    const chunk = await db.analysisChunks.where('[novelId+chunkIndex]').equals([novelId, chunkIndex]).first();
    if (!chunk) return;
    Object.assign(chunk, patch, { updatedAt: nowISO() });
    await db.analysisChunks.put(chunk);
  }

  return {
    loadNovel,
    loadJob,
    ensureJob,
    ensureJobRecord,
    loadChunks,
    loadChapterAnalyses,
    loadOverview,
    getSnapshot: readRuntimeSnapshot,
    buildStatusResponse: buildAnalysisStatusResponse,
    resetAnalysisPlan,
    saveJobPatch,
    refreshJobProgress,
    resetIncompleteCompletedChunks: async novelId => {
      for (const chunk of await loadChunks(novelId)) {
        if (chunk.status === 'completed' && (await findIncompleteChunkIndices(novelId, [chunk])).size > 0) {
          await saveChunkStatus(novelId, chunk.chunkIndex, { status: 'pending', errorMessage: '' });
        }
      }
    },
    resetChunksForResume: async novelId => {
      const incompleteChunkIndices = await findIncompleteChunkIndices(novelId, await loadChunks(novelId));
      for (const chunk of await loadChunks(novelId)) {
        if (
          incompleteChunkIndices.has(chunk.chunkIndex) ||
          chunk.status === 'failed' ||
          chunk.status === 'running'
        ) {
          await saveChunkStatus(novelId, chunk.chunkIndex, { status: 'pending', errorMessage: '' });
        }
      }
    },
    clearOverview: async novelId => {
      const overview = await loadOverview(novelId);
      if (overview) await db.analysisOverviews.delete(overview.id);
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
        const record: ChapterAnalysis = {
          id: existing?.id ?? (undefined as unknown as number),
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
          await db.chapterAnalyses.put({ ...record, id: existing.id });
        } else {
          await db.chapterAnalyses.add(record);
        }
      }
    },
    saveOverviewAnalysisResult: async (novelId, result) => {
      const existing = await loadOverview(novelId);
      const record: AnalysisOverview = { id: existing?.id ?? (undefined as unknown as number), novelId, ...result, updatedAt: nowISO() };
      if (existing) {
        await db.analysisOverviews.put({ ...record, id: existing.id });
      } else {
        await db.analysisOverviews.add(record);
      }
    },
    recoverInterruptedJobs: async () => {
      const timestamp = nowISO();
      for (const job of await db.analysisJobs.filter(row => ['running', 'pausing'].includes(row.status)).toArray()) {
        const snapshot = await readRuntimeSnapshot(job.novelId);
        await saveJobPatch(job.novelId, deriveJobPatchForRecovery(snapshot), { updatedAt: timestamp });
      }
      await db.analysisChunks.filter(chunk => chunk.status === 'running').modify({ status: 'pending', errorMessage: '', updatedAt: timestamp });
    },
    saveSingleChapterAnalysis: async (novelId, chapterIndex, chapterTitle, result) => {
      if (result.chapterAnalyses.length === 0) return null;
      const item = result.chapterAnalyses[0];
      const existing = await db.chapterAnalyses.where('[novelId+chapterIndex]').equals([novelId, chapterIndex]).first();
      const record: ChapterAnalysis = {
        id: existing?.id ?? (undefined as unknown as number),
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
        await db.chapterAnalyses.put({ ...record, id: existing.id });
      } else {
        await db.chapterAnalyses.add(record);
      }
      return serializeChapter(record);
    },
    getChapterAnalysis: async (novelId, chapterIndex) => {
      const row = await db.chapterAnalyses.where('[novelId+chapterIndex]').equals([novelId, chapterIndex]).first();
      return { analysis: serializeChapter(row) };
    },
    getOverview: async novelId => ({ overview: serializeOverview(await loadOverview(novelId)) }),
    getCharacterGraph: async (novelId, chapters) => buildCharacterGraphPayload(chapters, await loadChapterAnalyses(novelId), await loadOverview(novelId)),
  };
}
