import type { WorkerTaskMessage, WorkerTaskResponse } from './protocol';
import type {
  WorkerTaskPayload,
  WorkerTaskProgress,
  WorkerTaskResult,
} from './types';
import type { AppErrorInit } from '@shared/errors';

import {
  AppErrorCode,
  createAppError,
  deserializeAppError,
  isSerializedAppError,
  toAppError,
} from '@shared/errors';

export interface WorkerTaskOptions<Progress> {
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
}

interface WorkerAddEventListener {
  (type: 'message', listener: (event: MessageEvent) => void): void;
  (type: 'error', listener: (event: ErrorEvent) => void): void;
}

export interface WorkerLike {
  addEventListener: WorkerAddEventListener;
  postMessage: (message: unknown) => void;
  terminate: () => void;
}

export interface CreateWorkerTaskRunnerOptions<Payload, Result, Progress> {
  createWorker: () => WorkerLike;
  task: string;
  fallback?: (payload: Payload, options: WorkerTaskOptions<Progress>) => Promise<Result> | Result;
  unavailableError?: AppErrorInit;
}

interface CreateMappedWorkerTaskRunnerOptions<
  TMap extends object,
  TTask extends keyof TMap & string,
> {
  createWorker: () => WorkerLike;
  task: TTask;
  fallback?: (
    payload: WorkerTaskPayload<TMap, TTask>,
    options: WorkerTaskOptions<WorkerTaskProgress<TMap, TTask>>,
  ) => Promise<WorkerTaskResult<TMap, TTask>> | WorkerTaskResult<TMap, TTask>;
  unavailableError?: AppErrorInit;
}

