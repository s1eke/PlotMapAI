import type {
  WorkerTaskPayload,
  WorkerTaskProgress,
  WorkerTaskResult,
  WorkerTaskSpec,
} from '@infra/workers';

import type {
  PurifiedChapter,
  PurifiedTitle,
  PurifyRule,
  PurificationExecutionStage,
} from './types';

export interface TextProcessingProgress {
  current?: number;
  detail?: string;
  progress: number;
  stage: string;
  total?: number;
}

export interface PurifyTitlesPayload {
  titles: PurifiedTitle[];
  rules: PurifyRule[];
  bookTitle: string;
  executionStage?: PurificationExecutionStage;
}

export interface PurifyChapterPayload {
  chapter: PurifiedChapter;
  rules: PurifyRule[];
  bookTitle: string;
  executionStage?: PurificationExecutionStage;
}

export interface PurifyChaptersPayload {
  chapters: PurifiedChapter[];
  rules: PurifyRule[];
  bookTitle: string;
  executionStage?: PurificationExecutionStage;
}

export interface TextProcessingTaskMap {
  'purify-chapter': WorkerTaskSpec<PurifyChapterPayload, PurifiedChapter, TextProcessingProgress>;
  'purify-chapters': WorkerTaskSpec<PurifyChaptersPayload, PurifiedChapter[], TextProcessingProgress>;
  'purify-titles': WorkerTaskSpec<PurifyTitlesPayload, PurifiedTitle[], TextProcessingProgress>;
}

export type TextProcessingTaskPayloadMap = {
  [Task in keyof TextProcessingTaskMap]: WorkerTaskPayload<TextProcessingTaskMap, Task>;
};

export type TextProcessingTaskResultMap = {
  [Task in keyof TextProcessingTaskMap]: WorkerTaskResult<TextProcessingTaskMap, Task>;
};

export type TextProcessingTaskProgressMap = {
  [Task in keyof TextProcessingTaskMap]: WorkerTaskProgress<TextProcessingTaskMap, Task>;
};
