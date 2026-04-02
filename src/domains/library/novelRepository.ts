import { db } from '@infra/db';
import { AppErrorCode, createAppError } from '@shared/errors';

import { mapNovelRecordToView } from './mappers';

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

export const novelRepository = {
  async list(): Promise<NovelView[]> {
    const novels = await db.novels.orderBy('createdAt').reverse().toArray();
    const counts = await Promise.all(
      novels.map((novel) => db.chapters.where('novelId').equals(novel.id).count()),
    );
    return novels.map((novel, index) => mapNovelRecordToView(novel, counts[index]));
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
    return mapNovelRecordToView(novel, count);
  },

  async delete(id: number): Promise<{ message: string }> {
    await db.transaction(
      'rw',
      [
        db.novels,
        db.chapters,
        db.coverImages,
        db.chapterImages,
        db.novelImageGalleryEntries,
      ],
      async () => {
        await db.novels.delete(id);
        await db.chapters.where('novelId').equals(id).delete();
        await db.coverImages.where('novelId').equals(id).delete();
        await db.chapterImages.where('novelId').equals(id).delete();
        await db.novelImageGalleryEntries.where('novelId').equals(id).delete();
      },
    );

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
