import type { StoredChapterRichContent } from '@domains/book-content';
import type { NovelView } from '@domains/library';
import type { BookChapter } from '@shared/contracts';

import {
  bookContentRepository,
  chapterRichContentRepository,
} from '@domains/book-content';
import { novelRepository } from '@domains/library';

import { getSourceBucket, memoizePromise } from './cache';

export async function loadNovel(novelId: number): Promise<NovelView> {
  const bucket = getSourceBucket(novelId);
  if (bucket.novel) {
    return bucket.novel;
  }

  const promise = novelRepository.get(novelId).catch((error) => {
    if (bucket.novel === promise) {
      bucket.novel = undefined;
    }
    throw error;
  });
  bucket.novel = promise;
  return promise;
}

export async function loadRawChapterList(novelId: number): Promise<BookChapter[]> {
  const bucket = getSourceBucket(novelId);
  if (bucket.rawChapterList) {
    return bucket.rawChapterList;
  }

  const promise = bookContentRepository.listNovelChapters(novelId).catch((error) => {
    if (bucket.rawChapterList === promise) {
      bucket.rawChapterList = undefined;
    }
    throw error;
  });
  bucket.rawChapterList = promise;
  return promise;
}

export async function loadRawChapter(
  novelId: number,
  chapterIndex: number,
): Promise<BookChapter | null> {
  const bucket = getSourceBucket(novelId);
  if (bucket.rawChapterList) {
    const chapters = await bucket.rawChapterList;
    return chapters.find((chapter) => chapter.chapterIndex === chapterIndex) ?? null;
  }

  return memoizePromise(bucket.rawChaptersByIndex, chapterIndex, async () =>
    bookContentRepository.getNovelChapter(novelId, chapterIndex));
}

export async function loadRichChapterList(
  novelId: number,
): Promise<StoredChapterRichContent[]> {
  const bucket = getSourceBucket(novelId);
  if (bucket.richChapterList) {
    return bucket.richChapterList;
  }

  const promise = chapterRichContentRepository
    .listNovelChapterRichContents(novelId)
    .catch((error) => {
      if (bucket.richChapterList === promise) {
        bucket.richChapterList = undefined;
      }
      throw error;
    });
  bucket.richChapterList = promise;
  return promise;
}

export async function loadRichChapter(
  novelId: number,
  chapterIndex: number,
): Promise<StoredChapterRichContent | null> {
  const bucket = getSourceBucket(novelId);
  if (bucket.richChapterList) {
    const chapters = await bucket.richChapterList;
    return chapters.find((chapter) => chapter.chapterIndex === chapterIndex) ?? null;
  }

  return memoizePromise(bucket.richChaptersByIndex, chapterIndex, async () =>
    chapterRichContentRepository.getNovelChapterRichContent(novelId, chapterIndex));
}
