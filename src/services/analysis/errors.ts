export const AnalysisErrorCode = {
  NOVEL_NOT_FOUND: 'NOVEL_NOT_FOUND',
  NO_CHAPTERS: 'NO_CHAPTERS',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  JOB_CREATE_FAILED: 'JOB_CREATE_FAILED',
  CHAPTER_NOT_FOUND: 'CHAPTER_NOT_FOUND',
  CHAPTER_MISSING: 'CHAPTER_MISSING',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CHUNK_COMPLETED: 'CHUNK_COMPLETED',
  CHUNKS_NOT_FOUND: 'CHUNKS_NOT_FOUND',
  CHUNK_FAILED: 'CHUNK_FAILED',
  CHAPTERS_INCOMPLETE: 'CHAPTERS_INCOMPLETE',
  OVERVIEW_FAILED: 'OVERVIEW_FAILED',
  APP_RESTARTED: 'APP_RESTARTED',
  ANALYSIS_IN_PROGRESS: 'ANALYSIS_IN_PROGRESS',
  JOB_ALREADY_EXISTS: 'JOB_ALREADY_EXISTS',
  NO_PAUSABLE_JOB: 'NO_PAUSABLE_JOB',
  ANALYSIS_RUNNING: 'ANALYSIS_RUNNING',
  JOB_NOT_RESUMABLE: 'JOB_NOT_RESUMABLE',
  NO_RESUMABLE_CHUNKS: 'NO_RESUMABLE_CHUNKS',
  ANALYSIS_COMPLETED: 'ANALYSIS_COMPLETED',
  PAUSE_FIRST: 'PAUSE_FIRST',
  NO_REUSEABLE_RESULTS: 'NO_REUSEABLE_RESULTS',
  CHAPTERS_INCOMPLETE_FOR_OVERVIEW: 'CHAPTERS_INCOMPLETE_FOR_OVERVIEW',
} as const;

export type AnalysisErrorCode = typeof AnalysisErrorCode[keyof typeof AnalysisErrorCode];

export class AnalysisJobStateError extends Error {
  readonly code: AnalysisErrorCode;

  constructor(code: AnalysisErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AnalysisJobStateError';
    this.code = code;
  }
}

export class AnalysisConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisConfigError';
  }
}

export class AnalysisExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisExecutionError';
  }
}

export class ChunkingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChunkingError';
  }
}
