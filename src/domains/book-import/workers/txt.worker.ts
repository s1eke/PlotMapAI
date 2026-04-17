import { registerWorkerTaskHandlers } from '@infra/workers';
import type { BookImportProgress } from '../services/progress';
import { parseTxtDocument } from '../services/txt/parser';
import type { ParseTxtPayload } from './txtClient';

registerWorkerTaskHandlers({
  'parse-txt': async (
    payload: ParseTxtPayload,
    emitProgress: (progress: BookImportProgress) => void,
    signal: AbortSignal,
  ) => {
    return parseTxtDocument(payload.file, payload.tocRules, {
      signal,
      onProgress: emitProgress,
    });
  },
});
