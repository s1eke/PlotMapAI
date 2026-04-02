import type { BookChapter } from '@shared/contracts';
import type { ReaderImageGalleryEntry } from './utils/readerImageGallery';

import { db } from '@infra/db';
import { AppErrorCode, createAppError } from '@shared/errors';
import {
  runPurifyChapterTask,
  runPurifyChaptersTask,
  runPurifyTitlesTask,
  type PurifyRule,
  type TextProcessingProgress,
} from '@shared/text-processing';

import { sortReaderImageGalleryEntries } from './utils/readerImageGallery';

export interface Chapter {
  index: number;
  title: string;
  wordCount: number;
}

export interface ChapterContent extends Chapter {
  content: string;
  totalChapters: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface ReaderTextProcessingOptions {
  signal?: AbortSignal;
  onProgress?: (progress: TextProcessingProgress) => void;
}

async function getPurifyRules(): Promise<PurifyRule[]> {
  const rules = await db.purificationRules.filter((r) => r.isEnabled).sortBy('order');
  return rules.map((r) => ({
    name: r.name,
    pattern: r.pattern,
    replacement: r.replacement,
    is_regex: r.isRegex,
    is_enabled: r.isEnabled,
    order: r.order,
    scope_title: r.scopeTitle,
    scope_content: r.scopeContent,
    book_scope: r.bookScope,
    exclude_book_scope: r.excludeBookScope,
    exclusive_group: r.exclusiveGroup,
  }));
}

async function getNovelTitle(novelId: number): Promise<string> {
  const novel = await db.novels.get(novelId);
  if (!novel) {
    throw createAppError({
      code: AppErrorCode.NOVEL_NOT_FOUND,
      kind: 'not-found',
      source: 'reader',
      userMessageKey: 'errors.NOVEL_NOT_FOUND',
      debugMessage: 'Novel not found',
      details: { novelId },
    });
  }
  return novel.title;
}

function toBookChapter(chapter: {
  chapterIndex: number;
  title: string;
  content: string;
  wordCount: number;
}): BookChapter {
  return {
    chapterIndex: chapter.chapterIndex,
    title: chapter.title,
    content: chapter.content,
    wordCount: chapter.wordCount,
  };
}

export async function loadAndPurifyChapters(
  novelId: number,
  options: ReaderTextProcessingOptions = {},
): Promise<BookChapter[]> {
  const novelTitle = await getNovelTitle(novelId);
  const rawChapters = await db.chapters.where('novelId').equals(novelId).sortBy('chapterIndex');
  const rules = await getPurifyRules();
  if (rules.length === 0) return rawChapters.map(toBookChapter);

  const purified = await runPurifyChaptersTask(
    {
      chapters: rawChapters.map((chapter) => ({
        chapterIndex: chapter.chapterIndex,
        title: chapter.title,
        content: chapter.content,
        wordCount: chapter.wordCount,
      })),
      rules,
      bookTitle: novelTitle,
    },
    options,
  );

  return rawChapters.map((chapter, index) => ({
    ...toBookChapter(chapter),
    title: purified[index].title,
    content: purified[index].content,
  }));
}

export const readerContentService = {
  getChapters: async (
    novelId: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<Chapter[]> => {
    const novelTitle = await getNovelTitle(novelId);
    const rawChapters = await db.chapters
      .where('novelId')
      .equals(novelId)
      .sortBy('chapterIndex');
    const rules = await getPurifyRules();
    if (rules.length === 0) {
      return rawChapters.map((ch) => ({
        index: ch.chapterIndex,
        title: ch.title,
        wordCount: ch.wordCount,
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
        bookTitle: novelTitle,
      },
      options,
    );

    return titles.map((chapter) => ({
      index: chapter.index,
      title: chapter.title,
      wordCount: chapter.wordCount,
    }));
  },

  getChapterContent: async (
    novelId: number,
    chapterIndex: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<ChapterContent> => {
    const novelTitle = await getNovelTitle(novelId);
    const chapter = await db.chapters
      .where('[novelId+chapterIndex]')
      .equals([novelId, chapterIndex])
      .first();
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
    const totalChapters = await db.chapters.where('novelId').equals(novelId).count();
    const rules = await getPurifyRules();
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
          bookTitle: novelTitle,
        },
        options,
      );
      title = purified.title;
      content = purified.content;
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

  getImageBlob: async (novelId: number, imageKey: string): Promise<Blob | null> => {
    const image = await db.chapterImages
      .where('[novelId+imageKey]')
      .equals([novelId, imageKey])
      .first();
    return image?.blob ?? null;
  },

  getImageGalleryEntries: async (novelId: number): Promise<ReaderImageGalleryEntry[]> => {
    const entries = await db.novelImageGalleryEntries
      .where('novelId')
      .equals(novelId)
      .toArray();

    return sortReaderImageGalleryEntries(entries.map((entry) => ({
      blockIndex: entry.blockIndex,
      chapterIndex: entry.chapterIndex,
      imageKey: entry.imageKey,
      order: entry.order,
    })));
  },

  getImageUrl: async (novelId: number, imageKey: string): Promise<string | null> => {
    const blob = await readerContentService.getImageBlob(novelId, imageKey);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  },
};
