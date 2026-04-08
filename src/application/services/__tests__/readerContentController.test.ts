import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@infra/db';
import { AppErrorCode } from '@shared/errors';

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
        contentRich: [
          {
            type: 'paragraph',
            children: [{
              type: 'text',
              text: 'Legacy stored rich block',
            }],
          },
        ],
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

  it('projects plain chapter text into paragraph rich blocks', async () => {
    await expect(applicationReaderContentController.getChapterContent(1, 0)).resolves.toEqual({
      index: 0,
      title: 'Chapter 1',
      plainText: 'Hello world',
      richBlocks: [{
        type: 'paragraph',
        children: [{
          type: 'text',
          text: 'Hello world',
        }],
      }],
      contentFormat: 'plain',
      contentVersion: 1,
      wordCount: 11,
      totalChapters: 2,
      hasPrev: false,
      hasNext: true,
    });
  });

  it('returns stored rich blocks for rich chapters', async () => {
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
      targetScope: 'all',
      executionStage: 'post-ast',
      ruleVersion: 2,
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
      targetScope: 'all',
      executionStage: 'post-ast',
      ruleVersion: 2,
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
      code: AppErrorCode.CHAPTER_STRUCTURED_CONTENT_MISSING,
      details: {
        chapterIndex: 0,
        novelId: 1,
        missingTable: 'chapterRichContents',
      },
    });
  });

  it('applies heading-scoped post-ast rules to chapter list titles', async () => {
    await db.purificationRules.add({
      externalId: null,
      name: 'Rename chapters',
      group: 'test',
      pattern: 'Chapter',
      replacement: 'Section',
      isRegex: false,
      isEnabled: true,
      order: 1,
      targetScope: 'heading',
      executionStage: 'post-ast',
      ruleVersion: 2,
      bookScope: '',
      excludeBookScope: '',
      exclusiveGroup: '',
      isDefault: false,
      timeoutMs: 3000,
      createdAt: new Date().toISOString(),
    });

    await expect(applicationReaderContentController.getChapters(1)).resolves.toEqual([
      { index: 0, title: 'Section 1', wordCount: 11 },
      { index: 1, title: 'Section 2', wordCount: 10 },
    ]);
  });
});
