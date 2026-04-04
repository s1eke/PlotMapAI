import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@infra/db';
import { AppErrorCode, createAppError } from '@shared/errors';
import * as textProcessing from '@shared/text-processing';

import {
  applicationReaderContentController,
  loadPurifiedBookChapters,
} from '../readerContentController';

describe('applicationReaderContentController', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
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
      chapterCount: 2,
      createdAt: new Date().toISOString(),
    });
    await db.chapters.bulkAdd([
      {
        novelId: 1,
        title: 'Chapter 1',
        content: 'Hello world',
        chapterIndex: 0,
        wordCount: 11,
      },
      {
        novelId: 1,
        title: 'Chapter 2',
        content: 'Plain text',
        chapterIndex: 1,
        wordCount: 10,
      },
    ]);
    await db.chapterRichContents.bulkAdd([
      {
        novelId: 1,
        chapterIndex: 0,
        contentRich: [],
        contentPlain: 'Hello world',
        contentFormat: 'plain',
        contentVersion: 1,
        importFormatVersion: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        novelId: 1,
        chapterIndex: 1,
        contentRich: [
          {
            type: 'paragraph',
            children: [{
              type: 'text',
              text: 'Plain text',
            }],
          },
        ],
        contentPlain: 'Plain text',
        contentFormat: 'rich',
        contentVersion: 4,
        importFormatVersion: 1,
        updatedAt: new Date().toISOString(),
      },
    ]);
    await db.chapterImages.add({
      novelId: 1,
      imageKey: 'map',
      blob: new Blob(['image']),
    });
    await db.novelImageGalleryEntries.add({
      novelId: 1,
      chapterIndex: 0,
      blockIndex: 2,
      imageKey: 'map',
      order: 0,
    });
  });

  it('combines book content and settings rules into reader-facing content', async () => {
    await db.purificationRules.add({
      externalId: null,
      name: 'Replace Hello',
      group: 'test',
      pattern: 'Hello',
      replacement: 'Hi',
      isRegex: false,
      isEnabled: true,
      order: 1,
      scopeTitle: true,
      scopeContent: true,
      bookScope: '',
      excludeBookScope: '',
      exclusiveGroup: '',
      isDefault: false,
      timeoutMs: 3000,
      createdAt: new Date().toISOString(),
    });

    await expect(applicationReaderContentController.getChapters(1)).resolves.toEqual([
      { index: 0, title: 'Chapter 1', wordCount: 11 },
      { index: 1, title: 'Chapter 2', wordCount: 10 },
    ]);
    await expect(applicationReaderContentController.getChapterContent(1, 0)).resolves.toEqual({
      index: 0,
      title: 'Chapter 1',
      plainText: 'Hi world',
      richBlocks: [{
        type: 'paragraph',
        children: [{
          type: 'text',
          text: 'Hi world',
        }],
      }],
      contentFormat: 'plain',
      contentVersion: 1,
      wordCount: 11,
      totalChapters: 2,
      hasPrev: false,
      hasNext: true,
    });
    await expect(applicationReaderContentController.getChapterContent(1, 1)).resolves.toEqual({
      index: 1,
      title: 'Chapter 2',
      plainText: 'Plain text',
      richBlocks: [
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Plain text',
          }],
        },
      ],
      contentFormat: 'rich',
      contentVersion: 4,
      wordCount: 10,
      totalChapters: 2,
      hasPrev: true,
      hasNext: false,
    });
    await expect(applicationReaderContentController.getImageGalleryEntries(1)).resolves.toEqual([
      { chapterIndex: 0, blockIndex: 2, imageKey: 'map', order: 0 },
    ]);
    await expect(applicationReaderContentController.getImageBlob(1, 'map')).resolves.toBeTruthy();
  });

  it('loads purified book chapters for downstream analysis and graph workflows', async () => {
    await db.purificationRules.add({
      externalId: null,
      name: 'Replace Hello',
      group: 'test',
      pattern: 'Hello',
      replacement: 'Hi',
      isRegex: false,
      isEnabled: true,
      order: 1,
      scopeTitle: true,
      scopeContent: true,
      bookScope: '',
      excludeBookScope: '',
      exclusiveGroup: '',
      isDefault: false,
      timeoutMs: 3000,
      createdAt: new Date().toISOString(),
    });

    await expect(loadPurifiedBookChapters(1)).resolves.toEqual([
      {
        chapterIndex: 0,
        title: 'Chapter 1',
        content: 'Hi world',
        wordCount: 11,
      },
      {
        chapterIndex: 1,
        title: 'Chapter 2',
        content: 'Plain text',
        wordCount: 10,
      },
    ]);
  });

  it('fails when structured chapter content is missing for a reader request', async () => {
    await db.chapterRichContents.where('[novelId+chapterIndex]').equals([1, 0]).delete();

    await expect(applicationReaderContentController.getChapterContent(1, 0)).rejects.toMatchObject({
      code: AppErrorCode.CHAPTER_MISSING,
      details: {
        chapterIndex: 0,
        novelId: 1,
        missingTable: 'chapterRichContents',
      },
    });
  });

  it('propagates worker availability failures from title purification', async () => {
    await db.purificationRules.add({
      externalId: null,
      name: 'Replace Hello',
      group: 'test',
      pattern: 'Hello',
      replacement: 'Hi',
      isRegex: false,
      isEnabled: true,
      order: 1,
      scopeTitle: true,
      scopeContent: true,
      bookScope: '',
      excludeBookScope: '',
      exclusiveGroup: '',
      isDefault: false,
      timeoutMs: 3000,
      createdAt: new Date().toISOString(),
    });
    vi.spyOn(textProcessing, 'runPurifyTitlesTask').mockRejectedValueOnce(createAppError({
      code: AppErrorCode.WORKER_UNAVAILABLE,
      kind: 'unsupported',
      source: 'worker',
      userMessageKey: 'errors.WORKER_UNAVAILABLE',
      debugMessage: 'Reader worker unavailable.',
    }));

    await expect(applicationReaderContentController.getChapters(1)).rejects.toMatchObject({
      code: AppErrorCode.WORKER_UNAVAILABLE,
      userMessageKey: 'errors.WORKER_UNAVAILABLE',
    });
  });
});
