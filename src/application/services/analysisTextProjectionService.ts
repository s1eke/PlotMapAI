import type { BookChapter } from '@shared/contracts';
import type { TextProcessingProgress } from '@shared/text-processing';

import {
  bookContentRepository,
  chapterRichContentRepository,
} from '@domains/book-content';
import { novelRepository } from '@domains/library';
import { purificationRuleRepository } from '@domains/settings';

import { buildProjectedBookChapters } from './chapterTextProjection';

export interface AnalysisTextProjectionOptions {
  onProgress?: (progress: TextProcessingProgress) => void;
  signal?: AbortSignal;
}

export async function loadAnalysisBookChapters(
  novelId: number,
  options: AnalysisTextProjectionOptions = {},
): Promise<BookChapter[]> {
  const [bookTitle, rawChapters, richChapters, rules] = await Promise.all([
    novelRepository.getNovelTitle(novelId),
    bookContentRepository.listNovelChapters(novelId),
    chapterRichContentRepository.listNovelChapterRichContents(novelId),
    purificationRuleRepository.getEnabledPurificationRules(),
  ]);

  options.signal?.throwIfAborted?.();

  return buildProjectedBookChapters({
    bookTitle,
    rawChapters,
    richChapters,
    rules,
    signal: options.signal,
    onProgress: options.onProgress,
  });
}
