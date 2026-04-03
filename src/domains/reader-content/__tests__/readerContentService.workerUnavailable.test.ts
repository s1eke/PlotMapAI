import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorCode, createAppError } from '@shared/errors';

import {
  registerReaderContentController,
  resetReaderContentControllerForTests,
} from '../readerContentController';
import { readerContentService } from '../readerContentService';

describe('readerContentService worker unavailable handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetReaderContentControllerForTests();
  });

  it('propagates WORKER_UNAVAILABLE from the registered controller', async () => {
    const unavailableError = createAppError({
      code: AppErrorCode.WORKER_UNAVAILABLE,
      kind: 'unsupported',
      source: 'worker',
      userMessageKey: 'errors.WORKER_UNAVAILABLE',
      debugMessage: 'Title purification worker is unavailable.',
    });

    registerReaderContentController({
      getChapters: vi.fn().mockRejectedValueOnce(unavailableError),
      getChapterContent: vi.fn(),
      getImageBlob: vi.fn(),
      getImageGalleryEntries: vi.fn(),
      loadPurifiedBookChapters: vi.fn(),
    });

    await expect(readerContentService.getChapters(1)).rejects.toMatchObject({
      code: AppErrorCode.WORKER_UNAVAILABLE,
      userMessageKey: 'errors.WORKER_UNAVAILABLE',
    });
  });
});
