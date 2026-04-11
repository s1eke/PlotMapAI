import type { StoredChapterRichContent } from '@domains/book-content';
import type { NovelView } from '@domains/library';
import type { BookChapter, RichBlock } from '@shared/contracts';
import type { Chapter, ChapterContent } from '@shared/contracts/reader';
import type { PurifyRule, TextProcessingProgress } from '@shared/text-processing';

import {
  bookContentRepository,
  chapterRichContentRepository,
} from '@domains/book-content';
import { novelRepository } from '@domains/library';
import { purificationRuleRepository } from '@domains/settings';
import { AppErrorCode, createAppError } from '@shared/errors';

import {
  applyPlainTextOnlyContent,
  applyReaderHeadingRules,
  buildPostAstPlainProjection,
  finalizeProjectedBookChapters,
} from './chapterTextProjection';

const MAX_CACHED_NOVELS = 2;
const MIN_SUPPORTED_TXT_IMPORT_FORMAT_VERSION = 2;

export interface NovelTextProjectionOptions {
  signal?: AbortSignal;
  onProgress?: (progress: TextProcessingProgress) => void;
}

export interface ReaderChapterProjection extends ChapterContent {}

interface RulesSnapshotDigests {
  plainTextOnlyAll: string;
  plainTextOnlyText: string;
  postAstContent: string;
  postAstHeading: string;
}

interface RulesSnapshotData {
  digests: RulesSnapshotDigests;
  rules: PurifyRule[];
  version: number;
}

interface ChapterBaseProjection {
  contentVersion: number | null;
  plainText: string;
  projectedChapter: BookChapter;
  richBlocks: RichBlock[];
}

interface NovelProjectionSourceBucket {
  novel?: Promise<NovelView>;
  rawChapterList?: Promise<BookChapter[]>;
  rawChaptersByIndex: Map<number, Promise<BookChapter | null>>;
  richChapterList?: Promise<StoredChapterRichContent[]>;
  richChaptersByIndex: Map<number, Promise<StoredChapterRichContent | null>>;
}

interface NovelProjectionDerivedBucket {
  chapterBaseByKey: Map<string, ChapterBaseProjection>;
  chapterContentByKey: Map<string, ReaderChapterProjection>;
  projectedBooksByKey: Map<string, BookChapter[]>;
  titlesByKey: Map<string, Chapter[]>;
}

const sourceCacheByNovelId = new Map<number, NovelProjectionSourceBucket>();
const derivedCacheByNovelId = new Map<number, NovelProjectionDerivedBucket>();
const novelContentVersionById = new Map<number, number>();

function trimNovelCache<T>(cache: Map<number, T>): void {
  while (cache.size > MAX_CACHED_NOVELS) {
    const oldestNovelId = cache.keys().next().value;
    if (oldestNovelId === undefined) {
      return;
    }
    cache.delete(oldestNovelId);
  }
}

function getOrCreateNovelBucket<T>(
  cache: Map<number, T>,
  novelId: number,
  createBucket: () => T,
): T {
  const existing = cache.get(novelId);
  if (existing) {
    cache.delete(novelId);
    cache.set(novelId, existing);
    return existing;
  }

  const created = createBucket();
  cache.set(novelId, created);
  trimNovelCache(cache);
  return created;
}

function getSourceBucket(novelId: number): NovelProjectionSourceBucket {
  return getOrCreateNovelBucket(sourceCacheByNovelId, novelId, () => ({
    rawChaptersByIndex: new Map(),
    richChaptersByIndex: new Map(),
  }));
}

function getDerivedBucket(novelId: number): NovelProjectionDerivedBucket {
  return getOrCreateNovelBucket(derivedCacheByNovelId, novelId, () => ({
    chapterBaseByKey: new Map(),
    chapterContentByKey: new Map(),
    projectedBooksByKey: new Map(),
    titlesByKey: new Map(),
  }));
}

function memoizePromise<K, TValue>(
  map: Map<K, Promise<TValue>>,
  key: K,
  loadValue: () => Promise<TValue>,
): Promise<TValue> {
  const cached = map.get(key);
  if (cached) {
    return cached;
  }

  const promise = loadValue().catch((error) => {
    map.delete(key);
    throw error;
  });
  map.set(key, promise);
  return promise;
}

function getCurrentNovelContentVersion(novelId: number): number {
  return novelContentVersionById.get(novelId) ?? 0;
}

function serializeRule(rule: PurifyRule): string {
  return JSON.stringify([
    rule.name ?? '',
    rule.group ?? '',
    rule.pattern ?? '',
    rule.replacement ?? '',
    rule.is_regex ?? true,
    rule.order ?? 10,
    rule.target_scope ?? 'text',
    rule.execution_stage ?? 'post-ast',
    rule.rule_version ?? 0,
    rule.book_scope ?? '',
    rule.exclude_book_scope ?? '',
    rule.exclusive_group ?? '',
  ]);
}

function buildRulesDigest(
  rules: PurifyRule[],
  predicate: (rule: PurifyRule) => boolean,
): string {
  const relevantRules = rules.filter(predicate).map((rule) => serializeRule(rule));
  return relevantRules.length > 0 ? relevantRules.join('\u0001') : 'none';
}

function buildRulesSnapshotDigests(rules: PurifyRule[]): RulesSnapshotDigests {
  const isPostAstRule = (rule: PurifyRule) => rule.execution_stage === 'post-ast';
  const isPlainTextOnlyRule = (rule: PurifyRule) => rule.execution_stage === 'plain-text-only';

  return {
    plainTextOnlyAll: buildRulesDigest(rules, isPlainTextOnlyRule),
    plainTextOnlyText: buildRulesDigest(
      rules,
      (rule) => isPlainTextOnlyRule(rule)
        && (rule.target_scope === 'all' || rule.target_scope === 'text'),
    ),
    postAstContent: buildRulesDigest(rules, isPostAstRule),
    postAstHeading: buildRulesDigest(
      rules,
      (rule) => isPostAstRule(rule)
        && (rule.target_scope === 'all' || rule.target_scope === 'heading'),
    ),
  };
}

