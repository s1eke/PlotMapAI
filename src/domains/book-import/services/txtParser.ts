import type { ParsedBook } from './bookParser';
import type { WorkerTaskOptions } from '@infra/workers';
import type { ChapterDetectionRule, ParsedTextDocument } from '@shared/text-processing';
import type { BookImportProgress } from './progress';

import { debugLog } from '@shared/debug';
import {
  projectTxtPlainTextToRichBlocks,
  runParseTxtTask,
} from '@shared/text-processing';

function mapParsedDocument(document: ParsedTextDocument): ParsedBook {
  return {
    title: document.title,
    author: '',
    description: '',
    coverBlob: null,
    chapters: document.chapters.map((chapter) => ({
      title: chapter.title,
      content: chapter.content,
      contentFormat: 'rich',
      richBlocks: projectTxtPlainTextToRichBlocks(chapter.content),
    })),
    rawText: document.rawText,
    encoding: document.encoding,
    totalWords: document.totalWords,
    fileHash: document.fileHash,
    tags: [],
    images: [],
  };
}

export async function parseTxt(
  file: File,
  tocRules: ChapterDetectionRule[],
  options: WorkerTaskOptions<BookImportProgress> = {},
): Promise<ParsedBook> {
  const parsed = await runParseTxtTask(
    { file, tocRules },
    {
      signal: options.signal,
      onProgress: (progress) => {
        options.onProgress?.({
          current: progress.current,
          detail: progress.detail,
          progress: progress.progress,
          stage: progress.stage as BookImportProgress['stage'],
          total: progress.total,
        });
      },
    },
  );

  debugLog('TXT', `encoding=${parsed.encoding}, text length=${parsed.rawText.length}`);
  debugLog('TXT', `split into ${parsed.chapters.length} chapters`);
  const logCount = Math.min(parsed.chapters.length, 5);
  for (let i = 0; i < logCount; i++) {
    debugLog('TXT', `  ch[${i}]: "${parsed.chapters[i].title}" (${parsed.chapters[i].content.length} chars)`);
  }
  if (parsed.chapters.length > 10) debugLog('TXT', `  ... ${parsed.chapters.length - 10} more chapters ...`);
  for (let i = Math.max(logCount, parsed.chapters.length - 5); i < parsed.chapters.length; i++) {
    if (i < logCount) continue;
    debugLog('TXT', `  ch[${i}]: "${parsed.chapters[i].title}" (${parsed.chapters[i].content.length} chars)`);
  }
  return mapParsedDocument(parsed);
}
