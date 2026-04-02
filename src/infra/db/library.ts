import type { EntityTable } from 'dexie';

export interface NovelRecord {
  id: number;
  title: string;
  author: string;
  description: string;
  tags: string[];
  fileType: string;
  fileHash: string;
  coverPath: string;
  originalFilename: string;
  originalEncoding: string;
  totalWords: number;
  createdAt: string;
}

export interface ChapterRecord {
  id: number;
  novelId: number;
  title: string;
  content: string;
  chapterIndex: number;
  wordCount: number;
}

export interface CoverImageRecord {
  id: number;
  novelId: number;
  blob: Blob;
}

export interface ChapterImageRecord {
  id: number;
  novelId: number;
  imageKey: string;
  blob: Blob;
}

export interface NovelImageGalleryEntryRecord {
  id: number;
  novelId: number;
  chapterIndex: number;
  blockIndex: number;
  imageKey: string;
  order: number;
}

export const LIBRARY_DB_SCHEMA = {
  novels: '++id, createdAt',
  chapters: '++id, novelId, [novelId+chapterIndex]',
  coverImages: '++id, novelId',
  chapterImages: '++id, novelId, [novelId+imageKey]',
  novelImageGalleryEntries:
    '++id, novelId, [novelId+chapterIndex], [novelId+chapterIndex+blockIndex], [novelId+imageKey]',
} as const;

export interface LibraryTables {
  novels: EntityTable<NovelRecord, 'id'>;
  chapters: EntityTable<ChapterRecord, 'id'>;
  coverImages: EntityTable<CoverImageRecord, 'id'>;
  chapterImages: EntityTable<ChapterImageRecord, 'id'>;
  novelImageGalleryEntries: EntityTable<NovelImageGalleryEntryRecord, 'id'>;
}
