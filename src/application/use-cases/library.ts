import type { CharacterGraphResponse } from '@shared/contracts';
import type { NovelView } from '@domains/library';
import type { AppError } from '@shared/errors';

import { analysisService } from '@domains/analysis';
import { novelRepository } from '@domains/library';
import { ensureDefaultTocRules, tocRuleRepository } from '@domains/settings';
import { AppErrorCode, toAppError } from '@shared/errors';

import { bookLifecycleService } from '@application/services/bookLifecycleService';
import { loadPurifiedBookChapters } from '@application/services/readerContentController';

export interface BookDetailAnalysisData {
  analysisStatus: Awaited<ReturnType<typeof analysisService.getStatus>> | null;
  analysisStatusError: AppError | null;
}

export interface BookDetailPageData extends BookDetailAnalysisData {
  novel: NovelView;
}

export interface CharacterGraphPageData {
  graph: CharacterGraphResponse;
  novel: NovelView;
}

export async function deleteNovelAndCleanupArtifacts(
  novelId: number,
): Promise<{ message: string }> {
  return bookLifecycleService.deleteNovel(novelId);
}

export async function importBookAndRefreshLibrary(
  file: File,
  options: import('@domains/book-import').ImportBookOptions = {},
): Promise<NovelView> {
  await ensureDefaultTocRules();
  const tocRules = await tocRuleRepository.getEnabledChapterDetectionRules();
  return bookLifecycleService.importBook(file, tocRules, options);
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
  const [novel, analysisData] = await Promise.all([
    novelRepository.get(novelId),
    loadBookDetailAnalysisStatus(novelId),
  ]);

  return {
    novel,
    ...analysisData,
  };
}

export async function loadCharacterGraphPageData(
  novelId: number,
): Promise<CharacterGraphPageData> {
  const [novel, chapters] = await Promise.all([
    novelRepository.get(novelId),
    loadPurifiedBookChapters(novelId),
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
