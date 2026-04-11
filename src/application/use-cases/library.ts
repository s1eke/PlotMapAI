import type { CharacterGraphResponse } from '@shared/contracts';
import type { NovelView } from '@domains/library';
import type { AppError } from '@shared/errors';

import { analysisService } from '@domains/analysis';
import { chapterRichContentRepository } from '@domains/book-content';
import { novelRepository } from '@domains/library';
import {
  ensureDefaultPurificationRules,
  ensureDefaultTocRules,
  purificationRuleRepository,
  tocRuleRepository,
} from '@domains/settings';
import { AppErrorCode, toAppError } from '@shared/errors';

import { loadAnalysisBookChapters } from '@application/services/analysisTextProjectionService';
import { bookLifecycleService } from '@application/services/bookLifecycleService';

export interface BookDetailAnalysisData {
  analysisStatus: Awaited<ReturnType<typeof analysisService.getStatus>> | null;
  analysisStatusError: AppError | null;
}

export interface BookDetailPageData extends BookDetailAnalysisData {
  contentSummary: BookDetailContentSummary;
  novel: NovelView;
}

export interface CharacterGraphPageData {
  graph: CharacterGraphResponse;
  novel: NovelView;
}

export interface BookDetailContentSummary {
  contentFormat: 'rich';
  contentVersion: number | null;
  importFormatVersion: number | null;
  lastParsedAt: string | null;
}

type NovelRichContentList = Awaited<
  ReturnType<typeof chapterRichContentRepository.listNovelChapterRichContents>
>;

function buildBookDetailContentSummary(
  richContents: NovelRichContentList,
): BookDetailContentSummary {
  if (richContents.length === 0) {
    return {
      contentFormat: 'rich',
      contentVersion: null,
      importFormatVersion: null,
      lastParsedAt: null,
    };
  }
  const contentVersion = richContents.reduce<number | null>((latest, chapter) => {
    if (latest == null) {
      return chapter.contentVersion;
    }

    return Math.max(latest, chapter.contentVersion);
  }, null);
  const importFormatVersion = richContents.reduce<number | null>((latest, chapter) => {
    if (latest == null) {
      return chapter.importFormatVersion;
    }

    return Math.max(latest, chapter.importFormatVersion);
  }, null);
  const lastParsedAt = richContents.reduce<string | null>((latest, chapter) => {
    if (latest == null || latest < chapter.updatedAt) {
      return chapter.updatedAt;
    }

    return latest;
  }, null);

  return {
    contentFormat: 'rich',
    contentVersion,
    importFormatVersion,
    lastParsedAt,
  };
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
  await Promise.all([
    ensureDefaultTocRules(),
    ensureDefaultPurificationRules(),
  ]);
  const [tocRules, purificationRules] = await Promise.all([
    tocRuleRepository.getEnabledChapterDetectionRules(),
    purificationRuleRepository.getEnabledPurificationRules(),
  ]);
  return bookLifecycleService.importBook(file, tocRules, {
    ...options,
    purificationRules,
  });
}

export async function reparseBookAndRefreshDetail(
  novelId: number,
  file: File,
  options: import('@domains/book-import').ImportBookOptions = {},
): Promise<NovelView> {
  await Promise.all([
    ensureDefaultTocRules(),
    ensureDefaultPurificationRules(),
  ]);
  const [tocRules, purificationRules] = await Promise.all([
    tocRuleRepository.getEnabledChapterDetectionRules(),
    purificationRuleRepository.getEnabledPurificationRules(),
  ]);

  return bookLifecycleService.reparseBook(novelId, file, tocRules, {
    ...options,
    purificationRules,
  });
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
  const [novel, analysisData, richContents] = await Promise.all([
    novelRepository.get(novelId),
    loadBookDetailAnalysisStatus(novelId),
    chapterRichContentRepository.listNovelChapterRichContents(novelId),
  ]);

  return {
    contentSummary: buildBookDetailContentSummary(richContents),
    novel,
    ...analysisData,
  };
}

export async function loadCharacterGraphPageData(
  novelId: number,
): Promise<CharacterGraphPageData> {
  const [novel, chapters] = await Promise.all([
    novelRepository.get(novelId),
    loadAnalysisBookChapters(novelId),
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
