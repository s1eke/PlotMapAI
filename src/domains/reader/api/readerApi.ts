import { db } from '@infra/db';
import type { Chapter as DbChapter } from '@infra/db';
import { AppErrorCode, createAppError } from '@shared/errors';
import {
  runPurifyChapterTask,
  runPurifyChaptersTask,
  runPurifyTitlesTask,
  type PurifyRule,
  type TextProcessingProgress,
} from '@shared/text-processing';

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

export interface ReadingProgress {
  chapterIndex: number;
  scrollPosition: number;
  viewMode: 'summary' | 'original';
  chapterProgress?: number;
  isTwoColumn?: boolean;
}

export interface ReaderTextProcessingOptions {
  signal?: AbortSignal;
  onProgress?: (progress: TextProcessingProgress) => void;
}

async function getPurifyRules(): Promise<PurifyRule[]> {
  const rules = await db.purificationRules.filter(r => r.isEnabled).sortBy('order');
  return rules.map(r => ({
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

export async function loadAndPurifyChapters(
  novelId: number,
  options: ReaderTextProcessingOptions = {},
): Promise<DbChapter[]> {
  const novelTitle = await getNovelTitle(novelId);
  const rawChapters = await db.chapters.where('novelId').equals(novelId).sortBy('chapterIndex');
  const rules = await getPurifyRules();
  if (rules.length === 0) return rawChapters;

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
    ...chapter,
    title: purified[index].title,
    content: purified[index].content,
  }));
}

export const readerApi = {
  getChapters: async (
    novelId: number,
    options: ReaderTextProcessingOptions = {},
  ): Promise<Chapter[]> => {
    const novelTitle = await getNovelTitle(novelId);
    const rawChapters = await db.chapters.where('novelId').equals(novelId).sortBy('chapterIndex');
    const rules = await getPurifyRules();
    if (rules.length === 0) {
      return rawChapters.map(ch => ({ index: ch.chapterIndex, title: ch.title, wordCount: ch.wordCount }));
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

  getProgress: async (novelId: number): Promise<ReadingProgress> => {
    const progress = await db.readingProgress.where('novelId').equals(novelId).first();
    if (!progress) {
      return {
        chapterIndex: 0,
        scrollPosition: 0,
        viewMode: 'original',
        chapterProgress: 0,
        isTwoColumn: false,
      };
    }
    return {
      chapterIndex: progress.chapterIndex,
      scrollPosition: progress.scrollPosition,
      viewMode: (progress.viewMode || 'original') as 'summary' | 'original',
      chapterProgress: typeof progress.chapterProgress === 'number' ? progress.chapterProgress : undefined,
      isTwoColumn: typeof progress.isTwoColumn === 'boolean' ? progress.isTwoColumn : undefined,
    };
  },

  saveProgress: async (novelId: number, data: Partial<ReadingProgress>): Promise<{ message: string }> => {
    const existing = await db.readingProgress.where('novelId').equals(novelId).first();
    const now = new Date().toISOString();
    if (existing) {
      await db.readingProgress.update(existing.id, {
        chapterIndex: data.chapterIndex ?? existing.chapterIndex,
        scrollPosition: data.scrollPosition ?? existing.scrollPosition,
        viewMode: data.viewMode ?? existing.viewMode,
        chapterProgress: data.chapterProgress ?? existing.chapterProgress,
        isTwoColumn: data.isTwoColumn ?? existing.isTwoColumn,
        updatedAt: now,
      });
    } else {
      await db.readingProgress.add({
        id: undefined as unknown as number,
        novelId,
        chapterIndex: data.chapterIndex ?? 0,
        scrollPosition: data.scrollPosition ?? 0,
        viewMode: data.viewMode ?? 'original',
        chapterProgress: data.chapterProgress,
        isTwoColumn: data.isTwoColumn,
        updatedAt: now,
      });
    }
    return { message: 'Progress saved' };
  },

  getImageBlob: async (novelId: number, imageKey: string): Promise<Blob | null> => {
    const image = await db.chapterImages
      .where('[novelId+imageKey]')
      .equals([novelId, imageKey])
      .first();
    return image?.blob ?? null;
  },

  getImageUrl: async (novelId: number, imageKey: string): Promise<string | null> => {
    const blob = await readerApi.getImageBlob(novelId, imageKey);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  },
};
