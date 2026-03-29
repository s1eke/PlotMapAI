import type { WorkerTaskMessage, WorkerTaskResponse } from './protocol';
import type {
  WorkerTaskHandler,
  WorkerTaskHandlerMap,
  WorkerTaskSpecMap,
} from './types';

import {
  AppErrorCode,
  serializeAppError,
  toAppError,
} from '@shared/errors';
export type { WorkerTaskHandler } from './types';

type WorkerTaskHandlers = Record<string, WorkerTaskHandler<unknown, unknown, unknown>>;

interface WorkerTaskRegistration {
  taskName: string;
  handler: WorkerTaskHandler<unknown, unknown, unknown>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getWorkerTaskRegistrations(handlers: WorkerTaskHandlers): WorkerTaskRegistration[] {
  const registrations: WorkerTaskRegistration[] = [];

  for (const [taskName, handler] of Object.entries(handlers)) {
    if (typeof handler === 'function') {
      registrations.push({ taskName, handler });
    }
  }

  return registrations;
}

export function registerWorkerTaskHandlers<TMap extends WorkerTaskSpecMap>(
  handlers: WorkerTaskHandlerMap<TMap>,
): void;
export function registerWorkerTaskHandlers(handlers: WorkerTaskHandlers): void {
  const workerContext = self as {
    onmessage: ((event: MessageEvent<WorkerTaskMessage<unknown>>) => void) | null;
    postMessage: (message: WorkerTaskResponse<unknown, unknown>) => void;
  };
  const controllers = new Map<string, AbortController>();
  const taskRegistrations = getWorkerTaskRegistrations(handlers);

  workerContext.onmessage = (event: MessageEvent<WorkerTaskMessage<unknown>>) => {
    const message = event.data;
    if (message.kind === 'cancel') {
      controllers.get(message.requestId)?.abort();
      return;
    }

    const registration = taskRegistrations.find((taskRegistration) => taskRegistration.taskName === message.task);
    if (!registration) {
      workerContext.postMessage({
        kind: 'error',
        requestId: message.requestId,
        error: serializeAppError(toAppError(`Unknown worker task: ${message.task}`, {
          code: AppErrorCode.WORKER_EXECUTION_FAILED,
          kind: 'execution',
          source: 'worker',
          userMessageKey: 'errors.WORKER_EXECUTION_FAILED',
        })),
      } satisfies WorkerTaskResponse<unknown, unknown>);
      return;
    }

    const controller = new AbortController();
    controllers.set(message.requestId, controller);

    const emitProgress = (progress: unknown) => {
      if (controller.signal.aborted) {
        return;
      }
      workerContext.postMessage({
        kind: 'progress',
        requestId: message.requestId,
        progress,
      } satisfies WorkerTaskResponse<unknown, unknown>);
    };

    Promise.resolve(registration.handler(message.payload, emitProgress, controller.signal))
      .then((result) => {
        controllers.delete(message.requestId);
        if (controller.signal.aborted) {
          workerContext.postMessage({
            kind: 'cancelled',
            requestId: message.requestId,
          } satisfies WorkerTaskResponse<unknown, unknown>);
          return;
        }
        workerContext.postMessage({
          kind: 'result',
          requestId: message.requestId,
          result,
        } satisfies WorkerTaskResponse<unknown, unknown>);
      })
      .catch((error: unknown) => {
        controllers.delete(message.requestId);
        if (controller.signal.aborted || isAbortError(error)) {
          workerContext.postMessage({
            kind: 'cancelled',
            requestId: message.requestId,
          } satisfies WorkerTaskResponse<unknown, unknown>);
          return;
        }
        const normalized = toAppError(error, {
          code: AppErrorCode.WORKER_EXECUTION_FAILED,
          kind: 'execution',
          source: 'worker',
          userMessageKey: 'errors.WORKER_EXECUTION_FAILED',
        });
        workerContext.postMessage({
          kind: 'error',
          requestId: message.requestId,
          error: serializeAppError(normalized),
        } satisfies WorkerTaskResponse<unknown, unknown>);
      });
  };
}
