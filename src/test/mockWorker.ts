import type {
  BookImportProgress,
} from '@domains/book-import/services/progress';
import type { ParseEpubPayload } from '@domains/book-import/workers/epubClient';
import type { ParseTxtPayload } from '@domains/book-import/workers/txtClient';
import type {
  GraphLayoutPayload,
  GraphLayoutProgress,
} from '@domains/character-graph/workers/layoutClient';
import type {
  PurifyChapterPayload,
  PurifyChaptersPayload,
  PurifyTitlesPayload,
  TextProcessingProgress,
} from '@shared/text-processing/workerTypes';
import type { WorkerTaskMessage, WorkerTaskResponse } from '@infra/workers/protocol';

import { parseEpubCore } from '@domains/book-import/services/epub/core';
import { buildSpaciousLayout } from '@domains/character-graph/utils/characterGraphLayout';
import {
  AppErrorCode,
  serializeAppError,
  toAppError,
} from '@shared/errors';
import {
  purifyChapter,
  purifyTitles,
} from '@shared/text-processing';
import { parseTxtDocument } from '@domains/book-import/services/txt/parser';

interface WorkerMessageEvent {
  data: WorkerTaskResponse<unknown, unknown>;
}

interface WorkerErrorEvent {
  error?: unknown;
  message: string;
}

type MessageListener = (event: WorkerMessageEvent) => void;
type ErrorListener = (event: WorkerErrorEvent) => void;
type WorkerTaskHandler = (
  payload: unknown,
  emitProgress: (progress: unknown) => void,
  signal: AbortSignal,
) => Promise<unknown> | unknown;

const TASK_HANDLERS: Record<string, WorkerTaskHandler> = {
  'graph-layout': (
    payload,
    emitProgress,
    signal,
  ) => {
    const graphPayload = payload as GraphLayoutPayload;
    return buildSpaciousLayout(graphPayload.nodes, graphPayload.edges, {
      signal,
      onProgress: (progress) => {
        emitProgress({ progress, stage: 'layout' } satisfies GraphLayoutProgress);
      },
    });
  },
  'parse-epub': (payload, emitProgress, signal) =>
    parseEpubCore((payload as ParseEpubPayload).file, {
      signal,
      onProgress: emitProgress as (progress: BookImportProgress) => void,
      purificationRules: (payload as ParseEpubPayload).purificationRules,
    }),
  'parse-txt': (payload, emitProgress, signal) => {
    const parsePayload = payload as ParseTxtPayload;
    return parseTxtDocument(parsePayload.file, parsePayload.tocRules, {
      signal,
      onProgress: emitProgress as (progress: BookImportProgress) => void,
    });
  },
  'purify-chapter': (payload, emitProgress, signal) => {
    const purifyPayload = payload as PurifyChapterPayload;
    throwIfAborted(signal);
    emitProgress({ progress: 20, stage: 'preparing' } satisfies TextProcessingProgress);
    const result = purifyChapter(
      purifyPayload.chapter,
      purifyPayload.rules,
      purifyPayload.bookTitle,
      purifyPayload.executionStage,
    );
    throwIfAborted(signal);
    emitProgress({ progress: 100, stage: 'finalizing' } satisfies TextProcessingProgress);
    return result;
  },
  'purify-chapters': (payload, emitProgress, signal) => {
    const purifyPayload = payload as PurifyChaptersPayload;
    throwIfAborted(signal);
    const total = Math.max(purifyPayload.chapters.length, 1);
    const result = purifyPayload.chapters.map((chapter, index) => {
      if (index === 0 || index === purifyPayload.chapters.length - 1 || index % 10 === 0) {
        emitProgress({
          progress: Math.round((index / total) * 100),
          stage: 'purifying',
        } satisfies TextProcessingProgress);
      }

      throwIfAborted(signal);
      return purifyChapter(
        chapter,
        purifyPayload.rules,
        purifyPayload.bookTitle,
        purifyPayload.executionStage,
      );
    });

    throwIfAborted(signal);
    emitProgress({ progress: 100, stage: 'finalizing' } satisfies TextProcessingProgress);
    return result;
  },
  'purify-titles': (payload, emitProgress, signal) => {
    const purifyPayload = payload as PurifyTitlesPayload;
    throwIfAborted(signal);
    emitProgress({ progress: 25, stage: 'preparing' } satisfies TextProcessingProgress);
    const result = purifyTitles(
      purifyPayload.titles,
      purifyPayload.rules,
      purifyPayload.bookTitle,
      purifyPayload.executionStage,
    );
    throwIfAborted(signal);
    emitProgress({ progress: 100, stage: 'finalizing' } satisfies TextProcessingProgress);
    return result;
  },
};

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

