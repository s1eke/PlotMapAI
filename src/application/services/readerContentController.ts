import type {
  BookChapter,
  RichBlock,
  RichContentFormat,
  RichInline,
} from '@shared/contracts';
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
import {
  runPurifyChapterTask,
  runPurifyChaptersTask,
  runPurifyTitlesTask,
} from '@shared/text-processing';

function createPlainTextRichInlines(paragraph: string): RichInline[] {
  const lines = paragraph.split('\n');
  const children: RichInline[] = [];

  lines.forEach((line, index) => {
    if (line.length > 0) {
      children.push({
        type: 'text',
        text: line,
      });
    }

    if (index < lines.length - 1) {
      children.push({ type: 'lineBreak' });
    }
  });

  return children;
}

function projectPlainTextToRichBlocks(plainText: string): RichBlock[] {
  const normalizedPlainText = plainText.replace(/\r\n/gu, '\n').trim();
  if (normalizedPlainText.length === 0) {
    return [];
  }

  return normalizedPlainText
    .split(/\n\s*\n+/gu)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => ({
      type: 'paragraph',
      children: createPlainTextRichInlines(paragraph),
    }));
}

function resolveReaderRichBlocks(params: {
  contentFormat: RichContentFormat;
  plainText: string;
  richBlocks: RichBlock[];
}): RichBlock[] {
  if (params.contentFormat === 'rich') {
    return params.richBlocks;
  }

  if (params.richBlocks.length > 0) {
    return params.richBlocks;
  }

  return projectPlainTextToRichBlocks(params.plainText);
}

function toBookChapter(chapter: BookChapter): BookChapter {
  return {
    chapterIndex: chapter.chapterIndex,
    title: chapter.title,
    content: chapter.content,
    wordCount: chapter.wordCount,
  };
}

export const applicationReaderContentController: ReaderContentController = {
  async loadPurifiedBookChapters(
    novelId: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<BookChapter[]> {
    const [bookTitle, rawChapters, rules] = await Promise.all([
      novelRepository.getNovelTitle(novelId),
      bookContentRepository.listNovelChapters(novelId),
      purificationRuleRepository.getEnabledPurificationRules(),
    ]);

    if (rules.length === 0) {
      return rawChapters.map(toBookChapter);
    }

    const purified = await runPurifyChaptersTask(
      {
        chapters: rawChapters.map((chapter) => ({
          chapterIndex: chapter.chapterIndex,
          title: chapter.title,
          content: chapter.content,
          wordCount: chapter.wordCount,
        })),
        rules,
        bookTitle,
      },
      options,
    );

    return rawChapters.map((chapter, index) => ({
      ...toBookChapter(chapter),
      title: purified[index]?.title ?? chapter.title,
      content: purified[index]?.content ?? chapter.content,
    }));
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

    if (rules.length === 0) {
      return rawChapters.map((chapter) => ({
        index: chapter.chapterIndex,
        title: chapter.title,
        wordCount: chapter.wordCount,
      }));
    }

    const titles = await runPurifyTitlesTask(
      {
        titles: rawChapters.map((chapter) => ({
          index: chapter.chapterIndex,
          title: chapter.title,
          wordCount: chapter.wordCount,
        })),
        rules,
        bookTitle,
      },
      options,
    );

    return titles.map((chapter) => ({
      index: chapter.index,
      title: chapter.title,
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
        code: AppErrorCode.CHAPTER_MISSING,
        kind: 'storage',
        source: 'reader',
        userMessageKey: 'reader.loadError',
        debugMessage: 'Structured chapter content is missing for the requested chapter.',
        details: {
          chapterIndex,
          novelId,
          missingTable: 'chapterRichContents',
        },
      });
    }

    let { title } = chapter;
    let { plainText } = chapterRichContent;

    if (rules.length > 0) {
      const purified = await runPurifyChapterTask(
        {
          chapter: {
            chapterIndex: chapter.chapterIndex,
            title,
            content: plainText,
            wordCount: chapter.wordCount,
          },
          rules,
          bookTitle,
        },
        options,
      );
      title = purified.title;
      plainText = purified.content;
    }

    return {
      index: chapter.chapterIndex,
      title,
      wordCount: chapter.wordCount,
      totalChapters,
      hasPrev: chapterIndex > 0,
      hasNext: chapterIndex < totalChapters - 1,
      plainText,
      richBlocks: resolveReaderRichBlocks({
        contentFormat: chapterRichContent.contentFormat,
        plainText,
        richBlocks: chapterRichContent.richBlocks,
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
