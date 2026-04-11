import type {
  ReaderMode,
  ReaderRestoreMeasuredError,
  ReaderRestoreReason,
  ReaderRestoreResult,
} from '@shared/contracts/reader';

export interface RestoreSolverPending {
  kind: 'pending';
  reason: ReaderRestoreReason;
  retryable: boolean;
}

export interface RestoreSolverSettled<TContext = void> {
  kind: 'settled';
  result: ReaderRestoreResult;
  context: TContext;
}

export type RestoreSolverOutcome<TContext = void> =
  | RestoreSolverPending
  | RestoreSolverSettled<TContext>;

export type RestoreSolverStepResult<TValue> =
  | { state: 'success'; value: TValue }
  | { state: 'pending'; reason: ReaderRestoreReason; retryable?: boolean }
  | {
    state: 'failed';
    reason: ReaderRestoreReason;
    retryable?: boolean;
    measuredError?: ReaderRestoreMeasuredError;
  };

export interface RestoreSolverParams<TParsed, TProjected, TExecuted, TContext> {
  attempts: number;
  chapterIndex: number;
  hasTarget: boolean;
  mode: ReaderMode;
  parse: () => RestoreSolverStepResult<TParsed>;
  project: (parsed: TParsed) => RestoreSolverStepResult<TProjected>;
  execute: (projected: TProjected) => RestoreSolverStepResult<TExecuted>;
  validate?: (
    projected: TProjected,
    executed: TExecuted,
  ) => RestoreSolverStepResult<ReaderRestoreMeasuredError | null | undefined>;
  buildContext: (params: {
    executed: TExecuted;
    projected: TProjected;
    parsed: TParsed;
  }) => TContext;
  modeMatchesTarget?: boolean;
}

function toPending(
  reason: ReaderRestoreReason,
  retryable = true,
): RestoreSolverPending {
  return {
    kind: 'pending',
    reason,
    retryable,
  };
}

function toSettled<TContext>(
  params: {
    attempts: number;
    chapterIndex: number;
    mode: ReaderMode;
    status: ReaderRestoreResult['status'];
    reason: ReaderRestoreReason;
    retryable: boolean;
    measuredError?: ReaderRestoreMeasuredError;
    context: TContext;
  },
): RestoreSolverSettled<TContext> {
  return {
    kind: 'settled',
    result: {
      status: params.status,
      reason: params.reason,
      measuredError: params.measuredError,
      retryable: params.retryable,
      attempts: Math.max(1, params.attempts),
      mode: params.mode,
      chapterIndex: params.chapterIndex,
    },
    context: params.context,
  };
}

function toExecutionException<TContext>(
  params: {
    attempts: number;
    chapterIndex: number;
    mode: ReaderMode;
    context: TContext;
  },
): RestoreSolverSettled<TContext> {
  return toSettled({
    ...params,
    status: 'failed',
    reason: 'execution_exception',
    retryable: true,
  });
}

export function restoreStepSuccess<TValue>(value: TValue): RestoreSolverStepResult<TValue> {
  return {
    state: 'success',
    value,
  };
}

export function restoreStepPending<TValue = never>(
  reason: ReaderRestoreReason,
  options?: { retryable?: boolean },
): RestoreSolverStepResult<TValue> {
  return {
    state: 'pending',
    reason,
    retryable: options?.retryable,
  };
}

export function restoreStepFailure<TValue = never>(
  reason: ReaderRestoreReason,
  options?: {
    retryable?: boolean;
    measuredError?: ReaderRestoreMeasuredError;
  },
): RestoreSolverStepResult<TValue> {
  return {
    state: 'failed',
    reason,
    retryable: options?.retryable,
    measuredError: options?.measuredError,
  };
}

export function runRestoreSolver<TParsed, TProjected, TExecuted, TContext>(
  params: RestoreSolverParams<TParsed, TProjected, TExecuted, TContext>,
): RestoreSolverOutcome<TContext> {
  const {
    attempts,
    chapterIndex,
    hasTarget,
    mode,
    modeMatchesTarget = true,
  } = params;

  if (!hasTarget) {
    return toSettled({
      attempts,
      chapterIndex,
      mode,
      status: 'skipped',
      reason: 'no_target',
      retryable: false,
      context: undefined as TContext,
    });
  }

  if (!modeMatchesTarget) {
    return toSettled({
      attempts,
      chapterIndex,
      mode,
      status: 'skipped',
      reason: 'mode_mismatch',
      retryable: false,
      context: undefined as TContext,
    });
  }

  let parsed: TParsed;
  try {
    const parseResult = params.parse();
    if (parseResult.state === 'pending') {
      return toPending(parseResult.reason, parseResult.retryable);
    }
    if (parseResult.state === 'failed') {
      return toSettled({
        attempts,
        chapterIndex,
        mode,
        status: 'failed',
        reason: parseResult.reason,
        retryable: parseResult.retryable ?? false,
        measuredError: parseResult.measuredError,
        context: undefined as TContext,
      });
    }
    parsed = parseResult.value;
  } catch {
    return toExecutionException({
      attempts,
      chapterIndex,
      mode,
      context: undefined as TContext,
    });
  }

  let projected: TProjected;
  try {
    const projectResult = params.project(parsed);
    if (projectResult.state === 'pending') {
      return toPending(projectResult.reason, projectResult.retryable);
    }
    if (projectResult.state === 'failed') {
      return toSettled({
        attempts,
        chapterIndex,
        mode,
        status: 'failed',
        reason: projectResult.reason,
        retryable: projectResult.retryable ?? false,
        measuredError: projectResult.measuredError,
        context: undefined as TContext,
      });
    }
    projected = projectResult.value;
  } catch {
    return toExecutionException({
      attempts,
      chapterIndex,
      mode,
      context: undefined as TContext,
    });
  }

  let executed: TExecuted;
  try {
    const executeResult = params.execute(projected);
    if (executeResult.state === 'pending') {
      return toPending(executeResult.reason, executeResult.retryable);
    }
    if (executeResult.state === 'failed') {
      return toSettled({
        attempts,
        chapterIndex,
        mode,
        status: 'failed',
        reason: executeResult.reason,
        retryable: executeResult.retryable ?? false,
        measuredError: executeResult.measuredError,
        context: undefined as TContext,
      });
    }
    executed = executeResult.value;
  } catch {
    return toExecutionException({
      attempts,
      chapterIndex,
      mode,
      context: undefined as TContext,
    });
  }

  let measuredError: ReaderRestoreMeasuredError | undefined;
  if (params.validate) {
    try {
      const validateResult = params.validate(projected, executed);
      if (validateResult.state === 'pending') {
        return toPending(validateResult.reason, validateResult.retryable);
      }
      if (validateResult.state === 'failed') {
        return toSettled({
          attempts,
          chapterIndex,
          mode,
          status: 'failed',
          reason: validateResult.reason,
          retryable: validateResult.retryable ?? false,
          measuredError: validateResult.measuredError,
          context: undefined as TContext,
        });
      }

      if (validateResult.value) {
        measuredError = validateResult.value;
      }
    } catch {
      return toExecutionException({
        attempts,
        chapterIndex,
        mode,
        context: undefined as TContext,
      });
    }
  }

  return toSettled({
    attempts,
    chapterIndex,
    mode,
    status: 'completed',
    reason: 'restored',
    retryable: false,
    measuredError,
    context: params.buildContext({
      executed,
      projected,
      parsed,
    }),
  });
}
