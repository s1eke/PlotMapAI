import type { RichBlock } from '../rich-content';
import type { RichContentFormat } from '../rich-content-projection';

export interface Chapter {
  index: number;
  title: string;
  wordCount: number;
}

export interface ChapterContent extends Chapter {
  hasPrev: boolean;
  hasNext: boolean;
  contentFormat: RichContentFormat;
  contentVersion: number;
  plainText: string;
  richBlocks: RichBlock[];
  totalChapters: number;
}

export interface ReaderChapterCacheApi {
  clearCachedChapters: () => void;
  getCachedChapter: (index: number) => ChapterContent | null;
  hasCachedChapter: (index: number) => boolean;
  setCachedChapter: (chapter: ChapterContent) => void;
  snapshotCachedChapters: () => Map<number, ChapterContent>;
}
