import type { BookChapter } from '@shared/contracts';
import type { Chapter, ChapterContent } from '@shared/contracts/reader';

import {
  bookContentRepository,
  chapterRichContentRepository,
} from '@domains/book-content';
import { novelRepository } from '@domains/library';
import type {
  ReaderContentController,
  ReaderTextProcessingOptions,
} from '@domains/reader-content';
import * as readerContentDomain from '@domains/reader-content';
import { purificationRuleRepository } from '@domains/settings';
import { AppErrorCode, createAppError } from '@shared/errors';
import type { TextProcessingProgress } from '@shared/text-processing';

import {
  applyPlainTextOnlyContent,
  applyReaderHeadingRules,
  buildPostAstPlainProjection,
  buildProjectedBookChapters,
  resolveProjectedRichBlocks,
} from './chapterTextProjection';

export const applicationReaderContentController: ReaderContentController = {
  async loadPurifiedBookChapters(
    novelId: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<BookChapter[]> {
    const [bookTitle, rawChapters, richChapters, rules] = await Promise.all([
      novelRepository.getNovelTitle(novelId),
      bookContentRepository.listNovelChapters(novelId),
      chapterRichContentRepository.listNovelChapterRichContents(novelId),
      purificationRuleRepository.getEnabledPurificationRules(),
    ]);

    options.signal?.throwIfAborted?.();

    return buildProjectedBookChapters({
      bookTitle,
      rawChapters,
      richChapters,
      rules,
      signal: options.signal,
      onProgress: options.onProgress as ((progress: TextProcessingProgress) => void) | undefined,
    });
  },

  async getChapters(
    novelId: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<Chapter[]> {
    const [bookTitle, rawChapters, rules] = await Promise.all([
      novelRepository.getNovelTitle(novelId),
      bookContentRepository.listNovelChapters(novelId),
      purificationRuleRepository.getEnabledPurificationRules(),
    ]);

    options.signal?.throwIfAborted?.();

    return rawChapters.map((chapter) => ({
      index: chapter.chapterIndex,
      title: applyReaderHeadingRules(chapter.title, bookTitle, rules),
      wordCount: chapter.wordCount,
    }));
  },

  async getChapterContent(
    novelId: number,
    chapterIndex: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<ChapterContent> {
    const [bookTitle, chapter, chapterRichContent, totalChapters, rules] = await Promise.all([
      novelRepository.getNovelTitle(novelId),
      bookContentRepository.getNovelChapter(novelId, chapterIndex),
      chapterRichContentRepository.getNovelChapterRichContent(novelId, chapterIndex),
      bookContentRepository.countNovelChapters(novelId),
      purificationRuleRepository.getEnabledPurificationRules(),
    ]);

    if (!chapter) {
      throw createAppError({
        code: AppErrorCode.CHAPTER_NOT_FOUND,
        kind: 'not-found',
        source: 'reader',
        userMessageKey: 'errors.CHAPTER_NOT_FOUND',
        debugMessage: 'Chapter not found',
        details: { chapterIndex, novelId },
      });
    }

    if (!chapterRichContent) {
      throw createAppError({
        code: AppErrorCode.CHAPTER_STRUCTURED_CONTENT_MISSING,
        kind: 'storage',
        source: 'reader',
        userMessageKey: 'reader.reparse.required',
        debugMessage: 'Structured chapter content is missing for the requested chapter.',
        details: {
          chapterIndex,
          novelId,
          missingTable: 'chapterRichContents',
        },
      });
    }

    options.signal?.throwIfAborted?.();

    const title = applyReaderHeadingRules(chapter.title, bookTitle, rules);
    const projection = buildPostAstPlainProjection({
      chapter,
      chapterRichContent,
      bookTitle,
      rules,
    });
    const plainText = applyPlainTextOnlyContent(projection.plainText, bookTitle, rules);

    return {
      index: chapter.chapterIndex,
      title,
      wordCount: chapter.wordCount,
      totalChapters,
      hasPrev: chapterIndex > 0,
      hasNext: chapterIndex < totalChapters - 1,
      plainText,
      richBlocks: resolveProjectedRichBlocks({
        contentFormat: chapterRichContent.contentFormat,
        plainText,
        richBlocks: projection.richBlocks,
      }),
      contentFormat: chapterRichContent.contentFormat,
      contentVersion: chapterRichContent.contentVersion,
    };
  },

  getImageBlob(novelId: number, imageKey: string): Promise<Blob | null> {
    return bookContentRepository.getChapterImageBlob(novelId, imageKey);
  },

  getImageGalleryEntries(novelId: number) {
    return bookContentRepository.listNovelImageGalleryEntries(novelId);
  },
};

readerContentDomain.registerReaderContentController?.(applicationReaderContentController);

export async function loadPurifiedBookChapters(
  novelId: number,
  options: ReaderTextProcessingOptions = {},
): Promise<BookChapter[]> {
  return applicationReaderContentController.loadPurifiedBookChapters(novelId, options);
}
