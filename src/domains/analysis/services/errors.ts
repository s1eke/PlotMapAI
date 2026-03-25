import {
  AppError,
  AppErrorCode,
  type AppErrorDetails,
  type AppErrorMessageParams,
} from '@shared/errors';

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

interface AnalysisErrorOptions {
  cause?: unknown;
  debugVisible?: boolean;
  details?: AppErrorDetails;
  retryable?: boolean;
  userMessageKey?: string;
  userMessageParams?: AppErrorMessageParams;
  userVisible?: boolean;
}

function getAnalysisJobStateKind(code: AnalysisErrorCode): 'conflict' | 'not-found' | 'validation' | 'internal' {
  switch (code) {
    case AnalysisErrorCode.NOVEL_NOT_FOUND:
    case AnalysisErrorCode.JOB_NOT_FOUND:
    case AnalysisErrorCode.CHAPTER_NOT_FOUND:
    case AnalysisErrorCode.CHAPTER_MISSING:
      return 'not-found';
    case AnalysisErrorCode.NO_CHAPTERS:
    case AnalysisErrorCode.CHAPTERS_INCOMPLETE:
    case AnalysisErrorCode.CHAPTERS_INCOMPLETE_FOR_OVERVIEW:
      return 'validation';
    case AnalysisErrorCode.ANALYSIS_IN_PROGRESS:
    case AnalysisErrorCode.JOB_ALREADY_EXISTS:
    case AnalysisErrorCode.NO_PAUSABLE_JOB:
    case AnalysisErrorCode.ANALYSIS_RUNNING:
    case AnalysisErrorCode.JOB_NOT_RESUMABLE:
    case AnalysisErrorCode.NO_RESUMABLE_CHUNKS:
    case AnalysisErrorCode.ANALYSIS_COMPLETED:
    case AnalysisErrorCode.PAUSE_FIRST:
    case AnalysisErrorCode.NO_REUSEABLE_RESULTS:
      return 'conflict';
    default:
      return 'internal';
  }
}

export class AnalysisJobStateError extends AppError {
  readonly code: AnalysisErrorCode;

  constructor(code: AnalysisErrorCode, message?: string, options: AnalysisErrorOptions = {}) {
    super({
      code,
      kind: getAnalysisJobStateKind(code),
      source: 'analysis',
      cause: options.cause,
      debugVisible: options.debugVisible ?? false,
      details: options.details,
      retryable: options.retryable ?? false,
      userMessageKey: options.userMessageKey ?? `errors.${code}`,
      userMessageParams: options.userMessageParams,
      userVisible: options.userVisible ?? true,
      debugMessage: message ?? code,
      name: 'AnalysisJobStateError',
    });
    this.code = code;
  }
}

export class AnalysisConfigError extends AppError {
  constructor(
    message: string,
    options: AnalysisErrorOptions & { code?: AppErrorCode } = {},
  ) {
    super({
      code: options.code ?? AppErrorCode.ANALYSIS_CONFIG_INVALID,
      kind: 'config',
      source: 'analysis',
      cause: options.cause,
      debugVisible: options.debugVisible ?? false,
      details: options.details,
      retryable: options.retryable ?? false,
      userMessageKey: options.userMessageKey,
      userMessageParams: options.userMessageParams,
      userVisible: options.userVisible ?? true,
      debugMessage: message,
      name: 'AnalysisConfigError',
    });
  }
}

export class AnalysisExecutionError extends AppError {
  constructor(
    message: string,
    options: AnalysisErrorOptions & { code?: AppErrorCode } = {},
  ) {
    super({
      code: options.code ?? AppErrorCode.ANALYSIS_EXECUTION_FAILED,
      kind: 'execution',
      source: 'analysis',
      cause: options.cause,
      debugVisible: options.debugVisible ?? true,
      details: options.details,
      retryable: options.retryable ?? false,
      userMessageKey: options.userMessageKey,
      userMessageParams: options.userMessageParams,
      userVisible: options.userVisible ?? true,
      debugMessage: message,
      name: 'AnalysisExecutionError',
    });
  }
}

export class ChunkingError extends AppError {
  constructor(
    message: string,
    options: AnalysisErrorOptions & { code?: AppErrorCode } = {},
  ) {
    super({
      code: options.code ?? AppErrorCode.ANALYSIS_CHUNKING_FAILED,
      kind: 'validation',
      source: 'analysis',
      cause: options.cause,
      debugVisible: options.debugVisible ?? false,
      details: options.details,
      retryable: options.retryable ?? false,
      userMessageKey: options.userMessageKey,
      userMessageParams: options.userMessageParams,
      userVisible: options.userVisible ?? true,
      debugMessage: message,
      name: 'ChunkingError',
    });
  }
}
