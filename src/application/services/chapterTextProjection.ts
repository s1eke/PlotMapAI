import type { StoredChapterRichContent } from '@domains/book-content';
import type {
  BookChapter,
  RichBlock,
} from '@shared/contracts';
import type {
  PurifyRule,
  TextProcessingProgress,
} from '@shared/text-processing';

import {
  hasPurifyRulesForExecutionStage,
  projectPlainTextToRichBlocks,
  purify,
  purifyRichBlocks,
  richTextToPlainText,
  runPurifyChaptersTask,
} from '@shared/text-processing';

export interface PlainTextProjectionResult {
  plainText: string;
  richBlocks: RichBlock[];
}

export interface BuildProjectedBookChaptersParams {
  bookTitle: string;
  onProgress?: (progress: TextProcessingProgress) => void;
  rawChapters: BookChapter[];
  richChapters: StoredChapterRichContent[];
  rules: PurifyRule[];
  signal?: AbortSignal;
}

export function applyPostAstPlainText(
  plainText: string,
  bookTitle: string,
  rules: PurifyRule[],
): string {
  return purify(plainText, rules, 'text', bookTitle, 'post-ast');
}

export function applyPlainTextOnlyContent(
  plainText: string,
  bookTitle: string,
  rules: PurifyRule[],
): string {
  return purify(plainText, rules, 'text', bookTitle, 'plain-text-only');
}

export function applyReaderHeadingRules(
  title: string,
  bookTitle: string,
  rules: PurifyRule[],
): string {
  return purify(title, rules, 'heading', bookTitle, 'post-ast');
}

export function buildPostAstPlainProjection(params: {
  bookTitle: string;
  chapter: BookChapter;
  chapterRichContent: StoredChapterRichContent | null;
  rules: PurifyRule[];
}): PlainTextProjectionResult {
  if (params.chapterRichContent?.contentFormat === 'rich') {
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
    params.chapterRichContent?.plainText || params.chapter.content,
    params.bookTitle,
    params.rules,
  );

  return {
    plainText,
    richBlocks: projectPlainTextToRichBlocks(plainText),
  };
}

export async function buildProjectedBookChapters({
  bookTitle,
  onProgress,
  rawChapters,
  richChapters,
  rules,
  signal,
}: BuildProjectedBookChaptersParams): Promise<BookChapter[]> {
  const richChapterMap = new Map(richChapters.map((chapter) => [chapter.chapterIndex, chapter]));
  const projectedChapters = rawChapters.map((chapter) => {
    const projection = buildPostAstPlainProjection({
      chapter,
      chapterRichContent: richChapterMap.get(chapter.chapterIndex) ?? null,
      bookTitle,
      rules,
    });

    return {
      chapterIndex: chapter.chapterIndex,
      title: chapter.title,
      content: projection.plainText,
      wordCount: chapter.wordCount,
    } satisfies BookChapter;
  });

  if (!hasPurifyRulesForExecutionStage(rules, 'plain-text-only')) {
    return projectedChapters;
  }

  const purified = await runPurifyChaptersTask({
    chapters: projectedChapters,
    rules,
    bookTitle,
    executionStage: 'plain-text-only',
  }, {
    signal,
    onProgress,
  });

  return projectedChapters.map((chapter, index) => ({
    ...chapter,
    title: purified[index]?.title ?? chapter.title,
    content: purified[index]?.content ?? chapter.content,
  }));
}
