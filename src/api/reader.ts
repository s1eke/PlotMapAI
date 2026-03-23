import { db } from '../services/db';
import type { Chapter as DbChapter } from '../services/db';
import { purify } from '../services/purifier';

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

async function getPurifyRules(): Promise<Array<Record<string, unknown>>> {
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
  }));
}

async function getNovelTitle(novelId: number): Promise<string> {
  const novel = await db.novels.get(novelId);
  if (!novel) throw new Error('Novel not found');
  return novel.title;
}

export async function loadAndPurifyChapters(novelId: number): Promise<DbChapter[]> {
  const novelTitle = await getNovelTitle(novelId);
  const rawChapters = await db.chapters.where('novelId').equals(novelId).sortBy('chapterIndex');
  const rules = await getPurifyRules();
  if (rules.length === 0) return rawChapters;
  return rawChapters.map(ch => ({
    ...ch,
    title: purify(ch.title, rules, 'title', novelTitle),
    content: purify(ch.content, rules, 'content', novelTitle),
  }));
}

export const readerApi = {
  getChapters: async (novelId: number): Promise<Chapter[]> => {
    const novelTitle = await getNovelTitle(novelId);
    const rawChapters = await db.chapters.where('novelId').equals(novelId).sortBy('chapterIndex');
    const rules = await getPurifyRules();
    if (rules.length === 0) {
      return rawChapters.map(ch => ({ index: ch.chapterIndex, title: ch.title, wordCount: ch.wordCount }));
    }
    return rawChapters.map(ch => ({
      index: ch.chapterIndex,
      title: purify(ch.title, rules, 'title', novelTitle),
      wordCount: ch.wordCount,
    }));
  },

  getChapterContent: async (novelId: number, chapterIndex: number): Promise<ChapterContent> => {
    const novelTitle = await getNovelTitle(novelId);
    const chapter = await db.chapters
      .where('[novelId+chapterIndex]')
      .equals([novelId, chapterIndex])
      .first();
    if (!chapter) throw new Error('Chapter not found');
    const totalChapters = await db.chapters.where('novelId').equals(novelId).count();
    const rules = await getPurifyRules();
    let { title, content } = chapter;
    if (rules.length > 0) {
      title = purify(title, rules, 'title', novelTitle);
      content = purify(content, rules, 'content', novelTitle);
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

  getImageUrl: async (novelId: number, imageKey: string): Promise<string | null> => {
    const image = await db.chapterImages
      .where('[novelId+imageKey]')
      .equals([novelId, imageKey])
      .first();
    if (!image) return null;
    return URL.createObjectURL(image.blob);
  },
};
