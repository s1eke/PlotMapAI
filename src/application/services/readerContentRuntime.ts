import type { BookChapter } from '@shared/contracts';
import type {
  Chapter,
  ChapterContent,
  ReaderContentRuntimeValue,
  ReaderTextProcessingOptions,
} from '@shared/contracts/reader';
import type { TextProcessingProgress } from '@shared/text-processing';

import {
  bookContentRepository,
  chapterRichContentRepository,
} from '@domains/book-content';
import { novelRepository } from '@domains/library';
import { purificationRuleRepository } from '@domains/settings';
import { AppErrorCode, createAppError } from '@shared/errors';

import {
  applyPlainTextOnlyContent,
  applyReaderHeadingRules,
  buildPostAstPlainProjection,
  buildProjectedBookChapters,
} from './chapterTextProjection';

const MIN_SUPPORTED_TXT_IMPORT_FORMAT_VERSION = 2;

function createStructuredContentMissingError(params: {
  chapterIndex: number;
  contentFormat?: string;
  expectedImportFormatVersion?: number;
  importFormatVersion?: number;
  missingTable?: string;
  novelId: number;
  recoveryReason?: 'outdated-txt-import-format';
}) {
  return createAppError({
    code: AppErrorCode.CHAPTER_STRUCTURED_CONTENT_MISSING,
    kind: 'storage',
    source: 'reader',
    userMessageKey: 'reader.reparse.required',
    debugMessage: params.recoveryReason === 'outdated-txt-import-format'
      ? 'TXT structured content uses a retired import format and must be reparsed.'
      : 'Structured chapter content is missing or uses a retired format.',
    details: {
      chapterIndex: params.chapterIndex,
      novelId: params.novelId,
      ...(params.missingTable ? { missingTable: params.missingTable } : {}),
      ...(params.contentFormat ? { contentFormat: params.contentFormat } : {}),
      ...(typeof params.importFormatVersion === 'number'
        ? { importFormatVersion: params.importFormatVersion }
        : {}),
      ...(typeof params.expectedImportFormatVersion === 'number'
        ? { expectedImportFormatVersion: params.expectedImportFormatVersion }
        : {}),
      ...(params.recoveryReason ? { recoveryReason: params.recoveryReason } : {}),
    },
  });
}

export const applicationReaderContentRuntime: ReaderContentRuntimeValue = {
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
    const [novel, chapter, chapterRichContent, totalChapters, rules] = await Promise.all([
      novelRepository.get(novelId),
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
      throw createStructuredContentMissingError({
        chapterIndex,
        missingTable: 'chapterRichContents',
        novelId,
      });
    }

    if (chapterRichContent.contentFormat !== 'rich') {
      throw createStructuredContentMissingError({
        chapterIndex,
        contentFormat: chapterRichContent.contentFormat,
        novelId,
      });
    }

    if (
      novel.fileType.toLowerCase() === 'txt'
      && chapterRichContent.importFormatVersion < MIN_SUPPORTED_TXT_IMPORT_FORMAT_VERSION
    ) {
      throw createStructuredContentMissingError({
        chapterIndex,
        contentFormat: chapterRichContent.contentFormat,
        expectedImportFormatVersion: MIN_SUPPORTED_TXT_IMPORT_FORMAT_VERSION,
        importFormatVersion: chapterRichContent.importFormatVersion,
        novelId,
        recoveryReason: 'outdated-txt-import-format',
      });
    }

    options.signal?.throwIfAborted?.();

    const title = applyReaderHeadingRules(chapter.title, novel.title, rules);
    const projection = buildPostAstPlainProjection({
      chapter,
      chapterRichContent,
      bookTitle: novel.title,
      rules,
    });
    const plainText = applyPlainTextOnlyContent(projection.plainText, novel.title, rules);

    return {
      index: chapter.chapterIndex,
      title,
      wordCount: chapter.wordCount,
      totalChapters,
      hasPrev: chapterIndex > 0,
      hasNext: chapterIndex < totalChapters - 1,
      plainText,
      richBlocks: projection.richBlocks,
      contentFormat: 'rich',
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

export async function loadPurifiedBookChapters(
  novelId: number,
  options: ReaderTextProcessingOptions = {},
): Promise<BookChapter[]> {
  return applicationReaderContentRuntime.loadPurifiedBookChapters(novelId, options);
}
