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
  chapter: Pick<ChapterContent, 'content' | 'index' | 'title'>,
): ReaderImageGalleryEntry[] {
  return buildChapterImageGalleryEntries(chapter);
}

export function createReaderImageEntryId(entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>): string {
  return `${entry.chapterIndex}:${entry.blockIndex}:${entry.imageKey}`;
}

export function sortReaderImageGalleryEntries(
  entries: ReaderImageGalleryEntry[],
): ReaderImageGalleryEntry[] {
  return sortChapterImageGalleryEntries(entries);
}
