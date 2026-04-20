import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bookContentRepository,
  chapterRichContentRepository,
} from '@domains/book-content';
import { novelRepository } from '@domains/library';
import { purificationRuleRepository } from '@domains/settings';
import { db } from '@infra/db';

import {
  invalidateNovelTextProjectionCache,
  projectNovelChapter,
  projectNovelText,
  projectNovelTitles,
  resetNovelTextProjectionCacheForTests,
} from '..';

describe('novel-text-projection read model', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetNovelTextProjectionCacheForTests();
    localStorage.clear();
    await db.delete();
    await db.open();
    await purificationRuleRepository.clearAllPurificationRules();

    await db.novels.add({
      title: 'Projection Novel',
      author: 'Author',
      description: '',
      tags: [],
      fileType: 'txt',
      fileHash: 'projection-hash',
      coverPath: '',
      originalFilename: 'projection.txt',
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
              text: 'Hello world',
            }],
          },
        ],
        contentPlain: 'Hello world',
        contentFormat: 'rich',
        contentVersion: 1,
        importFormatVersion: 2,
        updatedAt: '2026-04-01T00:00:00.000Z',
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
        contentVersion: 2,
        importFormatVersion: 2,
        updatedAt: '2026-04-02T00:00:00.000Z',
      },
    ]);
  });

  it('reuses the shared whole-book projection result for repeated calls with the same rule snapshot', async () => {
    const listNovelChaptersSpy = vi.spyOn(bookContentRepository, 'listNovelChapters');
    const listNovelChapterRichContentsSpy = vi.spyOn(
      chapterRichContentRepository,
      'listNovelChapterRichContents',
    );
    const novelGetSpy = vi.spyOn(novelRepository, 'get');

    const first = await projectNovelText(1);
    const second = await projectNovelText(1);

    expect(second).toBe(first);
    expect(listNovelChaptersSpy).toHaveBeenCalledTimes(1);
    expect(listNovelChapterRichContentsSpy).toHaveBeenCalledTimes(1);
    expect(novelGetSpy).toHaveBeenCalledTimes(1);
  });

  it('projects titles without loading rich chapter rows', async () => {
    const listNovelChapterRichContentsSpy = vi.spyOn(
      chapterRichContentRepository,
      'listNovelChapterRichContents',
    );
    const getNovelChapterRichContentSpy = vi.spyOn(
      chapterRichContentRepository,
      'getNovelChapterRichContent',
    );

    await expect(projectNovelTitles(1)).resolves.toEqual([
      { index: 0, title: 'Chapter 1', wordCount: 11 },
      { index: 1, title: 'Chapter 2', wordCount: 10 },
    ]);
    expect(listNovelChapterRichContentsSpy).not.toHaveBeenCalled();
    expect(getNovelChapterRichContentSpy).not.toHaveBeenCalled();
  });

  it('projects a single reader chapter without loading whole-book lists or counting chapters', async () => {
    const listNovelChaptersSpy = vi.spyOn(bookContentRepository, 'listNovelChapters');
    const listNovelChapterRichContentsSpy = vi.spyOn(
      chapterRichContentRepository,
      'listNovelChapterRichContents',
    );
    const countNovelChaptersSpy = vi.spyOn(bookContentRepository, 'countNovelChapters');
    const getNovelChapterSpy = vi.spyOn(bookContentRepository, 'getNovelChapter');
    const getNovelChapterRichContentSpy = vi.spyOn(
      chapterRichContentRepository,
      'getNovelChapterRichContent',
    );

    await expect(projectNovelChapter(1, 0)).resolves.toMatchObject({
      index: 0,
      title: 'Chapter 1',
      plainText: 'Hello world',
      totalChapters: 2,
      hasPrev: false,
      hasNext: true,
      contentVersion: 1,
    });
    expect(listNovelChaptersSpy).not.toHaveBeenCalled();
    expect(listNovelChapterRichContentsSpy).not.toHaveBeenCalled();
    expect(countNovelChaptersSpy).not.toHaveBeenCalled();
    expect(getNovelChapterSpy).toHaveBeenCalledTimes(1);
    expect(getNovelChapterRichContentSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps title and base rich projection caches hot when only plain-text-only rules change', async () => {
    const firstTitles = await projectNovelTitles(1);
    const firstChapter = await projectNovelChapter(1, 0);

    await purificationRuleRepository.createPurificationRule({
      name: 'Replace Hello',
      pattern: 'Hello',
      replacement: 'Hi',
      isRegex: false,
      executionStage: 'plain-text-only',
      targetScope: 'text',
    });

    const secondTitles = await projectNovelTitles(1);
    const secondChapter = await projectNovelChapter(1, 0);

    expect(secondTitles).toBe(firstTitles);
    expect(secondTitles[0]?.title).toBe('Chapter 1');
    expect(secondChapter.plainText).toBe('Hi world');
    expect(secondChapter.richBlocks).toBe(firstChapter.richBlocks);
  });

  it('reloads source rows after explicit cache invalidation', async () => {
    const listNovelChaptersSpy = vi.spyOn(bookContentRepository, 'listNovelChapters');
    const listNovelChapterRichContentsSpy = vi.spyOn(
      chapterRichContentRepository,
      'listNovelChapterRichContents',
    );

    await projectNovelText(1);
    invalidateNovelTextProjectionCache(1);
    await projectNovelText(1);

    expect(listNovelChaptersSpy).toHaveBeenCalledTimes(2);
    expect(listNovelChapterRichContentsSpy).toHaveBeenCalledTimes(2);
  });
});