function throwIfAborted(signal: AbortSignal): void {
  signal.throwIfAborted?.();
  if (signal.aborted) {
    throw createAbortError();
  }
}

export class MockWorker {
  private readonly messageListeners = new Set<MessageListener>();
  private readonly errorListeners = new Set<ErrorListener>();
  private readonly controllers = new Map<string, AbortController>();
  private isTerminated = false;

  addEventListener(type: 'message', listener: MessageListener): void;
  addEventListener(type: 'error', listener: ErrorListener): void;
  addEventListener(type: string, listener: MessageListener | ErrorListener): void {
    if (type === 'message') {
      this.messageListeners.add(listener as MessageListener);
      return;
    }

    if (type === 'error') {
      this.errorListeners.add(listener as ErrorListener);
    }
  }

  removeEventListener(type: 'message', listener: MessageListener): void;
  removeEventListener(type: 'error', listener: ErrorListener): void;
  removeEventListener(type: string, listener: MessageListener | ErrorListener): void {
    if (type === 'message') {
      this.messageListeners.delete(listener as MessageListener);
      return;
    }

    if (type === 'error') {
      this.errorListeners.delete(listener as ErrorListener);
    }
  }

  postMessage(message: WorkerTaskMessage<unknown>): void {
    if (this.isTerminated) {
      return;
    }

    if (message.kind === 'cancel') {
      this.controllers.get(message.requestId)?.abort();
      return;
    }

    const handler = TASK_HANDLERS[message.task];
    if (!handler) {
      this.emitMessage({
        kind: 'error',
        requestId: message.requestId,
        error: serializeAppError(toAppError(`Unknown worker task: ${message.task}`, {
          code: AppErrorCode.WORKER_EXECUTION_FAILED,
          kind: 'execution',
          source: 'worker',
          userMessageKey: 'errors.WORKER_EXECUTION_FAILED',
        })),
      });
      return;
    }

    const controller = new AbortController();
    this.controllers.set(message.requestId, controller);

    Promise.resolve(
      handler(
        message.payload,
        (progress) => {
          if (!controller.signal.aborted) {
            this.emitMessage({
              kind: 'progress',
              requestId: message.requestId,
              progress,
            });
          }
        },
        controller.signal,
      ),
    )
      .then((result) => {
        this.controllers.delete(message.requestId);
        if (controller.signal.aborted) {
          this.emitMessage({
            kind: 'cancelled',
            requestId: message.requestId,
          });
          return;
        }

        this.emitMessage({
          kind: 'result',
          requestId: message.requestId,
          result,
        });
      })
      .catch((error: unknown) => {
        this.controllers.delete(message.requestId);
        if (controller.signal.aborted || isAbortError(error)) {
          this.emitMessage({
            kind: 'cancelled',
            requestId: message.requestId,
          });
          return;
        }

        this.emitMessage({
          kind: 'error',
          requestId: message.requestId,
          error: serializeAppError(toAppError(error, {
            code: AppErrorCode.WORKER_EXECUTION_FAILED,
            kind: 'execution',
            source: 'worker',
            userMessageKey: 'errors.WORKER_EXECUTION_FAILED',
          })),
        });
      });
  }

  terminate(): void {
    this.isTerminated = true;
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear();
    this.messageListeners.clear();
    this.errorListeners.clear();
  }

  private emitMessage(message: WorkerTaskResponse<unknown, unknown>): void {
    queueMicrotask(() => {
      if (this.isTerminated) {
        return;
      }

      this.messageListeners.forEach((listener) => {
        listener({ data: message });
      });
    });
  }
}

export function installMockWorker(): void {
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: MockWorker,
  });
}
