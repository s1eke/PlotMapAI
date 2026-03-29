import type {
  WorkerTaskPayload,
  WorkerTaskProgress,
  WorkerTaskResult,
  WorkerTaskSpec,
} from '@infra/workers';

import type { ChapterDetectionRule, ParsedTextDocument, PurifiedChapter, PurifiedTitle, PurifyRule } from './types';

export interface TextProcessingProgress {
  progress: number;
  stage: string;
}

export interface ParseTxtPayload {
  file: File;
  tocRules: ChapterDetectionRule[];
}

export interface PurifyTitlesPayload {
  titles: PurifiedTitle[];
  rules: PurifyRule[];
  bookTitle: string;
}

export interface PurifyChapterPayload {
  chapter: PurifiedChapter;
  rules: PurifyRule[];
  bookTitle: string;
}

export interface PurifyChaptersPayload {
  chapters: PurifiedChapter[];
  rules: PurifyRule[];
  bookTitle: string;
}

export type TextProcessingTaskMap = {
  'parse-txt': WorkerTaskSpec<ParseTxtPayload, ParsedTextDocument, TextProcessingProgress>;
  'purify-chapter': WorkerTaskSpec<PurifyChapterPayload, PurifiedChapter, TextProcessingProgress>;
  'purify-chapters': WorkerTaskSpec<PurifyChaptersPayload, PurifiedChapter[], TextProcessingProgress>;
  'purify-titles': WorkerTaskSpec<PurifyTitlesPayload, PurifiedTitle[], TextProcessingProgress>;
};

export type TextProcessingTaskPayloadMap = {
  [Task in keyof TextProcessingTaskMap]: WorkerTaskPayload<TextProcessingTaskMap, Task>;
};

export type TextProcessingTaskResultMap = {
  [Task in keyof TextProcessingTaskMap]: WorkerTaskResult<TextProcessingTaskMap, Task>;
};

export type TextProcessingTaskProgressMap = {
  [Task in keyof TextProcessingTaskMap]: WorkerTaskProgress<TextProcessingTaskMap, Task>;
};