async function loadRulesSnapshot(): Promise<RulesSnapshotData> {
  const snapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();

  return {
    digests: buildRulesSnapshotDigests(snapshot.rules),
    rules: snapshot.rules,
    version: snapshot.version,
  };
}

function buildRichChapterMetadataDigest(chapter: StoredChapterRichContent | null): string {
  if (!chapter) {
    return 'missing';
  }

  return [
    chapter.chapterIndex,
    chapter.contentFormat,
    chapter.contentVersion,
    chapter.importFormatVersion,
    chapter.updatedAt,
  ].join(':');
}

function buildRichChapterVersionDigest(chapters: StoredChapterRichContent[]): string {
  if (chapters.length === 0) {
    return 'none';
  }

  return chapters
    .map((chapter) => buildRichChapterMetadataDigest(chapter))
    .join('\u0001');
}

function createStructuredContentMissingError(params: {
  chapterIndex: number;
  contentFormat?: string;
  expectedImportFormatVersion?: number;
  importFormatVersion?: number;
  missingTable?: string;
  novelId: number;
  recoveryReason?: 'outdated-txt-import-format';
}) {
  return createAppError({
    code: AppErrorCode.CHAPTER_STRUCTURED_CONTENT_MISSING,
    kind: 'storage',
    source: 'reader',
    userMessageKey: 'reader.reparse.required',
    debugMessage: params.recoveryReason === 'outdated-txt-import-format'
      ? 'TXT structured content uses a retired import format and must be reparsed.'
      : 'Structured chapter content is missing or uses a retired format.',
    details: {
      chapterIndex: params.chapterIndex,
      novelId: params.novelId,
      ...(params.missingTable ? { missingTable: params.missingTable } : {}),
      ...(params.contentFormat ? { contentFormat: params.contentFormat } : {}),
      ...(typeof params.importFormatVersion === 'number'
        ? { importFormatVersion: params.importFormatVersion }
        : {}),
      ...(typeof params.expectedImportFormatVersion === 'number'
        ? { expectedImportFormatVersion: params.expectedImportFormatVersion }
        : {}),
      ...(params.recoveryReason ? { recoveryReason: params.recoveryReason } : {}),
    },
  });
}

function validateReaderChapterRichContent(params: {
  chapterIndex: number;
  chapterRichContent: StoredChapterRichContent | null;
  novel: NovelView;
}): StoredChapterRichContent {
  const {
    chapterIndex,
    chapterRichContent,
    novel,
  } = params;

  if (!chapterRichContent) {
    throw createStructuredContentMissingError({
      chapterIndex,
      missingTable: 'chapterRichContents',
      novelId: novel.id,
    });
  }

  if (chapterRichContent.contentFormat !== 'rich') {
    throw createStructuredContentMissingError({
      chapterIndex,
      contentFormat: chapterRichContent.contentFormat,
      novelId: novel.id,
    });
  }

  if (
    novel.fileType.toLowerCase() === 'txt'
    && chapterRichContent.importFormatVersion < MIN_SUPPORTED_TXT_IMPORT_FORMAT_VERSION
  ) {
    throw createStructuredContentMissingError({
      chapterIndex,
      contentFormat: chapterRichContent.contentFormat,
      expectedImportFormatVersion: MIN_SUPPORTED_TXT_IMPORT_FORMAT_VERSION,
      importFormatVersion: chapterRichContent.importFormatVersion,
      novelId: novel.id,
      recoveryReason: 'outdated-txt-import-format',
    });
  }

  return chapterRichContent;
}

function buildChapterBaseProjection(params: {
  bookTitle: string;
  chapter: BookChapter;
  chapterRichContent: StoredChapterRichContent | null;
  rules: PurifyRule[];
}): ChapterBaseProjection {
  const projection = buildPostAstPlainProjection(params);

  return {
    contentVersion: params.chapterRichContent?.contentVersion ?? null,
    plainText: projection.plainText,
    projectedChapter: {
      chapterIndex: params.chapter.chapterIndex,
      title: params.chapter.title,
      content: projection.plainText,
      wordCount: params.chapter.wordCount,
    },
    richBlocks: projection.richBlocks,
  };
}

async function loadNovel(novelId: number): Promise<NovelView> {
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

async function loadRawChapterList(novelId: number): Promise<BookChapter[]> {
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

async function loadRawChapter(
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

async function loadRichChapterList(novelId: number): Promise<StoredChapterRichContent[]> {
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

async function loadRichChapter(
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

function createChapterNotFoundError(novelId: number, chapterIndex: number) {
  return createAppError({
    code: AppErrorCode.CHAPTER_NOT_FOUND,
    kind: 'not-found',
    source: 'reader',
    userMessageKey: 'errors.CHAPTER_NOT_FOUND',
    debugMessage: 'Chapter not found',
    details: { chapterIndex, novelId },
  });
}

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

export function invalidateNovelTextProjectionCache(novelId: number): void {
  sourceCacheByNovelId.delete(novelId);
  derivedCacheByNovelId.delete(novelId);
  novelContentVersionById.set(novelId, getCurrentNovelContentVersion(novelId) + 1);
}

export function resetNovelTextProjectionCacheForTests(): void {
  sourceCacheByNovelId.clear();
  derivedCacheByNovelId.clear();
  novelContentVersionById.clear();
}
