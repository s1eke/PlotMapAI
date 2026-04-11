import type { NovelRecord } from '@infra/db/library';

import type { NovelView } from './novelRepository';

export function mapNovelRecordToView(novel: NovelRecord): NovelView {
  return {
    id: novel.id,
    title: novel.title,
    author: novel.author,
    description: novel.description,
    tags: novel.tags,
    fileType: novel.fileType,
    hasCover: Boolean(novel.coverPath),
    originalFilename: novel.originalFilename,
    originalEncoding: novel.originalEncoding,
    totalWords: novel.totalWords,
    chapterCount: novel.chapterCount,
    createdAt: novel.createdAt,
  };
}
