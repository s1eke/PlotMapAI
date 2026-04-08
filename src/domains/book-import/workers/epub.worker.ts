import { registerWorkerTaskHandlers } from '@infra/workers';
import type { BookImportProgress } from '../services/progress';
import { parseEpubCore } from '../services/epub/core';
import type { ParseEpubPayload } from './epubClient';

registerWorkerTaskHandlers({
  'parse-epub': async (
    payload: ParseEpubPayload,
    emitProgress: (progress: BookImportProgress) => void,
    signal: AbortSignal,
  ) => {
    return parseEpubCore(payload.file, {
      signal,
      onProgress: emitProgress,
      purificationRules: payload.purificationRules,
    });
  },
});
