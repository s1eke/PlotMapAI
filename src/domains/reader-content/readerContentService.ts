import type { Chapter, ChapterContent } from '@shared/contracts/reader';

import { getReaderContentController, type ReaderTextProcessingOptions } from './readerContentController';

export type { Chapter, ChapterContent } from '@shared/contracts/reader';
export type { ReaderTextProcessingOptions } from './readerContentController';

export const readerContentService = {
  getChapters: async (
    novelId: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<Chapter[]> => getReaderContentController().getChapters(novelId, options),

  getChapterContent: async (
    novelId: number,
    chapterIndex: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<ChapterContent> =>
    getReaderContentController().getChapterContent(novelId, chapterIndex, options),

  getImageBlob: (novelId: number, imageKey: string): Promise<Blob | null> =>
    getReaderContentController().getImageBlob(novelId, imageKey),

  getImageGalleryEntries: (novelId: number) =>
    getReaderContentController().getImageGalleryEntries(novelId),

  getImageUrl: async (novelId: number, imageKey: string): Promise<string | null> => {
    const blob = await readerContentService.getImageBlob(novelId, imageKey);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  },
};
