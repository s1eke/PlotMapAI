import type { BookChapter } from '@shared/contracts';
import type { Chapter, ChapterContent, ReaderImageGalleryEntry } from '@shared/contracts/reader';
import type { TextProcessingProgress } from '@shared/text-processing';

import { AppErrorCode, createAppError } from '@shared/errors';

export interface ReaderTextProcessingOptions {
  signal?: AbortSignal;
  onProgress?: (progress: TextProcessingProgress) => void;
}

export interface ReaderContentController {
  getChapters: (
    novelId: number,
    options?: ReaderTextProcessingOptions,
  ) => Promise<Chapter[]>;
  getChapterContent: (
    novelId: number,
    chapterIndex: number,
    options?: ReaderTextProcessingOptions,
  ) => Promise<ChapterContent>;
  getImageBlob: (novelId: number, imageKey: string) => Promise<Blob | null>;
  getImageGalleryEntries: (novelId: number) => Promise<ReaderImageGalleryEntry[]>;
  loadPurifiedBookChapters: (
    novelId: number,
    options?: ReaderTextProcessingOptions,
  ) => Promise<BookChapter[]>;
}

let activeReaderContentController: ReaderContentController | null = null;

export function registerReaderContentController(controller: ReaderContentController): void {
  activeReaderContentController = controller;
}

export function getReaderContentController(): ReaderContentController {
  if (activeReaderContentController) {
    return activeReaderContentController;
  }

  throw createAppError({
    code: AppErrorCode.INTERNAL_ERROR,
    kind: 'internal',
    source: 'reader',
    userMessageKey: 'errors.INTERNAL_ERROR',
    debugMessage: 'Reader content controller has not been registered.',
  });
}

export function resetReaderContentControllerForTests(): void {
  activeReaderContentController = null;
}
