import type {
  BookChapter,
  RichBlock,
  RichContentFormat,
  RichInline,
} from '@shared/contracts';
import type { Chapter, ChapterContent } from '@shared/contracts/reader';
import type { StoredChapterRichContent } from '@domains/book-content';

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
  hasPurifyRulesForExecutionStage,
  purify,
  purifyRichBlocks,
  richTextToPlainText,
  runPurifyChaptersTask,
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

function applyPostAstPlainText(
  plainText: string,
  bookTitle: string,
  rules: Awaited<ReturnType<typeof purificationRuleRepository.getEnabledPurificationRules>>,
): string {
  return purify(plainText, rules, 'text', bookTitle, 'post-ast');
}

function applyPlainTextOnlyContent(
  plainText: string,
  bookTitle: string,
  rules: Awaited<ReturnType<typeof purificationRuleRepository.getEnabledPurificationRules>>,
): string {
  return purify(plainText, rules, 'text', bookTitle, 'plain-text-only');
}

function applyReaderHeadingRules(
  title: string,
  bookTitle: string,
  rules: Awaited<ReturnType<typeof purificationRuleRepository.getEnabledPurificationRules>>,
): string {
  return purify(title, rules, 'heading', bookTitle, 'post-ast');
}

function buildPostAstPlainProjection(params: {
  bookTitle: string;
  chapter: BookChapter;
  chapterRichContent: StoredChapterRichContent;
  rules: Awaited<ReturnType<typeof purificationRuleRepository.getEnabledPurificationRules>>;
}): {
    plainText: string;
    richBlocks: RichBlock[];
  } {
  if (params.chapterRichContent.contentFormat === 'rich') {
    const richBlocks = purifyRichBlocks(
      params.chapterRichContent.richBlocks,
      params.rules,
      params.bookTitle,
      'post-ast',
    );

    return {
      plainText: richTextToPlainText(richBlocks),
      richBlocks,
    };
  }

  const plainText = applyPostAstPlainText(
    params.chapterRichContent.plainText || params.chapter.content,
    params.bookTitle,
    params.rules,
  );

  return {
    plainText,
    richBlocks: projectPlainTextToRichBlocks(plainText),
  };
}

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

    const richChapterMap = new Map(richChapters.map((chapter) => [chapter.chapterIndex, chapter]));
    const projectedChapters = rawChapters.map((chapter) => {
      const chapterRichContent = richChapterMap.get(chapter.chapterIndex);
      if (!chapterRichContent) {
        return toBookChapter({
          ...chapter,
          content: applyPostAstPlainText(chapter.content, bookTitle, rules),
        });
      }

      const projection = buildPostAstPlainProjection({
        chapter,
        chapterRichContent,
        bookTitle,
        rules,
      });

      return {
        chapterIndex: chapter.chapterIndex,
        title: chapter.title,
        content: projection.plainText,
        wordCount: chapter.wordCount,
      };
    });

    if (!hasPurifyRulesForExecutionStage(rules, 'plain-text-only')) {
      return projectedChapters;
    }

    const purified = await runPurifyChaptersTask({
      chapters: projectedChapters,
      rules,
      bookTitle,
      executionStage: 'plain-text-only',
    }, options);

    return projectedChapters.map((chapter, index) => ({
      ...chapter,
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
      richBlocks: resolveReaderRichBlocks({
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
