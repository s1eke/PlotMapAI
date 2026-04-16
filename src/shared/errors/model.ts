export const AppErrorCode = {
  NOVEL_NOT_FOUND: 'NOVEL_NOT_FOUND',
  NO_CHAPTERS: 'NO_CHAPTERS',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  JOB_CREATE_FAILED: 'JOB_CREATE_FAILED',
  CHAPTER_NOT_FOUND: 'CHAPTER_NOT_FOUND',
  CHAPTER_STRUCTURED_CONTENT_MISSING: 'CHAPTER_STRUCTURED_CONTENT_MISSING',
  CHAPTER_MISSING: 'CHAPTER_MISSING',
  READER_MODE_SWITCH_FAILED: 'READER_MODE_SWITCH_FAILED',
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
  ANALYSIS_CONFIG_INVALID: 'ANALYSIS_CONFIG_INVALID',
  ANALYSIS_EXECUTION_FAILED: 'ANALYSIS_EXECUTION_FAILED',
  ANALYSIS_CHUNKING_FAILED: 'ANALYSIS_CHUNKING_FAILED',
  AI_PROVIDER_UNSUPPORTED: 'AI_PROVIDER_UNSUPPORTED',
  AI_BASE_URL_INVALID: 'AI_BASE_URL_INVALID',
  AI_BASE_URL_REQUIRED: 'AI_BASE_URL_REQUIRED',
  AI_API_KEY_REQUIRED: 'AI_API_KEY_REQUIRED',
  AI_MODEL_NAME_REQUIRED: 'AI_MODEL_NAME_REQUIRED',
  AI_CONTEXT_SIZE_INVALID: 'AI_CONTEXT_SIZE_INVALID',
  AI_CONTEXT_SIZE_TOO_SMALL: 'AI_CONTEXT_SIZE_TOO_SMALL',
  AI_REQUEST_TIMEOUT: 'AI_REQUEST_TIMEOUT',
  AI_CONNECTION_FAILED: 'AI_CONNECTION_FAILED',
  AI_RESPONSE_HTTP_ERROR: 'AI_RESPONSE_HTTP_ERROR',
  AI_RESPONSE_INVALID: 'AI_RESPONSE_INVALID',
  AI_RESPONSE_EMPTY: 'AI_RESPONSE_EMPTY',
  AI_RESPONSE_NO_TEXT: 'AI_RESPONSE_NO_TEXT',
  AI_RESPONSE_JSON_INVALID: 'AI_RESPONSE_JSON_INVALID',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  STORAGE_SECURE_UNAVAILABLE: 'STORAGE_SECURE_UNAVAILABLE',
  STORAGE_ENCRYPTED_PAYLOAD_INVALID: 'STORAGE_ENCRYPTED_PAYLOAD_INVALID',
  STORAGE_OPERATION_FAILED: 'STORAGE_OPERATION_FAILED',
  DATABASE_RECOVERY_REQUIRED: 'DATABASE_RECOVERY_REQUIRED',
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',
  CANNOT_DELETE_DEFAULT_RULE: 'CANNOT_DELETE_DEFAULT_RULE',
  INVALID_YAML_FILE: 'INVALID_YAML_FILE',
  YAML_RULES_ARRAY_REQUIRED: 'YAML_RULES_ARRAY_REQUIRED',
  PURIFICATION_RULE_FIELDS_REQUIRED: 'PURIFICATION_RULE_FIELDS_REQUIRED',
  AI_CONFIG_EXPORT_MISSING: 'AI_CONFIG_EXPORT_MISSING',
  AI_CONFIG_PASSWORD_REQUIRED: 'AI_CONFIG_PASSWORD_REQUIRED',
  AI_CONFIG_PASSWORD_TOO_SHORT: 'AI_CONFIG_PASSWORD_TOO_SHORT',
  AI_CONFIG_FILE_FORMAT_INVALID: 'AI_CONFIG_FILE_FORMAT_INVALID',
  AI_CONFIG_FILE_STRUCTURE_INVALID: 'AI_CONFIG_FILE_STRUCTURE_INVALID',
  AI_CONFIG_DECRYPT_FAILED: 'AI_CONFIG_DECRYPT_FAILED',
  AI_CONFIG_JSON_INVALID: 'AI_CONFIG_JSON_INVALID',
  AI_CONFIG_MISSING_FIELDS: 'AI_CONFIG_MISSING_FIELDS',
  BOOK_IMPORT_FAILED: 'BOOK_IMPORT_FAILED',
  WORKER_UNAVAILABLE: 'WORKER_UNAVAILABLE',
  WORKER_EXECUTION_FAILED: 'WORKER_EXECUTION_FAILED',
  TEXT_PROCESSING_RULES_INVALID: 'TEXT_PROCESSING_RULES_INVALID',
} as const;

