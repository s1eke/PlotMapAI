import type { WorkerTaskMessage, WorkerTaskResponse } from './protocol';
import type {
  WorkerTaskPayload,
  WorkerTaskProgress,
  WorkerTaskResult,
  WorkerTaskSpecMap,
} from './types';

import {
  AppErrorCode,
  deserializeAppError,
  isSerializedAppError,
  toAppError,
} from '@shared/errors';

export interface WorkerTaskOptions<Progress> {
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
}

export interface CreateWorkerTaskRunnerOptions<Payload, Result, Progress> {
  createWorker: () => Worker;
  task: string;
  fallback: (payload: Payload, options: WorkerTaskOptions<Progress>) => Promise<Result> | Result;
}

interface CreateMappedWorkerTaskRunnerOptions<
  TMap extends WorkerTaskSpecMap,
  TTask extends keyof TMap & string,
> {
  createWorker: () => Worker;
  task: TTask;
  fallback: (
    payload: WorkerTaskPayload<TMap, TTask>,
    options: WorkerTaskOptions<WorkerTaskProgress<TMap, TTask>>,
  ) => Promise<WorkerTaskResult<TMap, TTask>> | WorkerTaskResult<TMap, TTask>;
}

interface PendingWorkerRequest<Result, Progress> {
  cleanup: () => void;
  onProgress?: (progress: Progress) => void;
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

export function createWorkerTaskRunner<
  TMap extends WorkerTaskSpecMap,
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
}: CreateWorkerTaskRunnerOptions<Payload, Result, Progress>) {
  const pending = new Map<string, PendingWorkerRequest<Result, Progress>>();
  let worker: Worker | null = null;
  let workerDisabled = false;

  const tearDownWorker = () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  const rejectAllPending = (reason: unknown) => {
    for (const request of pending.values()) {
      request.cleanup();
      request.reject(reason);
    }
    pending.clear();
    tearDownWorker();
  };

  const ensureWorker = (): Worker | null => {
    if (workerDisabled || typeof Worker === 'undefined') {
      return null;
    }

    if (worker) {
      return worker;
    }

    try {
      worker = createWorker();
    } catch {
      workerDisabled = true;
      tearDownWorker();
      return null;
    }

    worker.addEventListener('message', (event: MessageEvent<WorkerTaskResponse<Progress, Result>>) => {
      const message = event.data;
      const current = pending.get(message.requestId);
      if (!current) {
        return;
      }

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
          : toAppError(message.error, {
            code: AppErrorCode.WORKER_EXECUTION_FAILED,
            kind: 'execution',
            source: 'worker',
            userMessageKey: 'errors.WORKER_EXECUTION_FAILED',
          }),
      );
    });

    worker.addEventListener('error', (event) => {
      if (pending.size === 0) {
        workerDisabled = true;
        tearDownWorker();
        return;
      }

      const error = event.error instanceof Error
        ? event.error
        : new Error(event.message || 'Worker execution failed.');
      rejectAllPending(toAppError(error, {
        code: AppErrorCode.WORKER_EXECUTION_FAILED,
        kind: 'execution',
        source: 'worker',
        userMessageKey: 'errors.WORKER_EXECUTION_FAILED',
      }));
    });

    return worker;
  };

  return async (payload: Payload, options: WorkerTaskOptions<Progress> = {}): Promise<Result> => {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    const currentWorker = ensureWorker();
    if (!currentWorker) {
      return fallback(payload, options);
    }

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
        pending.delete(requestId);
        cleanup();
        workerDisabled = !isAbortError(error);
        tearDownWorker();
        Promise.resolve()
          .then(() => fallback(payload, options))
          .then(resolve)
          .catch((error) => {
            reject(toAppError(error, {
              code: AppErrorCode.WORKER_EXECUTION_FAILED,
              kind: 'execution',
              source: 'worker',
              userMessageKey: 'errors.WORKER_EXECUTION_FAILED',
            }));
          });
      }
    });
  };
}
