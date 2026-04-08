import type { ReaderImageGalleryEntry } from '@shared/contracts/reader';

import { sortChapterImageGalleryEntries } from '@shared/text-processing';

export function createReaderImageEntryId(
  entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
): string {
  return `${entry.chapterIndex}:${entry.blockIndex}:${entry.imageKey}`;
}

export function sortReaderImageGalleryEntries(
  entries: ReaderImageGalleryEntry[],
): ReaderImageGalleryEntry[] {
  return sortChapterImageGalleryEntries(entries);
}
