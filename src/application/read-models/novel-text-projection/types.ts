import type { StoredChapterRichContent } from '@domains/book-content';
import type { NovelView } from '@domains/library';
import type { BookChapter, RichBlock } from '@shared/contracts';
import type { Chapter, ChapterContent } from '@shared/contracts/reader';
import type { PurifyRule, TextProcessingProgress } from '@shared/text-processing';

export interface NovelTextProjectionOptions {
  signal?: AbortSignal;
  onProgress?: (progress: TextProcessingProgress) => void;
}

export interface ReaderChapterProjection extends ChapterContent {}

export interface RulesSnapshotDigests {
  plainTextOnlyAll: string;
  plainTextOnlyText: string;
  postAstContent: string;
  postAstHeading: string;
}

export interface RulesSnapshotData {
  digests: RulesSnapshotDigests;
  rules: PurifyRule[];
  version: number;
}

export interface ChapterBaseProjection {
  contentVersion: number | null;
  plainText: string;
  projectedChapter: BookChapter;
  richBlocks: RichBlock[];
}

export interface NovelProjectionSourceBucket {
  novel?: Promise<NovelView>;
  rawChapterList?: Promise<BookChapter[]>;
  rawChaptersByIndex: Map<number, Promise<BookChapter | null>>;
  richChapterList?: Promise<StoredChapterRichContent[]>;
  richChaptersByIndex: Map<number, Promise<StoredChapterRichContent | null>>;
}

export interface NovelProjectionDerivedBucket {
  chapterBaseByKey: Map<string, ChapterBaseProjection>;
  chapterContentByKey: Map<string, ReaderChapterProjection>;
  projectedBooksByKey: Map<string, BookChapter[]>;
  titlesByKey: Map<string, Chapter[]>;
}
