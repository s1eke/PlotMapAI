import { createWorkerTaskRunner } from '@infra/workers';
import type { WorkerTaskOptions } from '@infra/workers';
import { AppErrorCode } from '@shared/errors';
import type { PurifyRule } from '@shared/text-processing';
import type { ParsedBook } from '../services/types';
import type { BookImportProgress } from '../services/progress';

export interface ParseEpubPayload {
  file: File;
  purificationRules?: PurifyRule[];
}

const runParseEpubWorkerTask = createWorkerTaskRunner<
  ParseEpubPayload,
  ParsedBook,
  BookImportProgress
>({
  createWorker: () =>
    new Worker(new URL('./epub.worker.ts', import.meta.url), { type: 'module' }),
  task: 'parse-epub',
  unavailableError: {
    code: AppErrorCode.WORKER_UNAVAILABLE,
    kind: 'unsupported',
    source: 'book-import',
    userMessageKey: 'errors.WORKER_UNAVAILABLE',
    debugMessage: 'EPUB parsing worker is unavailable.',
  },
});

export function runParseEpubTask(
  payload: ParseEpubPayload,
  options: WorkerTaskOptions<BookImportProgress> = {},
): Promise<ParsedBook> {
  return runParseEpubWorkerTask(payload, options);
}
