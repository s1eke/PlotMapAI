import { debugLog } from '@app/debug/service';
import { libraryApi, type NovelView } from '@domains/library';
import { ensureDefaultTocRules } from '@domains/settings';
import { db } from '@infra/db';

import { parseBook } from '../services/bookParser';

async function getNextId(): Promise<number> {
  const last = await db.novels.orderBy('id').last();
  return (last?.id ?? 0) + 1;
}

export const bookImportApi = {
  async importBook(file: File): Promise<NovelView> {
    const filename = file.name;
    const ext = filename.toLowerCase().split('.').pop();
    if (ext !== 'txt' && ext !== 'epub') {
      throw new Error('Only .txt and .epub files are supported');
    }

    await ensureDefaultTocRules();
    const tocRules = await db.tocRules.filter((rule) => rule.enable).sortBy('serialNumber');
    const ruleDtos = tocRules.map((rule) => ({ rule: rule.rule }));
    debugLog('Upload', `file="${filename}", tocRules=${tocRules.length}`);

    const parsed = await parseBook(file, ruleDtos);
    const id = await getNextId();
    const now = new Date().toISOString();

    await db.transaction('rw', db.novels, db.chapters, db.coverImages, db.chapterImages, async () => {
      await db.novels.add({
        id,
        title: parsed.title,
        author: parsed.author,
        description: parsed.description,
        tags: parsed.tags,
        fileType: ext,
        fileHash: parsed.fileHash,
        coverPath: parsed.coverBlob ? 'has_cover' : '',
        originalFilename: filename,
        originalEncoding: parsed.encoding || 'utf-8',
        totalWords: parsed.totalWords,
        createdAt: now,
      });
      if (parsed.coverBlob) {
        await db.coverImages.add({
          id: undefined as unknown as number,
          novelId: id,
          blob: parsed.coverBlob,
        });
      }
      await db.chapters.bulkAdd(parsed.chapters.map((chapter, chapterIndex) => ({
        id: undefined as unknown as number,
        novelId: id,
        title: chapter.title,
        content: chapter.content,
        chapterIndex,
        wordCount: chapter.content.length,
      })));
      if (parsed.images.length > 0) {
        await db.chapterImages.bulkAdd(parsed.images.map((image) => ({
          id: undefined as unknown as number,
          novelId: id,
          imageKey: image.imageKey,
          blob: image.blob,
        })));
      }
    });

    return libraryApi.get(id);
  },
};