interface PendingWorkerRequest<Payload, Result, Progress> {
  cleanup: () => void;
  onProgress?: (progress: Progress) => void;
  options: WorkerTaskOptions<Progress>;
  payload: Payload;
  reject: (reason?: unknown) => void;
  resolve: (value: Result) => void;
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `worker-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toWorkerExecutionError(error: unknown) {
  return toAppError(error, {
    code: AppErrorCode.WORKER_EXECUTION_FAILED,
    kind: 'execution',
    source: 'worker',
    userMessageKey: 'errors.WORKER_EXECUTION_FAILED',
  });
}

function createWorkerUnavailableError(
  task: string,
  unavailableError: AppErrorInit | undefined,
  cause?: unknown,
) {
  if (unavailableError) {
    return createAppError({
      ...unavailableError,
      cause,
    });
  }

  return createAppError({
    code: AppErrorCode.WORKER_UNAVAILABLE,
    kind: 'unsupported',
    source: 'worker',
    userMessageKey: 'errors.WORKER_UNAVAILABLE',
    debugMessage: `Worker task "${task}" is unavailable.`,
    cause,
  });
}

export function createWorkerTaskRunner<
  TMap extends object,
  TTask extends keyof TMap & string,
>(
  options: CreateMappedWorkerTaskRunnerOptions<TMap, TTask>,
): (
  payload: WorkerTaskPayload<TMap, TTask>,
  options?: WorkerTaskOptions<WorkerTaskProgress<TMap, TTask>>,
) => Promise<WorkerTaskResult<TMap, TTask>>;
export function createWorkerTaskRunner<Payload, Result, Progress>(
  options: CreateWorkerTaskRunnerOptions<Payload, Result, Progress>,
): (
  payload: Payload,
  options?: WorkerTaskOptions<Progress>,
) => Promise<Result>;
export function createWorkerTaskRunner<Payload, Result, Progress>({
  createWorker,
  task,
  fallback,
  unavailableError,
}: CreateWorkerTaskRunnerOptions<Payload, Result, Progress>) {
  if (!fallback && !unavailableError) {
    throw new Error(
      `Worker task "${task}" must configure either a fallback or an unavailableError.`,
    );
  }

  const pending = new Map<string, PendingWorkerRequest<Payload, Result, Progress>>();
  let worker: WorkerLike | null = null;
  let workerDisabled = false;
  let workerInitialized = false;
  let workerUnavailableCause: unknown = null;

  const tearDownWorker = () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    workerInitialized = false;
  };

  const rejectAllPending = (reason: unknown) => {
    for (const request of pending.values()) {
      request.cleanup();
      request.reject(reason);
    }
    pending.clear();
    tearDownWorker();
  };

  const settleUnavailableRequest = (
    request: PendingWorkerRequest<Payload, Result, Progress>,
    cause?: unknown,
  ) => {
    request.cleanup();
    if (!fallback) {
      request.reject(createWorkerUnavailableError(task, unavailableError, cause));
      return;
    }

    Promise.resolve()
      .then(() => fallback(request.payload, request.options))
      .then(request.resolve)
      .catch((fallbackError) => {
        request.reject(toWorkerExecutionError(fallbackError));
      });
  };

  const settleAllPendingAsUnavailable = (cause?: unknown) => {
    const requests = [...pending.values()];
    pending.clear();
    tearDownWorker();
    requests.forEach((request) => {
      settleUnavailableRequest(request, cause);
    });
  };

  const ensureWorker = (): WorkerLike | null => {
    if (workerDisabled || typeof Worker === 'undefined') {
      if (typeof Worker === 'undefined' && workerUnavailableCause === null) {
        workerUnavailableCause = new Error('Worker API is unavailable.');
      }
      return null;
    }

    if (worker) {
      return worker;
    }

    try {
      worker = createWorker();
      workerUnavailableCause = null;
    } catch (error) {
      workerDisabled = true;
      workerUnavailableCause = error;
      tearDownWorker();
      return null;
    }

    worker.addEventListener('message', (event: MessageEvent<WorkerTaskResponse<Progress, Result>>) => {
      const message = event.data;
      const current = pending.get(message.requestId);
      if (!current) {
        return;
      }
      workerInitialized = true;

      if (message.kind === 'progress') {
        current.onProgress?.(message.progress);
        return;
      }

      pending.delete(message.requestId);
      current.cleanup();

      if (message.kind === 'result') {
        current.resolve(message.result);
        return;
      }

      if (message.kind === 'cancelled') {
        current.reject(createAbortError());
        return;
      }

      current.reject(
        isSerializedAppError(message.error)
          ? deserializeAppError(message.error)
          : toWorkerExecutionError(message.error),
      );
    });

    worker.addEventListener('error', (event) => {
      const error = event.error instanceof Error
        ? event.error
        : new Error(event.message || 'Worker execution failed.');

      if (pending.size === 0) {
        workerDisabled = !workerInitialized;
        workerUnavailableCause = workerInitialized ? null : error;
        tearDownWorker();
        return;
      }

      if (!workerInitialized) {
        workerDisabled = true;
        workerUnavailableCause = error;
        settleAllPendingAsUnavailable(error);
        return;
      }

      workerUnavailableCause = null;
      rejectAllPending(toWorkerExecutionError(error));
    });

    return worker;
  };

  return async (payload: Payload, options: WorkerTaskOptions<Progress> = {}): Promise<Result> => {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    const currentWorker = ensureWorker();
    if (!currentWorker) {
      if (fallback) {
        return fallback(payload, options);
      }

      throw createWorkerUnavailableError(task, unavailableError, workerUnavailableCause);
    }

    workerUnavailableCause = null;
    const requestId = createRequestId();

    return new Promise<Result>((resolve, reject) => {
      const handleAbort = () => {
        pending.delete(requestId);
        try {
          currentWorker.postMessage({
            kind: 'cancel',
            requestId,
          } satisfies WorkerTaskMessage<Payload>);
        } catch {
          // ignore cancellation transport errors
        }
        reject(createAbortError());
      };

      const cleanup = () => {
        options.signal?.removeEventListener('abort', handleAbort);
      };

      pending.set(requestId, {
        cleanup,
        onProgress: options.onProgress,
        options,
        payload,
        reject,
        resolve,
      });

      options.signal?.addEventListener('abort', handleAbort, { once: true });

      try {
        currentWorker.postMessage({
          kind: 'run',
          payload,
          requestId,
          task,
        } satisfies WorkerTaskMessage<Payload>);
      } catch (error) {
        const currentRequest = pending.get(requestId);
        pending.delete(requestId);
        workerDisabled = !isAbortError(error);
        workerUnavailableCause = error;
        tearDownWorker();
        if (currentRequest) {
          if (isAbortError(error)) {
            currentRequest.cleanup();
            currentRequest.reject(createAbortError());
            return;
          }
          settleUnavailableRequest(currentRequest, error);
          return;
        }
        reject(
          isAbortError(error)
            ? createAbortError()
            : createWorkerUnavailableError(task, unavailableError, error),
        );
      }
    });
  };
}
