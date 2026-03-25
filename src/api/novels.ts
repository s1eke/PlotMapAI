import { db, ensureDefaultTocRules } from '../services/db';
import { debugLog } from '../services/debug';

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

function novelToApi(novel: import('../services/db').Novel, chapterCount: number): NovelView {
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

async function getNextId(): Promise<number> {
  const last = await db.novels.orderBy('id').last();
  return (last?.id ?? 0) + 1;
}

export const novelsApi = {
  list: async (): Promise<NovelView[]> => {
    const [novels, chapters] = await Promise.all([
      db.novels.orderBy('createdAt').reverse().toArray(),
      db.chapters.toArray(),
    ]);
    const countMap = new Map<number, number>();
    for (const ch of chapters) {
      countMap.set(ch.novelId, (countMap.get(ch.novelId) ?? 0) + 1);
    }
    return novels.map(novel => novelToApi(novel, countMap.get(novel.id) ?? 0));
  },

  get: async (id: number): Promise<NovelView> => {
    const novel = await db.novels.get(id);
    if (!novel) throw new Error('Novel not found');
    const count = await db.chapters.where('novelId').equals(id).count();
    return novelToApi(novel, count);
  },

  delete: async (id: number): Promise<{ message: string }> => {
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
      },
    );
    return { message: 'Novel deleted' };
  },

  upload: async (file: File): Promise<NovelView> => {
    const filename = file.name;
    const ext = filename.toLowerCase().split('.').pop();
    if (ext !== 'txt' && ext !== 'epub') {
      throw new Error('Only .txt and .epub files are supported');
    }

    await ensureDefaultTocRules();
    const tocRules = await db.tocRules.filter(r => r.enable).sortBy('serialNumber');
    const ruleDtos = tocRules.map(r => ({ rule: r.rule }));
    debugLog('Upload', `file="${filename}", tocRules=${tocRules.length}`);

    const { parseBook } = await import('../services/bookParser');
    const parsed = await parseBook(file, ruleDtos);
    const id = await getNextId();
    const now = new Date().toISOString();
    const fileType = ext;

    await db.transaction('rw', db.novels, db.chapters, db.coverImages, db.chapterImages, async () => {
      await db.novels.add({
        id,
        title: parsed.title,
        author: parsed.author,
        description: parsed.description,
        tags: parsed.tags,
        fileType,
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
      await db.chapters.bulkAdd(parsed.chapters.map((ch, i) => ({
        id: undefined as unknown as number,
        novelId: id,
        title: ch.title,
        content: ch.content,
        chapterIndex: i,
        wordCount: ch.content.length,
      })));
      if (parsed.images.length > 0) {
        await db.chapterImages.bulkAdd(parsed.images.map(img => ({
          id: undefined as unknown as number,
          novelId: id,
          imageKey: img.imageKey,
          blob: img.blob,
        })));
      }
    });

    return novelToApi(
      (await db.novels.get(id))!,
      parsed.chapters.length,
    );
  },

  getCoverUrl: async (id: number): Promise<string | null> => {
    const cover = await db.coverImages.where('novelId').equals(id).first();
    if (!cover) return null;
    return URL.createObjectURL(cover.blob);
  },
};
