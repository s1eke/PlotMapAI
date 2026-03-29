import { createWorkerTaskRunner } from '@infra/workers';
import type {
  WorkerTaskOptions,
  WorkerTaskPayload,
  WorkerTaskProgress,
  WorkerTaskResult,
} from '@infra/workers';
import { parseTxtDocument } from './txt';
import { purifyChapter, purifyChapters, purifyTitles } from './purify';
import type {
  ParseTxtPayload,
  PurifyChapterPayload,
  PurifyChaptersPayload,
  PurifyTitlesPayload,
  TextProcessingTaskMap,
  TextProcessingProgress,
} from './workerTypes';
import type { ParsedTextDocument, PurifiedChapter, PurifiedTitle } from './types';

type TextProcessingTaskName = keyof TextProcessingTaskMap & string;

function createTextProcessingTaskRunner<TTask extends TextProcessingTaskName>(
  task: TTask,
  fallback: (
    payload: WorkerTaskPayload<TextProcessingTaskMap, TTask>,
    options: WorkerTaskOptions<WorkerTaskProgress<TextProcessingTaskMap, TTask>>,
  ) => Promise<WorkerTaskResult<TextProcessingTaskMap, TTask>> | WorkerTaskResult<TextProcessingTaskMap, TTask>,
) {
  return createWorkerTaskRunner<TextProcessingTaskMap, TTask>({
    createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
    task,
    fallback,
  });
}

const runParseTxtWorkerTask = createTextProcessingTaskRunner(
  'parse-txt',
  ({ file, tocRules }, options) => parseTxtDocument(file, tocRules, options),
);

const runPurifyTitlesWorkerTask = createTextProcessingTaskRunner(
  'purify-titles',
  ({ titles, rules, bookTitle }) => purifyTitles(titles, rules, bookTitle),
);

const runPurifyChapterWorkerTask = createTextProcessingTaskRunner(
  'purify-chapter',
  ({ chapter, rules, bookTitle }) => purifyChapter(chapter, rules, bookTitle),
);

const runPurifyChaptersWorkerTask = createTextProcessingTaskRunner(
  'purify-chapters',
  ({ chapters, rules, bookTitle }) => purifyChapters(chapters, rules, bookTitle),
);

export function runParseTxtTask(
  payload: ParseTxtPayload,
  options: WorkerTaskOptions<TextProcessingProgress> = {},
): Promise<ParsedTextDocument> {
  return runParseTxtWorkerTask(payload, options);
}

export function runPurifyTitlesTask(
  payload: PurifyTitlesPayload,
  options: WorkerTaskOptions<TextProcessingProgress> = {},
): Promise<PurifiedTitle[]> {
  return runPurifyTitlesWorkerTask(payload, options);
}

export function runPurifyChapterTask(
  payload: PurifyChapterPayload,
  options: WorkerTaskOptions<TextProcessingProgress> = {},
): Promise<PurifiedChapter> {
  return runPurifyChapterWorkerTask(payload, options);
}

export function runPurifyChaptersTask(
  payload: PurifyChaptersPayload,
  options: WorkerTaskOptions<TextProcessingProgress> = {},
): Promise<PurifiedChapter[]> {
  return runPurifyChaptersWorkerTask(payload, options);
}
