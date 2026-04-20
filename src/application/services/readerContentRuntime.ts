import type { BookChapter } from '@shared/contracts';
import type {
  Chapter,
  ChapterContent,
  ReaderContentRuntimeValue,
  ReaderTextProcessingOptions,
} from '@shared/contracts/reader';
import type { TextProcessingProgress } from '@shared/text-processing';

import { bookContentRepository } from '@domains/book-content';

import {
  projectNovelChapter,
  projectNovelText,
  projectNovelTitles,
} from '@application/read-models/novel-text-projection';

export const applicationReaderContentRuntime: ReaderContentRuntimeValue = {
  async loadPurifiedBookChapters(
    novelId: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<BookChapter[]> {
    return projectNovelText(novelId, {
      signal: options.signal,
      onProgress: options.onProgress as ((progress: TextProcessingProgress) => void) | undefined,
    });
  },

  async getChapters(
    novelId: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<Chapter[]> {
    return projectNovelTitles(novelId, options);
  },

  async getChapterContent(
    novelId: number,
    chapterIndex: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<ChapterContent> {
    return projectNovelChapter(novelId, chapterIndex, options);
  },

  getImageBlob(novelId: number, imageKey: string): Promise<Blob | null> {
    return bookContentRepository.getChapterImageBlob(novelId, imageKey);
  },

  getImageGalleryEntries(novelId: number) {
    return bookContentRepository.listNovelImageGalleryEntries(novelId);
  },
};

export async function loadPurifiedBookChapters(
  novelId: number,
  options: ReaderTextProcessingOptions = {},
): Promise<BookChapter[]> {
  return applicationReaderContentRuntime.loadPurifiedBookChapters(novelId, options);
}
