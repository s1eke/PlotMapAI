import type { ChapterDetectionRule } from '@shared/text-processing';
import type { BookChapter } from '@shared/contracts';

import { debugLog } from '@shared/debug';
import { AppErrorCode, createAppError, toAppError } from '@shared/errors';
import {
  buildChapterImageGalleryEntries,
  normalizeImportedChapters,
  sortChapterImageGalleryEntries,
} from '@shared/text-processing';

import { parseBook } from './services/bookParser';
import type { BookImportProgress } from './services/progress';

export interface ImportBookOptions {
  signal?: AbortSignal;
  onProgress?: (progress: BookImportProgress) => void;
}

export interface PreparedBookImport {
  author: string;
  chapterCount: number;
  chapters: BookChapter[];
  coverBlob: Blob | null;
  description: string;
  fileHash: string;
  fileType: string;
  imageGalleryEntries: Array<{
    blockIndex: number;
    chapterIndex: number;
    imageKey: string;
    order: number;
  }>;
  images: Array<{
    blob: Blob;
    imageKey: string;
  }>;
  originalEncoding: string;
  originalFilename: string;
  tags: string[];
  title: string;
  totalWords: number;
}

function emitProgress(
  onProgress: ((progress: BookImportProgress) => void) | undefined,
  progress: BookImportProgress,
): void {
  onProgress?.(progress);
}

export const bookImportService = {
  async parseBookImport(
    file: File,
    tocRules: ChapterDetectionRule[],
    options: ImportBookOptions = {},
  ): Promise<PreparedBookImport> {
    const filename = file.name;
    const ext = filename.toLowerCase().split('.').pop();
    if (ext !== 'txt' && ext !== 'epub') {
      throw createAppError({
        code: AppErrorCode.UNSUPPORTED_FILE_TYPE,
        kind: 'unsupported',
        source: 'book-import',
        userMessageKey: 'errors.UNSUPPORTED_FILE_TYPE',
        debugMessage: 'Only .txt and .epub files are supported',
        details: { filename },
      });
    }

    options.signal?.throwIfAborted?.();
    debugLog('Upload', `file="${filename}", tocRules=${tocRules.length}`);

    let parsed;
    try {
      parsed = await parseBook(file, tocRules, {
        signal: options.signal,
        onProgress: options.onProgress,
      });
    } catch (error) {
      throw toAppError(error, {
        code: AppErrorCode.BOOK_IMPORT_FAILED,
        kind: 'execution',
        source: 'book-import',
        userMessageKey: 'errors.BOOK_IMPORT_FAILED',
        retryable: true,
        details: { filename },
      });
    }
    options.signal?.throwIfAborted?.();

    const normalizedChapters = normalizeImportedChapters(parsed.chapters);
    const totalWords = normalizedChapters.reduce((sum, chapter) => sum + chapter.content.length, 0);

    const imageGalleryEntries = sortChapterImageGalleryEntries(
      normalizedChapters.flatMap((chapter, chapterIndex) => {
        options.signal?.throwIfAborted?.();
        return buildChapterImageGalleryEntries({
          content: chapter.content,
          index: chapterIndex,
          title: chapter.title,
        });
      }),
    );
    emitProgress(options.onProgress, { progress: 96, stage: 'finalizing' });
    emitProgress(options.onProgress, { progress: 100, stage: 'finalizing' });

    return {
      title: parsed.title,
      author: parsed.author,
      description: parsed.description,
      tags: parsed.tags,
      fileType: ext,
      fileHash: parsed.fileHash,
      coverBlob: parsed.coverBlob,
      originalFilename: filename,
      originalEncoding: parsed.encoding || 'utf-8',
      totalWords,
      chapterCount: normalizedChapters.length,
      chapters: normalizedChapters.map((chapter, chapterIndex) => ({
        chapterIndex,
        title: chapter.title,
        content: chapter.content,
        wordCount: chapter.content.length,
      })),
      images: parsed.images.map((image) => ({
        imageKey: image.imageKey,
        blob: image.blob,
      })),
      imageGalleryEntries,
    };
  },
};

export type ImportedBookRecord = PreparedBookImport;
