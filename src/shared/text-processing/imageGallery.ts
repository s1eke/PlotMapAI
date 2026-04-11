import type { ChapterBlockSource } from './chapterBlocks';

import { buildChapterBlockSequence } from './chapterBlocks';

export interface ChapterImageGalleryEntry {
  blockIndex: number;
  chapterIndex: number;
  imageKey: string;
  order: number;
}
export function buildChapterImageGalleryEntries(
  chapter: ChapterBlockSource,
): ChapterImageGalleryEntry[] {
  return buildChapterBlockSequence(chapter)
    .filter((block) => block.kind === 'image')
    .map((block, order) => ({
      blockIndex: block.blockIndex,
      chapterIndex: block.chapterIndex,
      imageKey: block.imageKey,
      order,
    }));
}

export function sortChapterImageGalleryEntries(
  entries: ChapterImageGalleryEntry[],
): ChapterImageGalleryEntry[] {
  return [...entries].sort((left, right) => {
    if (left.chapterIndex !== right.chapterIndex) {
      return left.chapterIndex - right.chapterIndex;
    }

    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return left.blockIndex - right.blockIndex;
  });
}
