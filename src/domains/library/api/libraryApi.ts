import { clearReaderRenderCacheMemoryForNovel } from '@domains/reader';
import { db } from '@infra/db';
import { CACHE_KEYS, storage } from '@infra/storage';
import { AppErrorCode, createAppError } from '@shared/errors';

export interface NovelView {
  id: number;
  title: string;
  author: string;
  description: string;
  tags: string[];
  fileType: string;
  hasCover: boolean;
  originalFilename: string;
  originalEncoding: string;
  totalWords: number;
  chapterCount?: number;
  createdAt: string;
}

function novelToApi(novel: import('@infra/db').Novel, chapterCount: number): NovelView {
  return {
    id: novel.id,
    title: novel.title,
    author: novel.author,
    description: novel.description,
    tags: novel.tags,
    fileType: novel.fileType,
    hasCover: !!novel.coverPath,
    originalFilename: novel.originalFilename,
    originalEncoding: novel.originalEncoding,
    totalWords: novel.totalWords,
    createdAt: novel.createdAt,
    chapterCount,
  };
}

export const libraryApi = {
  async list(): Promise<NovelView[]> {
    const novels = await db.novels.orderBy('createdAt').reverse().toArray();
    const counts = await Promise.all(
      novels.map((novel) => db.chapters.where('novelId').equals(novel.id).count()),
    );
    return novels.map((novel, index) => novelToApi(novel, counts[index]));
  },

  async get(id: number): Promise<NovelView> {
    const novel = await db.novels.get(id);
    if (!novel) {
      throw createAppError({
        code: AppErrorCode.NOVEL_NOT_FOUND,
        kind: 'not-found',
        source: 'library',
        userMessageKey: 'errors.NOVEL_NOT_FOUND',
        debugMessage: 'Novel not found',
        details: { novelId: id },
      });
    }
    const count = await db.chapters.where('novelId').equals(id).count();
    return novelToApi(novel, count);
  },

  async delete(id: number): Promise<{ message: string }> {
    await db.transaction('rw', db.tables, async () => {
      await db.novels.delete(id);
      await db.chapters.where('novelId').equals(id).delete();
      await db.readingProgress.where('novelId').equals(id).delete();
      await db.analysisJobs.where('novelId').equals(id).delete();
      await db.analysisChunks.where('novelId').equals(id).delete();
      await db.chapterAnalyses.where('novelId').equals(id).delete();
      await db.analysisOverviews.where('novelId').equals(id).delete();
      await db.coverImages.where('novelId').equals(id).delete();
      await db.chapterImages.where('novelId').equals(id).delete();
      await db.novelImageGalleryEntries.where('novelId').equals(id).delete();
      await db.readerRenderCache.where('novelId').equals(id).delete();
    });
    clearReaderRenderCacheMemoryForNovel(id);
    storage.cache.remove(CACHE_KEYS.readerState(id));
    return { message: 'Novel deleted' };
  },

  async getCoverUrl(id: number): Promise<string | null> {
    const cover = await db.coverImages.where('novelId').equals(id).first();
    if (!cover) {
      return null;
    }
    return URL.createObjectURL(cover.blob);
  },
};
