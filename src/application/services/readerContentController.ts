import type { BookChapter } from '@shared/contracts';
import type { Chapter, ChapterContent } from '@shared/contracts/reader';

import { bookContentRepository } from '@domains/book-content';
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
    const [bookTitle, chapter, totalChapters, rules] = await Promise.all([
      novelRepository.getNovelTitle(novelId),
      bookContentRepository.getNovelChapter(novelId, chapterIndex),
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

    let { title, content } = chapter;

    if (rules.length > 0) {
      const purified = await runPurifyChapterTask(
        {
          chapter: {
            chapterIndex: chapter.chapterIndex,
            title,
            content,
            wordCount: chapter.wordCount,
          },
          rules,
          bookTitle,
        },
        options,
      );
      ({ title, content } = purified);
    }

    return {
      index: chapter.chapterIndex,
      title,
      content,
      wordCount: chapter.wordCount,
      totalChapters,
      hasPrev: chapterIndex > 0,
      hasNext: chapterIndex < totalChapters - 1,
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
