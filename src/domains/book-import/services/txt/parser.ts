import { detectChapters, splitByChapters } from './chapterDetection';
import { detectAndConvert } from './encoding';
import { computeHash } from '@shared/text-processing';
import type { ChapterDetectionRule } from '@shared/text-processing';
import type { BookImportProgress } from '../progress';
import type { ParsedTextDocument } from './types';

function emitProgress(
  onProgress: ((progress: BookImportProgress) => void) | undefined,
  progress: BookImportProgress,
): void {
  onProgress?.(progress);
}

export async function parseTxtDocument(
  file: File,
  tocRules: ChapterDetectionRule[],
  options: {
    onProgress?: (progress: BookImportProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ParsedTextDocument> {
  const { onProgress, signal } = options;
  signal?.throwIfAborted?.();

  emitProgress(onProgress, {
    progress: 8,
    stage: 'hashing',
    detail: file.name,
  });
  const rawBytes = await file.arrayBuffer();
  const fileHashPromise = computeHash(rawBytes);

  signal?.throwIfAborted?.();
  emitProgress(onProgress, { progress: 30, stage: 'decoding' });
  const { text: rawText, encoding } = detectAndConvert(rawBytes);
  emitProgress(onProgress, {
    progress: 42,
    stage: 'decoding',
    detail: encoding,
  });

  signal?.throwIfAborted?.();
  const chaptersInfo = detectChapters(rawText, tocRules);
  const chapters = splitByChapters(rawText, chaptersInfo);
  const totalWords = chapters.reduce((sum, chapter) => sum + chapter.content.length, 0);
  emitProgress(onProgress, {
    progress: 60,
    stage: 'chapters',
    current: chapters.length,
    total: chapters.length,
    detail: `${chapters.length} chapters`,
  });

  signal?.throwIfAborted?.();
  emitProgress(onProgress, { progress: 90, stage: 'finalizing' });
  let title = file.name;
  if (title.toLowerCase().endsWith('.txt')) {
    title = title.slice(0, -4);
  }

  const fileHash = await fileHashPromise;

  emitProgress(onProgress, {
    progress: 100,
    stage: 'finalizing',
    detail: title,
  });
  return {
    title,
    chapters,
    encoding,
    fileHash,
    rawText,
    totalWords,
  };
}
