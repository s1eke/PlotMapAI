import { registerWorkerTaskHandlers } from '@infra/workers';
import type { WorkerTaskHandlerMap } from '@infra/workers';

import { purifyChapter, purifyTitles } from './purify';
import type { TextProcessingTaskMap } from './workerTypes';

const handlers = {
  'purify-titles': async (payload, emitProgress, signal) => {
    signal.throwIfAborted();
    emitProgress({ progress: 25, stage: 'preparing' });
    const result = purifyTitles(
      payload.titles,
      payload.rules,
      payload.bookTitle,
      payload.executionStage,
    );
    signal.throwIfAborted();
    emitProgress({ progress: 100, stage: 'finalizing' });
    return result;
  },
  'purify-chapter': async (payload, emitProgress, signal) => {
    signal.throwIfAborted();
    emitProgress({ progress: 20, stage: 'preparing' });
    const result = purifyChapter(
      payload.chapter,
      payload.rules,
      payload.bookTitle,
      payload.executionStage,
    );
    signal.throwIfAborted();
    emitProgress({ progress: 100, stage: 'finalizing' });
    return result;
  },
  'purify-chapters': async (payload, emitProgress, signal) => {
    signal.throwIfAborted();
    const total = Math.max(payload.chapters.length, 1);
    const result = payload.chapters.map((chapter, index) => {
      if (index === 0 || index === payload.chapters.length - 1 || index % 10 === 0) {
        emitProgress({
          progress: Math.round((index / total) * 100),
          stage: 'purifying',
        });
      }
      return purifyChapter(
        chapter,
        payload.rules,
        payload.bookTitle,
        payload.executionStage,
      );
    });
    signal.throwIfAborted();
    emitProgress({ progress: 100, stage: 'finalizing' });
    return result;
  },
} satisfies WorkerTaskHandlerMap<TextProcessingTaskMap>;

registerWorkerTaskHandlers<TextProcessingTaskMap>(handlers);
