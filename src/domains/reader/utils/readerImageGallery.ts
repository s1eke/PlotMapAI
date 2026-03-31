import type { ChapterImageGalleryEntry } from '@shared/text-processing';
import type { ChapterContent } from '../api/readerApi';

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

export interface ReaderImageViewerState {
  activeEntry: ReaderImageGalleryEntry | null;
  isIndexLoading: boolean;
  isOpen: boolean;
  originRect: DOMRect | null;
  scale: number;
  translateX: number;
  translateY: number;
}

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
