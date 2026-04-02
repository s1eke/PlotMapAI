import type { NovelView } from '@domains/library';
import type { CharacterGraphResponse } from '@shared/contracts';

import { analysisService } from '@domains/analysis';
import { bookImportService } from '@domains/book-import';
import { novelRepository } from '@domains/library';
import { clearReaderRenderCacheMemoryForNovel, loadAndPurifyChapters } from '@domains/reader';
import { ensureDefaultTocRules } from '@domains/settings';
import { tocRuleRepository } from '@domains/settings/tocRuleRepository';
import { db } from '@infra/db';
import { CACHE_KEYS, storage } from '@infra/storage';

export interface BookDetailPageData {
  analysisStatus: Awaited<ReturnType<typeof analysisService.getStatus>>;
  coverUrl: string | null;
  novel: NovelView;
}

export interface CharacterGraphPageData {
  graph: CharacterGraphResponse;
  novel: NovelView;
}

export async function deleteNovelAndCleanupArtifacts(
  novelId: number,
): Promise<{ message: string }> {
  await db.transaction(
    'rw',
    [
      db.analysisJobs,
      db.analysisChunks,
      db.analysisOverviews,
      db.chapterAnalyses,
      db.readerRenderCache,
      db.readingProgress,
    ],
    async () => {
      await db.readingProgress.where('novelId').equals(novelId).delete();
      await db.analysisJobs.where('novelId').equals(novelId).delete();
      await db.analysisChunks.where('novelId').equals(novelId).delete();
      await db.chapterAnalyses.where('novelId').equals(novelId).delete();
      await db.analysisOverviews.where('novelId').equals(novelId).delete();
      await db.readerRenderCache.where('novelId').equals(novelId).delete();
    },
  );
  await novelRepository.delete(novelId);
  clearReaderRenderCacheMemoryForNovel(novelId);
  storage.cache.remove(CACHE_KEYS.readerState(novelId));
  return { message: 'Novel deleted' };
}

export async function importBookAndRefreshLibrary(
  file: File,
  options: import('@domains/book-import').ImportBookOptions = {},
): Promise<NovelView> {
  await ensureDefaultTocRules();
  const tocRules = await tocRuleRepository.getEnabledChapterDetectionRules();
  const { novelId } = await bookImportService.importBook(file, tocRules, options);
  storage.cache.remove(CACHE_KEYS.readerState(novelId));
  return novelRepository.get(novelId);
}

export async function loadBookDetailPageData(novelId: number): Promise<BookDetailPageData> {
  const [novel, analysisStatus] = await Promise.all([
    novelRepository.get(novelId),
    analysisService.getStatus(novelId),
  ]);
  const coverUrl = novel.hasCover ? await novelRepository.getCoverUrl(novelId) : null;
  return {
    analysisStatus,
    coverUrl,
    novel,
  };
}

export async function loadCharacterGraphPageData(
  novelId: number,
): Promise<CharacterGraphPageData> {
  const [novel, chapters] = await Promise.all([
    novelRepository.get(novelId),
    loadAndPurifyChapters(novelId),
  ]);

  return {
    graph: await analysisService.getCharacterGraph(novelId, chapters),
    novel,
  };
}

export async function loadReaderSession(novelId: number): Promise<{ novel: NovelView }> {
  return {
    novel: await novelRepository.get(novelId),
  };
}
