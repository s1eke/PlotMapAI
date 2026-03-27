import { debugLog } from '@app/debug/service';
import { libraryApi, type NovelView } from '@domains/library';
import { ensureDefaultTocRules } from '@domains/settings';
import { db } from '@infra/db';
import { AppErrorCode, createAppError, toAppError } from '@shared/errors';

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

async function getNextId(): Promise<number> {
  const last = await db.novels.orderBy('id').last();
  return (last?.id ?? 0) + 1;
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
    const ruleDtos = tocRules.map((rule) => ({ rule: rule.rule }));
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

    const id = await getNextId();
    const now = new Date().toISOString();

    emitProgress(options.onProgress, { progress: 96, stage: 'finalizing' });
    await db.transaction('rw', db.novels, db.chapters, db.coverImages, db.chapterImages, async () => {
      await db.novels.add({
        id,
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
          id: undefined as unknown as number,
          novelId: id,
          blob: parsed.coverBlob,
        });
      }
      await db.chapters.bulkAdd(parsed.chapters.map((chapter, chapterIndex) => ({
        id: undefined as unknown as number,
        novelId: id,
        title: chapter.title,
        content: chapter.content,
        chapterIndex,
        wordCount: chapter.content.length,
      })));
      if (parsed.images.length > 0) {
        await db.chapterImages.bulkAdd(parsed.images.map((image) => ({
          id: undefined as unknown as number,
          novelId: id,
          imageKey: image.imageKey,
          blob: image.blob,
        })));
      }
    });

    const novel = await libraryApi.get(id);
    emitProgress(options.onProgress, { progress: 100, stage: 'finalizing' });
    return novel;
  },
};
