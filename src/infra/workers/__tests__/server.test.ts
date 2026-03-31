import type { WorkerTaskMessage, WorkerTaskResponse } from '../protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '@shared/errors';

import type { WorkerTaskHandler } from '../server';
import { registerWorkerTaskHandlers } from '../server';

interface FakeWorkerContext {
  onmessage: ((event: MessageEvent<WorkerTaskMessage<unknown>>) => void) | null;
  postedMessages: Array<WorkerTaskResponse<unknown, unknown>>;
  postMessage: (message: WorkerTaskResponse<unknown, unknown>) => void;
}

function createWorkerContext(): FakeWorkerContext {
  const postedMessages: Array<WorkerTaskResponse<unknown, unknown>> = [];

  return {
    onmessage: null,
    postedMessages,
    postMessage(message) {
      postedMessages.push(message);
    },
  };
}

function dispatchMessage(
  context: FakeWorkerContext,
  message: WorkerTaskMessage<unknown>,
): void {
  context.onmessage?.({
    data: message,
  } as MessageEvent<WorkerTaskMessage<unknown>>);
}

describe('registerWorkerTaskHandlers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects inherited task handlers from the prototype chain', () => {
    const context = createWorkerContext();
    vi.stubGlobal('self', context);
    const inheritedHandler = vi.fn();
    const handlers = Object.create({
      inheritedTask: inheritedHandler,
    }) as Record<string, WorkerTaskHandler<unknown, unknown, unknown>>;

    registerWorkerTaskHandlers(handlers);
    dispatchMessage(context, {
      kind: 'run',
      requestId: 'request-1',
      task: 'inheritedTask',
      payload: null,
    });

    expect(inheritedHandler).not.toHaveBeenCalled();
    expect(context.postedMessages).toHaveLength(1);
    expect(context.postedMessages[0]).toMatchObject({
      kind: 'error',
      requestId: 'request-1',
      error: {
        code: AppErrorCode.WORKER_EXECUTION_FAILED,
        debugMessage: 'Unknown worker task: inheritedTask',
      },
    });
  });

  it('rejects own properties that are not functions', () => {
    const context = createWorkerContext();
    vi.stubGlobal('self', context);
    const handlers = {
      invalidTask: 'not-a-function',
    } as unknown as Record<string, WorkerTaskHandler<unknown, unknown, unknown>>;

    registerWorkerTaskHandlers(handlers);

    expect(() => {
      dispatchMessage(context, {
        kind: 'run',
        requestId: 'request-2',
        task: 'invalidTask',
        payload: null,
      });
    }).not.toThrow();
    expect(context.postedMessages).toHaveLength(1);
    expect(context.postedMessages[0]).toMatchObject({
      kind: 'error',
      requestId: 'request-2',
      error: {
        code: AppErrorCode.WORKER_EXECUTION_FAILED,
        debugMessage: 'Unknown worker task: invalidTask',
      },
    });
  });
});