export type AppErrorCode = typeof AppErrorCode[keyof typeof AppErrorCode];

export type AppErrorKind =
  | 'config'
  | 'validation'
  | 'not-found'
  | 'conflict'
  | 'unsupported'
  | 'storage'
  | 'network'
  | 'execution'
  | 'internal'
  | 'cancelled';

export type AppErrorSource =
  | 'app'
  | 'analysis'
  | 'library'
  | 'reader'
  | 'settings'
  | 'book-import'
  | 'character-graph'
  | 'worker'
  | 'storage';

export type AppErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export type AppErrorMessageParams = Record<string, string | number | boolean>;
export type AppErrorDetails = Record<string, unknown>;

export interface AppErrorInit {
  code: AppErrorCode;
  kind: AppErrorKind;
  source: AppErrorSource;
  retryable?: boolean;
  userVisible?: boolean;
  debugVisible?: boolean;
  userMessageKey?: string;
  userMessageParams?: AppErrorMessageParams;
  debugMessage?: string;
  details?: AppErrorDetails;
  cause?: unknown;
  severity?: AppErrorSeverity;
  name?: string;
}

export interface SerializedErrorCause {
  message: string;
  name?: string;
  stack?: string;
}

export interface SerializedAppError {
  code: AppErrorCode;
  kind: AppErrorKind;
  source: AppErrorSource;
  retryable: boolean;
  userVisible: boolean;
  debugVisible: boolean;
  userMessageKey?: string;
  userMessageParams?: AppErrorMessageParams;
  debugMessage: string;
  details?: AppErrorDetails;
  severity: AppErrorSeverity;
  message: string;
  name: string;
  stack?: string;
  cause?: SerializedErrorCause;
}

export interface ToAppErrorContext {
  code?: AppErrorCode;
  kind?: AppErrorKind;
  source?: AppErrorSource;
  retryable?: boolean;
  userVisible?: boolean;
  debugVisible?: boolean;
  userMessageKey?: string;
  userMessageParams?: AppErrorMessageParams;
  debugMessage?: string;
  details?: AppErrorDetails;
  severity?: AppErrorSeverity;
}

function getDefaultSeverity(kind: AppErrorKind): AppErrorSeverity {
  switch (kind) {
    case 'cancelled':
      return 'info';
    case 'config':
    case 'validation':
    case 'not-found':
    case 'conflict':
    case 'unsupported':
      return 'warning';
    case 'internal':
      return 'fatal';
    default:
      return 'error';
  }
}

function getDefaultUserVisible(kind: AppErrorKind): boolean {
  return kind !== 'cancelled';
}

function getDefaultDebugVisible(kind: AppErrorKind): boolean {
  return kind === 'internal' || kind === 'storage' || kind === 'network' || kind === 'execution';
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'AbortError';
}

