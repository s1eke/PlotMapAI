import type { CharacterGraphResponse } from '@shared/contracts';
import type { NovelView } from '@domains/library';
import type { AppError } from '@shared/errors';

import { analysisService } from '@domains/analysis';
import { bookImportService } from '@domains/book-import';
import { novelRepository } from '@domains/library';
import { deleteReaderArtifacts, loadAndPurifyChapters } from '@domains/reader';
import { ensureDefaultTocRules, tocRuleRepository } from '@domains/settings';
import { CACHE_KEYS, storage } from '@infra/storage';
import { AppErrorCode, toAppError } from '@shared/errors';

export interface BookDetailAnalysisData {
  analysisStatus: Awaited<ReturnType<typeof analysisService.getStatus>> | null;
  analysisStatusError: AppError | null;
}

export interface BookDetailPageData extends BookDetailAnalysisData {
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
  await Promise.all([
    analysisService.deleteArtifacts(novelId),
    deleteReaderArtifacts(novelId),
  ]);
  await novelRepository.delete(novelId);
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

export async function loadBookDetailAnalysisStatus(
  novelId: number,
): Promise<BookDetailAnalysisData> {
  try {
    return {
      analysisStatus: await analysisService.getStatus(novelId),
      analysisStatusError: null,
    };
  } catch (error) {
    return {
      analysisStatus: null,
      analysisStatusError: toAppError(error, {
        code: AppErrorCode.ANALYSIS_EXECUTION_FAILED,
        kind: 'execution',
        source: 'analysis',
        userMessageKey: 'bookDetail.analysisLoadError',
        retryable: true,
      }),
    };
  }
}

export async function loadBookDetailPageData(novelId: number): Promise<BookDetailPageData> {
  const novel = await novelRepository.get(novelId);
  const [analysisData, coverUrl] = await Promise.all([
    loadBookDetailAnalysisStatus(novelId),
    novel.hasCover ? novelRepository.getCoverUrl(novelId) : Promise.resolve(null),
  ]);

  return {
    coverUrl,
    novel,
    ...analysisData,
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
