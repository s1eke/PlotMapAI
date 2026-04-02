import type { ChapterDetectionRule } from '@shared/text-processing';
import type {
  ChapterImageRecord,
  ChapterRecord,
  CoverImageRecord,
  NovelImageGalleryEntryRecord,
  NovelRecord,
} from '@infra/db/library';

import { debugLog } from '@shared/debug';
import { db } from '@infra/db';
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

export interface ImportedBookRecord {
  novelId: number;
}

function emitProgress(
  onProgress: ((progress: BookImportProgress) => void) | undefined,
  progress: BookImportProgress,
): void {
  onProgress?.(progress);
}

export const bookImportService = {
  async importBook(
    file: File,
    tocRules: ChapterDetectionRule[],
    options: ImportBookOptions = {},
  ): Promise<ImportedBookRecord> {
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

    const now = new Date().toISOString();
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
    let novelId = 0;

    emitProgress(options.onProgress, { progress: 96, stage: 'finalizing' });
    await db.transaction(
      'rw',
      [
        db.novels,
        db.chapters,
        db.coverImages,
        db.chapterImages,
        db.novelImageGalleryEntries,
      ],
      async () => {
        const novelRecord = {
          title: parsed.title,
          author: parsed.author,
          description: parsed.description,
          tags: parsed.tags,
          fileType: ext,
          fileHash: parsed.fileHash,
          coverPath: parsed.coverBlob ? 'has_cover' : '',
          originalFilename: filename,
          originalEncoding: parsed.encoding || 'utf-8',
          totalWords,
          createdAt: now,
        } satisfies Omit<NovelRecord, 'id'>;

        novelId = await db.novels.add(novelRecord);
        if (parsed.coverBlob) {
          const coverImageRecord = {
            novelId,
            blob: parsed.coverBlob,
          } satisfies Omit<CoverImageRecord, 'id'>;

          await db.coverImages.add(coverImageRecord);
        }
        await db.chapters.bulkAdd(normalizedChapters.map((chapter, chapterIndex) => ({
          novelId,
          title: chapter.title,
          content: chapter.content,
          chapterIndex,
          wordCount: chapter.content.length,
        } satisfies Omit<ChapterRecord, 'id'>)));
        if (parsed.images.length > 0) {
          await db.chapterImages.bulkAdd(parsed.images.map((image) => ({
            novelId,
            imageKey: image.imageKey,
            blob: image.blob,
          } satisfies Omit<ChapterImageRecord, 'id'>)));
        }
        if (imageGalleryEntries.length > 0) {
          await db.novelImageGalleryEntries.bulkAdd(imageGalleryEntries.map((entry) => ({
            novelId,
            chapterIndex: entry.chapterIndex,
            blockIndex: entry.blockIndex,
            imageKey: entry.imageKey,
            order: entry.order,
          } satisfies Omit<NovelImageGalleryEntryRecord, 'id'>)));
        }
      },
    );

    emitProgress(options.onProgress, { progress: 100, stage: 'finalizing' });
    return { novelId };
  },
};
