import type { ChapterImageGalleryEntry } from '@shared/text-processing';
import type { ChapterContent } from '../readerContentService';

import {
  buildChapterImageGalleryEntries,
  sortChapterImageGalleryEntries,
} from '@shared/text-processing';

export interface ReaderImageActivationPayload {
  blockIndex: number;
  chapterIndex: number;
  imageKey: string;
  sourceElement: HTMLElement;
}

export type ReaderImageGalleryEntry = ChapterImageGalleryEntry;

export function buildReaderImageGalleryEntries(
  chapter: Pick<ChapterContent, 'index' | 'plainText' | 'title'>,
): ReaderImageGalleryEntry[] {
  return buildChapterImageGalleryEntries({
    content: chapter.plainText,
    index: chapter.index,
    title: chapter.title,
  });
}

export function createReaderImageEntryId(entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>): string {
  return `${entry.chapterIndex}:${entry.blockIndex}:${entry.imageKey}`;
}

export function sortReaderImageGalleryEntries(
  entries: ReaderImageGalleryEntry[],
): ReaderImageGalleryEntry[] {
  return sortChapterImageGalleryEntries(entries);
}
