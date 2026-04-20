import { createWorkerTaskRunner } from '@infra/workers';
import type { WorkerTaskOptions } from '@infra/workers';
import { AppErrorCode } from '@shared/errors';
import type {
  PurifyChapterPayload,
  PurifyChaptersPayload,
  PurifyTitlesPayload,
  TextProcessingTaskMap,
  TextProcessingProgress,
} from './workerTypes';
import type { PurifiedChapter, PurifiedTitle } from './types';

type TextProcessingTaskName = keyof TextProcessingTaskMap & string;

function createTextProcessingTaskRunner<TTask extends TextProcessingTaskName>(
  task: TTask,
  debugMessage: string,
) {
  return createWorkerTaskRunner<TextProcessingTaskMap, TTask>({
    createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
    task,
    unavailableError: {
      code: AppErrorCode.WORKER_UNAVAILABLE,
      kind: 'unsupported',
      source: 'worker',
      userMessageKey: 'errors.WORKER_UNAVAILABLE',
      debugMessage,
    },
  });
}

const runPurifyTitlesWorkerTask = createTextProcessingTaskRunner(
  'purify-titles',
  'Title purification worker is unavailable.',
);

const runPurifyChapterWorkerTask = createTextProcessingTaskRunner(
  'purify-chapter',
  'Chapter purification worker is unavailable.',
);

const runPurifyChaptersWorkerTask = createTextProcessingTaskRunner(
  'purify-chapters',
  'Batch chapter purification worker is unavailable.',
);

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
