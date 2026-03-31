import type { ChapterDetectionRule } from '@shared/text-processing';

import { debugLog } from '@app/debug/service';
import { libraryApi, type NovelView } from '@domains/library';
import { ensureDefaultTocRules } from '@domains/settings';
import { db } from '@infra/db';
import { CACHE_KEYS, storage } from '@infra/storage';
import { AppErrorCode, createAppError, toAppError } from '@shared/errors';
import {
  buildChapterImageGalleryEntries,
  sortChapterImageGalleryEntries,
} from '@shared/text-processing';

import { parseBook } from '../services/bookParser';
import type { BookImportProgress } from '../services/progress';

export interface ImportBookOptions {
  signal?: AbortSignal;
  onProgress?: (progress: BookImportProgress) => void;
}

function emitProgress(
  onProgress: ((progress: BookImportProgress) => void) | undefined,
  progress: BookImportProgress,
): void {
  onProgress?.(progress);
}

export const bookImportApi = {
  async importBook(file: File, options: ImportBookOptions = {}): Promise<NovelView> {
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
    await ensureDefaultTocRules();
    const tocRules = await db.tocRules.filter((rule) => rule.enable).sortBy('serialNumber');
    const ruleDtos: ChapterDetectionRule[] = tocRules.map((rule) => ({
      rule: rule.rule,
      source: rule.isDefault ? 'default' : 'custom',
    }));
    debugLog('Upload', `file="${filename}", tocRules=${tocRules.length}`);

    let parsed;
    try {
      parsed = await parseBook(file, ruleDtos, {
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

    const now = new Date().toISOString();
    const imageGalleryEntries = sortChapterImageGalleryEntries(
      parsed.chapters.flatMap((chapter, chapterIndex) => {
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
        novelId = await db.novels.add({
          title: parsed.title,
          author: parsed.author,
          description: parsed.description,
          tags: parsed.tags,
          fileType: ext,
          fileHash: parsed.fileHash,
          coverPath: parsed.coverBlob ? 'has_cover' : '',
          originalFilename: filename,
          originalEncoding: parsed.encoding || 'utf-8',
          totalWords: parsed.totalWords,
          createdAt: now,
        });
        if (parsed.coverBlob) {
          await db.coverImages.add({
            novelId,
            blob: parsed.coverBlob,
          });
        }
        await db.chapters.bulkAdd(parsed.chapters.map((chapter, chapterIndex) => ({
          novelId,
          title: chapter.title,
          content: chapter.content,
          chapterIndex,
          wordCount: chapter.content.length,
        })));
        if (parsed.images.length > 0) {
          await db.chapterImages.bulkAdd(parsed.images.map((image) => ({
            novelId,
            imageKey: image.imageKey,
            blob: image.blob,
          })));
        }
        if (imageGalleryEntries.length > 0) {
          await db.novelImageGalleryEntries.bulkAdd(imageGalleryEntries.map((entry) => ({
            novelId,
            chapterIndex: entry.chapterIndex,
            blockIndex: entry.blockIndex,
            imageKey: entry.imageKey,
            order: entry.order,
          })));
        }
      },
    );

    storage.cache.remove(CACHE_KEYS.readerState(novelId));
    const novel = await libraryApi.get(novelId);
    emitProgress(options.onProgress, { progress: 100, stage: 'finalizing' });
    return novel;
  },
};
