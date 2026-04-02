import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@infra/db';
import { AppErrorCode, createAppError } from '@shared/errors';

const runPurifyChapterTask = vi.hoisted(() => vi.fn());
const runPurifyChaptersTask = vi.hoisted(() => vi.fn());
const runPurifyTitlesTask = vi.hoisted(() => vi.fn());

vi.mock('@shared/text-processing', () => ({
  runPurifyChapterTask,
  runPurifyChaptersTask,
  runPurifyTitlesTask,
}));

describe('readerApi worker unavailable handling', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.delete();
    await db.open();
    await db.novels.add({
      title: 'Reader Novel',
      author: 'Author',
      description: '',
      tags: [],
      fileType: 'txt',
      fileHash: 'reader-hash',
      coverPath: '',
      originalFilename: 'reader.txt',
      originalEncoding: 'utf-8',
      totalWords: 120,
      createdAt: new Date().toISOString(),
    });
    const novel = await db.novels.orderBy('id').last();
    await db.chapters.add({
      novelId: novel!.id,
      title: 'Chapter 1',
      content: 'Chapter content',
      chapterIndex: 0,
      wordCount: 15,
    });
    await db.purificationRules.add({
      externalId: null,
      name: 'Enabled Rule',
      group: 'test',
      pattern: 'Chapter',
      replacement: 'Section',
      isRegex: false,
      isEnabled: true,
      order: 1,
      scopeTitle: true,
      scopeContent: true,
      bookScope: '',
      excludeBookScope: '',
      timeoutMs: 3000,
      isDefault: false,
      createdAt: new Date().toISOString(),
    });
  });

  it('propagates WORKER_UNAVAILABLE when title purification cannot start', async () => {
    const unavailableError = createAppError({
      code: AppErrorCode.WORKER_UNAVAILABLE,
      kind: 'unsupported',
      source: 'worker',
      userMessageKey: 'errors.WORKER_UNAVAILABLE',
      debugMessage: 'Title purification worker is unavailable.',
    });
    runPurifyTitlesTask.mockRejectedValueOnce(unavailableError);
    vi.resetModules();
    const { readerApi } = await import('../readerApi');
    const novel = await db.novels.orderBy('id').last();

    await expect(readerApi.getChapters(novel!.id)).rejects.toMatchObject({
      code: AppErrorCode.WORKER_UNAVAILABLE,
      userMessageKey: 'errors.WORKER_UNAVAILABLE',
    });
  });
});
