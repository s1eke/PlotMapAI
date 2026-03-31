import { registerWorkerTaskHandlers } from '@infra/workers';
import type { BookImportProgress } from '../services/progress';
import { parseEpubCore } from '../services/epub/core';

registerWorkerTaskHandlers({
  'parse-epub': async (file: File, emitProgress: (progress: BookImportProgress) => void, signal: AbortSignal) => {
    return parseEpubCore(file, {
      signal,
      onProgress: emitProgress,
    });
  },
});
