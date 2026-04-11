import type { ChapterDetectionRule, PurifyRule } from '@shared/text-processing';
import type {
  BookChapter,
  RichBlock,
  RichContentFormat,
} from '@shared/contracts';

import { debugLog } from '@shared/debug';
import { AppErrorCode, createAppError, toAppError } from '@shared/errors';
import {
  buildRichPaginationBlockSequence,
  buildChapterImageGalleryEntries,
  normalizeImportedChapters,
  sortChapterImageGalleryEntries,
} from '@shared/text-processing';

import { parseBook } from './services/bookParser';
import type { BookImportProgress } from './services/progress';

const INITIAL_CHAPTER_CONTENT_VERSION = 1;
const EPUB_IMPORT_FORMAT_VERSION = 1;
const TXT_IMPORT_FORMAT_VERSION = 2;

function resolveImportFormatVersion(fileType: string): number {
  return fileType === 'txt'
    ? TXT_IMPORT_FORMAT_VERSION
    : EPUB_IMPORT_FORMAT_VERSION;
}

export interface PreparedChapterRichContent {
  chapterIndex: number;
  contentFormat: RichContentFormat;
  contentVersion: number;
  importFormatVersion: number;
  plainText: string;
  richBlocks: RichBlock[];
}

export interface ImportBookOptions {
  signal?: AbortSignal;
  onProgress?: (progress: BookImportProgress) => void;
  purificationRules?: PurifyRule[];
}

export interface PreparedBookImport {
  author: string;
  chapterCount: number;
  chapters: BookChapter[];
  chapterRichContents: PreparedChapterRichContent[];
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

function buildRichChapterImageGalleryEntries(params: {
  chapterIndex: number;
  richBlocks: RichBlock[];
}): Array<{
  blockIndex: number;
  chapterIndex: number;
  imageKey: string;
  order: number;
}> {
  const isImageEntry = (
    entry: ReturnType<typeof buildRichPaginationBlockSequence>[number],
  ): entry is ReturnType<typeof buildRichPaginationBlockSequence>[number] & {
    block: Extract<ReturnType<typeof buildRichPaginationBlockSequence>[number]['block'], { type: 'image' }>;
  } => entry.block.type === 'image';

  return buildRichPaginationBlockSequence({
    chapterIndex: params.chapterIndex,
    richBlocks: params.richBlocks,
  })
    .filter(isImageEntry)
    .map((entry, order) => ({
      blockIndex: entry.blockIndex,
      chapterIndex: params.chapterIndex,
      imageKey: entry.block.key,
      order,
    }));
}

function buildPreparedChapterImageGalleryEntries(params: {
  chapterIndex: number;
  content: string;
  contentFormat: RichContentFormat;
  richBlocks: RichBlock[];
  title: string;
}): Array<{
  blockIndex: number;
  chapterIndex: number;
  imageKey: string;
  order: number;
}> {
  if (params.contentFormat === 'rich' && params.richBlocks.length > 0) {
    return buildRichChapterImageGalleryEntries({
      chapterIndex: params.chapterIndex,
      richBlocks: params.richBlocks,
    });
  }

  return buildChapterImageGalleryEntries({
    content: params.content,
    index: params.chapterIndex,
    title: params.title,
  });
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
        purificationRules: options.purificationRules,
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
    const importFormatVersion = resolveImportFormatVersion(ext);
    const totalWords = normalizedChapters.reduce((sum, chapter) => sum + chapter.content.length, 0);
    const chapters = normalizedChapters.map((chapter, chapterIndex) => ({
      chapterIndex,
      title: chapter.title,
      content: chapter.content,
      wordCount: chapter.content.length,
    }));
    const chapterRichContents = normalizedChapters.map((chapter, chapterIndex) => ({
      chapterIndex,
      richBlocks: chapter.richBlocks,
      plainText: chapter.content,
      contentFormat: chapter.contentFormat,
      contentVersion: INITIAL_CHAPTER_CONTENT_VERSION,
      importFormatVersion,
    }));

    const imageGalleryEntries = sortChapterImageGalleryEntries(
      normalizedChapters.flatMap((chapter, chapterIndex) => {
        options.signal?.throwIfAborted?.();
        return buildPreparedChapterImageGalleryEntries({
          chapterIndex,
          content: chapter.content,
          contentFormat: chapter.contentFormat,
          richBlocks: chapter.richBlocks,
          title: chapter.title,
        });
      }),
    );
    emitProgress(options.onProgress, {
      progress: 96,
      stage: 'finalizing',
      detail: 'Building gallery index',
      current: normalizedChapters.length,
      total: normalizedChapters.length,
    });
    emitProgress(options.onProgress, {
      progress: 100,
      stage: 'finalizing',
      detail: 'Prepared import payload',
      current: normalizedChapters.length,
      total: normalizedChapters.length,
    });

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
      chapters,
      chapterRichContents,
      images: parsed.images.map((image) => ({
        imageKey: image.imageKey,
        blob: image.blob,
      })),
      imageGalleryEntries,
    };
  },
};

export type ImportedBookRecord = PreparedBookImport;
