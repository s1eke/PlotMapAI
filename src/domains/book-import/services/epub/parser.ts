import type { WorkerTaskOptions } from '@infra/workers';
import type { PurifyRule } from '@shared/text-processing';
import type { ParsedBook } from '../bookParser';
import type { BookImportProgress } from '../progress';
import { parseEpubCore } from './core';

export { parseEpubCore } from './core';

export function parseEpub(
  file: File,
  options: WorkerTaskOptions<BookImportProgress> & {
    purificationRules?: PurifyRule[];
  } = {},
): Promise<ParsedBook> {
  return parseEpubCore(file, {
    signal: options.signal,
    onProgress: options.onProgress,
    purificationRules: options.purificationRules,
  });
}
