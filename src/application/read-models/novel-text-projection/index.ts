import type { BookChapter } from '@shared/contracts';
import type { Chapter } from '@shared/contracts/reader';

import {
  applyPlainTextOnlyContent,
  applyReaderHeadingRules,
  finalizeProjectedBookChapters,
} from '@application/services/chapterTextProjection';

import {
  getCurrentNovelContentVersion,
  getDerivedBucket,
} from './cache';
import {
  buildChapterBaseProjection,
  buildRichChapterMetadataDigest,
  buildRichChapterVersionDigest,
  createChapterNotFoundError,
  validateReaderChapterRichContent,
} from './chapterProjection';
import { loadRulesSnapshot } from './rulesSnapshot';
import {
  loadNovel,
  loadRawChapter,
  loadRawChapterList,
  loadRichChapter,
  loadRichChapterList,
} from './sources';
import type {
  NovelTextProjectionOptions,
  ReaderChapterProjection,
} from './types';

export type {
  NovelTextProjectionOptions,
  ReaderChapterProjection,
} from './types';
export {
  invalidateNovelTextProjectionCache,
  resetNovelTextProjectionCacheForTests,
} from './cache';

export async function projectNovelTitles(
  novelId: number,
  options: NovelTextProjectionOptions = {},
): Promise<Chapter[]> {
  const [novel, rawChapters, rulesSnapshot] = await Promise.all([
    loadNovel(novelId),
    loadRawChapterList(novelId),
    loadRulesSnapshot(),
  ]);

  options.signal?.throwIfAborted?.();

  const derivedBucket = getDerivedBucket(novelId);
  const cacheKey = [
    getCurrentNovelContentVersion(novelId),
    rulesSnapshot.digests.postAstHeading,
  ].join(':');
  const cached = derivedBucket.titlesByKey.get(cacheKey);
  if (cached) {
    return cached;
  }

  const projectedTitles = rawChapters.map((chapter) => ({
    index: chapter.chapterIndex,
    title: applyReaderHeadingRules(chapter.title, novel.title, rulesSnapshot.rules),
    wordCount: chapter.wordCount,
  }));

  derivedBucket.titlesByKey.set(cacheKey, projectedTitles);
  return projectedTitles;
}

export async function projectNovelChapter(
  novelId: number,
  chapterIndex: number,
  options: NovelTextProjectionOptions = {},
): Promise<ReaderChapterProjection> {
  const [novel, chapter, chapterRichContent, rulesSnapshot] = await Promise.all([
    loadNovel(novelId),
    loadRawChapter(novelId, chapterIndex),
    loadRichChapter(novelId, chapterIndex),
    loadRulesSnapshot(),
  ]);

  if (!chapter) {
    throw createChapterNotFoundError(novelId, chapterIndex);
  }

  const validatedRichContent = validateReaderChapterRichContent({
    chapterIndex,
    chapterRichContent,
    novel,
  });

  options.signal?.throwIfAborted?.();

  const derivedBucket = getDerivedBucket(novelId);
  const baseCacheKey = [
    getCurrentNovelContentVersion(novelId),
    chapterIndex,
    rulesSnapshot.digests.postAstContent,
    buildRichChapterMetadataDigest(validatedRichContent),
  ].join(':');

  let baseProjection = derivedBucket.chapterBaseByKey.get(baseCacheKey);
  if (!baseProjection) {
    baseProjection = buildChapterBaseProjection({
      chapter,
      chapterRichContent: validatedRichContent,
      bookTitle: novel.title,
      rules: rulesSnapshot.rules,
    });
    derivedBucket.chapterBaseByKey.set(baseCacheKey, baseProjection);
  }

  const finalCacheKey = [
    baseCacheKey,
    rulesSnapshot.digests.plainTextOnlyText,
  ].join(':');
  const cached = derivedBucket.chapterContentByKey.get(finalCacheKey);
  if (cached) {
    return cached;
  }

  const projectedChapter: ReaderChapterProjection = {
    index: chapter.chapterIndex,
    title: applyReaderHeadingRules(chapter.title, novel.title, rulesSnapshot.rules),
    wordCount: chapter.wordCount,
    totalChapters: novel.chapterCount,
    hasPrev: chapterIndex > 0,
    hasNext: chapterIndex < novel.chapterCount - 1,
    plainText: applyPlainTextOnlyContent(
      baseProjection.plainText,
      novel.title,
      rulesSnapshot.rules,
    ),
    richBlocks: baseProjection.richBlocks,
    contentFormat: 'rich',
    contentVersion: validatedRichContent.contentVersion,
  };

  derivedBucket.chapterContentByKey.set(finalCacheKey, projectedChapter);
  return projectedChapter;
}

export async function projectNovelText(
  novelId: number,
  options: NovelTextProjectionOptions = {},
): Promise<BookChapter[]> {
  const [novel, rawChapters, richChapters, rulesSnapshot] = await Promise.all([
    loadNovel(novelId),
    loadRawChapterList(novelId),
    loadRichChapterList(novelId),
    loadRulesSnapshot(),
  ]);

  options.signal?.throwIfAborted?.();

  const derivedBucket = getDerivedBucket(novelId);
  const contentVersion = getCurrentNovelContentVersion(novelId);
  const projectedBookCacheKey = [
    contentVersion,
    rulesSnapshot.digests.postAstContent,
    rulesSnapshot.digests.plainTextOnlyAll,
    buildRichChapterVersionDigest(richChapters),
  ].join(':');
  const cached = derivedBucket.projectedBooksByKey.get(projectedBookCacheKey);
  if (cached) {
    return cached;
  }

  const richChaptersByIndex = new Map(
    richChapters.map((chapter) => [chapter.chapterIndex, chapter] as const),
  );
  const projectedChapters = rawChapters.map((chapter) => {
    const chapterRichContent = richChaptersByIndex.get(chapter.chapterIndex) ?? null;
    const baseCacheKey = [
      contentVersion,
      chapter.chapterIndex,
      rulesSnapshot.digests.postAstContent,
      buildRichChapterMetadataDigest(chapterRichContent),
    ].join(':');

    let baseProjection = derivedBucket.chapterBaseByKey.get(baseCacheKey);
    if (!baseProjection) {
      baseProjection = buildChapterBaseProjection({
        chapter,
        chapterRichContent,
        bookTitle: novel.title,
        rules: rulesSnapshot.rules,
      });
      derivedBucket.chapterBaseByKey.set(baseCacheKey, baseProjection);
    }

    return baseProjection.projectedChapter;
  });

  const projectedBook = await finalizeProjectedBookChapters({
    bookTitle: novel.title,
    projectedChapters,
    rules: rulesSnapshot.rules,
    signal: options.signal,
    onProgress: options.onProgress,
  });

  options.signal?.throwIfAborted?.();

  derivedBucket.projectedBooksByKey.set(projectedBookCacheKey, projectedBook);
  return projectedBook;
}