function serializeCause(cause: unknown): SerializedErrorCause | undefined {
  if (!(cause instanceof Error)) {
    return cause == null ? undefined : { message: String(cause) };
  }

  return {
    message: cause.message,
    name: cause.name,
    stack: cause.stack,
  };
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly kind: AppErrorKind;
  readonly source: AppErrorSource;
  readonly retryable: boolean;
  readonly userVisible: boolean;
  readonly debugVisible: boolean;
  readonly userMessageKey?: string;
  readonly userMessageParams?: AppErrorMessageParams;
  readonly debugMessage: string;
  readonly details?: AppErrorDetails;
  override readonly cause?: unknown;
  readonly severity: AppErrorSeverity;

  constructor(init: AppErrorInit) {
    const message = init.debugMessage || init.code;
    super(message);
    this.name = init.name || 'AppError';
    this.code = init.code;
    this.kind = init.kind;
    this.source = init.source;
    this.retryable = init.retryable ?? false;
    this.userVisible = init.userVisible ?? getDefaultUserVisible(init.kind);
    this.debugVisible = init.debugVisible ?? getDefaultDebugVisible(init.kind);
    this.userMessageKey = init.userMessageKey;
    this.userMessageParams = init.userMessageParams;
    this.debugMessage = init.debugMessage || message;
    this.details = init.details;
    this.cause = init.cause;
    this.severity = init.severity ?? getDefaultSeverity(init.kind);
  }
}

export function createAppError(init: AppErrorInit): AppError {
  return new AppError(init);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function serializeAppError(error: AppError): SerializedAppError {
  return {
    code: error.code,
    kind: error.kind,
    source: error.source,
    retryable: error.retryable,
    userVisible: error.userVisible,
    debugVisible: error.debugVisible,
    userMessageKey: error.userMessageKey,
    userMessageParams: error.userMessageParams,
    debugMessage: error.debugMessage,
    details: error.details,
    severity: error.severity,
    message: error.message,
    name: error.name,
    stack: error.stack,
    cause: serializeCause(error.cause),
  };
}

export function deserializeAppError(payload: SerializedAppError): AppError {
  const error = new AppError({
    code: payload.code,
    kind: payload.kind,
    source: payload.source,
    retryable: payload.retryable,
    userVisible: payload.userVisible,
    debugVisible: payload.debugVisible,
    userMessageKey: payload.userMessageKey,
    userMessageParams: payload.userMessageParams,
    debugMessage: payload.debugMessage,
    details: payload.details,
    cause: payload.cause,
    severity: payload.severity,
    name: payload.name,
  });

  if (payload.stack) {
    error.stack = payload.stack;
  }

  return error;
}

export function isSerializedAppError(value: unknown): value is SerializedAppError {
  return typeof value === 'object' && value !== null
    && 'code' in value
    && 'kind' in value
    && 'source' in value
    && 'message' in value
    && 'name' in value;
}

export function toAppError(error: unknown, context: ToAppErrorContext = {}): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (isSerializedAppError(error)) {
    return deserializeAppError(error);
  }

  if (isAbortError(error)) {
    return new AppError({
      code: AppErrorCode.OPERATION_CANCELLED,
      kind: 'cancelled',
      source: context.source ?? 'app',
      retryable: false,
      userVisible: false,
      debugVisible: false,
      userMessageKey: context.userMessageKey,
      userMessageParams: context.userMessageParams,
      debugMessage: context.debugMessage || error.message,
      details: context.details,
      cause: error,
      severity: 'info',
    });
  }

  return new AppError({
    code: context.code ?? AppErrorCode.INTERNAL_ERROR,
    kind: context.kind ?? 'internal',
    source: context.source ?? 'app',
    retryable: context.retryable,
    userVisible: context.userVisible,
    debugVisible: context.debugVisible,
    userMessageKey: context.userMessageKey,
    userMessageParams: context.userMessageParams,
    debugMessage: context.debugMessage || (error instanceof Error ? error.message : String(error)),
    details: context.details,
    cause: error,
    severity: context.severity,
  });
}
