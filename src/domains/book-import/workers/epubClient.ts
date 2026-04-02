import { createWorkerTaskRunner } from '@infra/workers';
import type { WorkerTaskOptions } from '@infra/workers';
import { AppErrorCode } from '@shared/errors';
import type { ParsedBook } from '../services/bookParser';
import type { BookImportProgress } from '../services/progress';

const runParseEpubWorkerTask = createWorkerTaskRunner<File, ParsedBook, BookImportProgress>({
  createWorker: () => new Worker(new URL('./epub.worker.ts', import.meta.url), { type: 'module' }),
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
  file: File,
  options: WorkerTaskOptions<BookImportProgress> = {},
): Promise<ParsedBook> {
  return runParseEpubWorkerTask(file, options);
}
