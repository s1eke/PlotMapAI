import type { StoredChapterRichContent } from '@domains/book-content';
import type { NovelView } from '@domains/library';
import type { BookChapter } from '@shared/contracts';
import type { PurifyRule } from '@shared/text-processing';

import { AppErrorCode, createAppError } from '@shared/errors';

import { buildPostAstPlainProjection } from '@application/services/chapterTextProjection';

import type { ChapterBaseProjection } from './types';

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

export function buildRichChapterMetadataDigest(
  chapter: StoredChapterRichContent | null,
): string {
  if (!chapter) {
    return 'missing';
  }

  return [
    chapter.chapterIndex,
    chapter.contentFormat,
    chapter.contentVersion,
    chapter.importFormatVersion,
    chapter.updatedAt,
  ].join(':');
}

export function buildRichChapterVersionDigest(
  chapters: StoredChapterRichContent[],
): string {
  if (chapters.length === 0) {
    return 'none';
  }

  return chapters
    .map((chapter) => buildRichChapterMetadataDigest(chapter))
    .join('\u0001');
}

export function validateReaderChapterRichContent(params: {
  chapterIndex: number;
  chapterRichContent: StoredChapterRichContent | null;
  novel: NovelView;
}): StoredChapterRichContent {
  const {
    chapterIndex,
    chapterRichContent,
    novel,
  } = params;

  if (!chapterRichContent) {
    throw createStructuredContentMissingError({
      chapterIndex,
      missingTable: 'chapterRichContents',
      novelId: novel.id,
    });
  }

  if (chapterRichContent.contentFormat !== 'rich') {
    throw createStructuredContentMissingError({
      chapterIndex,
      contentFormat: chapterRichContent.contentFormat,
      novelId: novel.id,
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
      novelId: novel.id,
      recoveryReason: 'outdated-txt-import-format',
    });
  }

  return chapterRichContent;
}

export function buildChapterBaseProjection(params: {
  bookTitle: string;
  chapter: BookChapter;
  chapterRichContent: StoredChapterRichContent | null;
  rules: PurifyRule[];
}): ChapterBaseProjection {
  const projection = buildPostAstPlainProjection(params);

  return {
    contentVersion: params.chapterRichContent?.contentVersion ?? null,
    plainText: projection.plainText,
    projectedChapter: {
      chapterIndex: params.chapter.chapterIndex,
      title: params.chapter.title,
      content: projection.plainText,
      wordCount: params.chapter.wordCount,
    },
    richBlocks: projection.richBlocks,
  };
}

export function createChapterNotFoundError(
  novelId: number,
  chapterIndex: number,
) {
  return createAppError({
    code: AppErrorCode.CHAPTER_NOT_FOUND,
    kind: 'not-found',
    source: 'reader',
    userMessageKey: 'errors.CHAPTER_NOT_FOUND',
    debugMessage: 'Chapter not found',
    details: { chapterIndex, novelId },
  });
}
