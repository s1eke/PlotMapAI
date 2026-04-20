import Dexie, { type Transaction } from 'dexie';

import { analysisService } from '@domains/analysis';
import {
  bookContentRepository,
  chapterRichContentRepository,
} from '@domains/book-content';
import { bookImportService, type ImportBookOptions } from '@domains/book-import';
import {
  clearNovelCoverResourcesForNovel,
  novelRepository,
  type NovelView,
} from '@domains/library';
import {
  clearReaderRenderCacheMemoryForNovel,
  deletePersistedReaderRenderCache,
} from '@domains/reader-layout-engine';
import { clearReaderImageResourcesForNovel } from '@domains/reader-media';
import { deleteReadingProgress } from '@domains/reader-session';
import type { ChapterDetectionRule } from '@shared/text-processing';
import { AppErrorCode, createAppError } from '@shared/errors';
import { db } from '@infra/db';
import { clearReaderBootstrapSnapshot } from '@infra/storage/readerStateCache';

import { invalidateNovelTextProjectionCache } from '@application/read-models/novel-text-projection';

function getRequiredTransaction(): Transaction {
  const transaction = Dexie.currentTransaction;
  if (!transaction) {
    throw new Error('Expected an active Dexie transaction.');
  }

  return transaction;
}

export const bookLifecycleService = {
  async importBook(
    file: File,
    tocRules: ChapterDetectionRule[],
    options: ImportBookOptions = {},
  ): Promise<NovelView> {
    const prepared = await bookImportService.parseBookImport(file, tocRules, options);
    let novelId = 0;

    await db.transaction(
      'rw',
      [
        db.novels,
        db.coverImages,
        db.chapterRichContents,
        db.chapters,
        db.chapterImages,
        db.novelImageGalleryEntries,
        db.readerRenderCache,
      ],
      async () => {
        const transaction = getRequiredTransaction();
        novelId = await novelRepository.createImportedNovel({
          title: prepared.title,
          author: prepared.author,
          description: prepared.description,
          tags: prepared.tags,
          fileType: prepared.fileType,
          fileHash: prepared.fileHash,
          originalFilename: prepared.originalFilename,
          originalEncoding: prepared.originalEncoding,
          totalWords: prepared.totalWords,
          chapterCount: prepared.chapterCount,
          coverBlob: prepared.coverBlob,
        }, transaction);

        await bookContentRepository.replaceNovelContent(novelId, {
          chapters: prepared.chapters,
          images: prepared.images,
          imageGalleryEntries: prepared.imageGalleryEntries,
        }, transaction);
        await chapterRichContentRepository.replaceNovelChapterRichContents(novelId, {
          chapters: prepared.chapterRichContents,
        }, transaction);
        await deletePersistedReaderRenderCache(novelId, transaction);
      },
    );

    clearReaderRenderCacheMemoryForNovel(novelId);
    clearReaderBootstrapSnapshot(novelId);
    invalidateNovelTextProjectionCache(novelId);
    return novelRepository.get(novelId);
  },

  async reparseBook(
    novelId: number,
    file: File,
    tocRules: ChapterDetectionRule[],
    options: ImportBookOptions = {},
  ): Promise<NovelView> {
    const existingNovel = await novelRepository.get(novelId);
    const nextFileType = file.name.toLowerCase().split('.').pop();
    if (!nextFileType || nextFileType !== existingNovel.fileType.toLowerCase()) {
      throw createAppError({
        code: AppErrorCode.UNSUPPORTED_FILE_TYPE,
        kind: 'validation',
        source: 'book-import',
        userMessageKey: 'reader.reparse.fileTypeMismatch',
        debugMessage: 'Selected reparse file type does not match the imported novel type.',
        details: {
          expectedFileType: existingNovel.fileType,
          filename: file.name,
          novelId,
          receivedFileType: nextFileType ?? '',
        },
      });
    }

    const prepared = await bookImportService.parseBookImport(file, tocRules, options);

    await db.transaction(
      'rw',
      [
        db.analysisJobs,
        db.analysisChunks,
        db.analysisOverviews,
        db.chapterAnalyses,
        db.readingProgress,
        db.readerRenderCache,
        db.novels,
        db.coverImages,
        db.chapterRichContents,
        db.chapters,
        db.chapterImages,
        db.novelImageGalleryEntries,
      ],
      async () => {
        const transaction = getRequiredTransaction();
        await analysisService.deleteArtifacts(novelId, transaction);
        await deleteReadingProgress(novelId, transaction);
        await novelRepository.replaceImportedNovel(novelId, {
          title: prepared.title,
          author: prepared.author,
          description: prepared.description,
          tags: prepared.tags,
          fileType: prepared.fileType,
          fileHash: prepared.fileHash,
          originalFilename: prepared.originalFilename,
          originalEncoding: prepared.originalEncoding,
          totalWords: prepared.totalWords,
          chapterCount: prepared.chapterCount,
          coverBlob: prepared.coverBlob,
        }, transaction);
        await bookContentRepository.replaceNovelContent(novelId, {
          chapters: prepared.chapters,
          images: prepared.images,
          imageGalleryEntries: prepared.imageGalleryEntries,
        }, transaction);
        await chapterRichContentRepository.replaceNovelChapterRichContents(novelId, {
          chapters: prepared.chapterRichContents,
        }, transaction);
        await deletePersistedReaderRenderCache(novelId, transaction);
      },
    );

    clearNovelCoverResourcesForNovel(novelId);
    clearReaderRenderCacheMemoryForNovel(novelId);
    clearReaderImageResourcesForNovel(novelId);
    clearReaderBootstrapSnapshot(novelId);
    invalidateNovelTextProjectionCache(novelId);

    return novelRepository.get(novelId);
  },

  async deleteNovel(novelId: number): Promise<{ message: string }> {
    await db.transaction(
      'rw',
      [
        db.analysisJobs,
        db.analysisChunks,
        db.analysisOverviews,
        db.chapterAnalyses,
        db.readingProgress,
        db.readerRenderCache,
        db.novels,
        db.coverImages,
        db.chapterRichContents,
        db.chapters,
        db.chapterImages,
        db.novelImageGalleryEntries,
      ],
      async () => {
        const transaction = getRequiredTransaction();
        await analysisService.deleteArtifacts(novelId, transaction);
        await deleteReadingProgress(novelId, transaction);
        await deletePersistedReaderRenderCache(novelId, transaction);
        await chapterRichContentRepository.deleteNovelChapterRichContents(novelId, transaction);
        await bookContentRepository.deleteNovelContent(novelId, transaction);
        await novelRepository.delete(novelId, {
          transaction,
          releaseCoverResources: false,
        });
      },
    );

    clearNovelCoverResourcesForNovel(novelId);
    clearReaderRenderCacheMemoryForNovel(novelId);
    clearReaderImageResourcesForNovel(novelId);
    clearReaderBootstrapSnapshot(novelId);
    invalidateNovelTextProjectionCache(novelId);

    return { message: 'Novel deleted' };
  },
};
