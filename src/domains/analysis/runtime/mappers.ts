import type {
  AnalysisChunkRecord,
  AnalysisJobRecord,
  AnalysisOverviewRecord,
  ChapterAnalysisRecord,
} from '@infra/db/analysis';

import type {
  AnalysisChunkState,
  AnalysisJobState,
  StoredAnalysisOverview,
  StoredChapterAnalysis,
} from './types';

export function toAnalysisJobState(record: AnalysisJobRecord): AnalysisJobState {
  return { ...record, status: record.status as AnalysisJobState['status'] };
}

export function toAnalysisChunkState(record: AnalysisChunkRecord): AnalysisChunkState {
  return { ...record, status: record.status as AnalysisChunkState['status'] };
}

export function toStoredChapterAnalysis(record: ChapterAnalysisRecord): StoredChapterAnalysis {
  return { ...record };
}

export function toStoredAnalysisOverview(record: AnalysisOverviewRecord): StoredAnalysisOverview {
  return { ...record };
}

export function toAnalysisJobRecord(state: AnalysisJobState): AnalysisJobRecord {
  return { ...state };
}

export function toAnalysisChunkRecord(state: AnalysisChunkState): AnalysisChunkRecord {
  return { ...state };
}

export function toChapterAnalysisRecord(state: StoredChapterAnalysis): ChapterAnalysisRecord {
  return { ...state };
}

export function toAnalysisOverviewRecord(state: StoredAnalysisOverview): AnalysisOverviewRecord {
  return { ...state };
}
