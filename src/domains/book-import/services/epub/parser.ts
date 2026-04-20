import type { WorkerTaskOptions } from '@infra/workers';
import type { PurifyRule } from '@shared/text-processing';
import type { ParsedBook } from '../types';
import type { BookImportProgress } from '../progress';
import { runParseEpubTask } from '../../workers/epubClient';

export { parseEpubCore } from './core';

export function parseEpub(
  file: File,
  options: WorkerTaskOptions<BookImportProgress> & {
    purificationRules?: PurifyRule[];
  } = {},
): Promise<ParsedBook> {
  return runParseEpubTask({
    file,
    purificationRules: options.purificationRules,
  }, {
    signal: options.signal,
    onProgress: options.onProgress,
  });
}
