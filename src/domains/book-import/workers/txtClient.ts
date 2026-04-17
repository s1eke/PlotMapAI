import { createWorkerTaskRunner } from '@infra/workers';
import type { WorkerTaskOptions } from '@infra/workers';
import { AppErrorCode } from '@shared/errors';
import type { ChapterDetectionRule } from '@shared/text-processing';
import type { BookImportProgress } from '../services/progress';
import type { ParsedTextDocument } from '../services/txt/types';

export interface ParseTxtPayload {
  file: File;
  tocRules: ChapterDetectionRule[];
}

const runParseTxtWorkerTask = createWorkerTaskRunner<
  ParseTxtPayload,
  ParsedTextDocument,
  BookImportProgress
>({
  createWorker: () =>
    new Worker(new URL('./txt.worker.ts', import.meta.url), { type: 'module' }),
  task: 'parse-txt',
  unavailableError: {
    code: AppErrorCode.WORKER_UNAVAILABLE,
    kind: 'unsupported',
    source: 'book-import',
    userMessageKey: 'errors.WORKER_UNAVAILABLE',
    debugMessage: 'TXT parsing worker is unavailable.',
  },
});

export function runParseTxtTask(
  payload: ParseTxtPayload,
  options: WorkerTaskOptions<BookImportProgress> = {},
): Promise<ParsedTextDocument> {
  return runParseTxtWorkerTask(payload, options);
}
