import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';

import { chapterRichContentRepository } from '../chapterRichContentRepository';

describe('chapterRichContentRepository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('replaces and reads persisted rich chapter content by novel and chapter index', async () => {
    await chapterRichContentRepository.replaceNovelChapterRichContents(7, {
      chapters: [
        {
          chapterIndex: 1,
          richBlocks: [
            {
              type: 'image',
              key: 'map',
              caption: [{
                type: 'text',
                text: 'World map',
              }],
            },
          ],
          plainText: 'World map',
          contentFormat: 'rich',
          contentVersion: 2,
          importFormatVersion: 3,
        },
        {
          chapterIndex: 0,
          richBlocks: [
            {
              type: 'paragraph',
              children: [{
                type: 'text',
                text: 'Alpha',
                marks: ['bold'],
              }],
            },
          ],
          plainText: 'Alpha',
          contentFormat: 'rich',
          contentVersion: 1,
          importFormatVersion: 3,
        },
      ],
    });

    const chapters = await chapterRichContentRepository.listNovelChapterRichContents(7);

    expect(chapters).toHaveLength(2);
    expect(chapters.map((chapter) => chapter.chapterIndex)).toEqual([0, 1]);
    expect(chapters[0]).toMatchObject({
      chapterIndex: 0,
      plainText: 'Alpha',
      contentFormat: 'rich',
      contentVersion: 1,
      importFormatVersion: 3,
      richBlocks: [{
        type: 'paragraph',
        children: [{
          type: 'text',
          text: 'Alpha',
          marks: ['bold'],
        }],
      }],
    });
    expect(chapters[0]?.updatedAt).toBeTruthy();
    expect(chapters[1]).toMatchObject({
      chapterIndex: 1,
      plainText: 'World map',
      contentFormat: 'rich',
      contentVersion: 2,
      importFormatVersion: 3,
      richBlocks: [{
        type: 'image',
        key: 'map',
        caption: [{
          type: 'text',
          text: 'World map',
        }],
      }],
    });

    await expect(
      chapterRichContentRepository.getNovelChapterRichContent(7, 1),
    ).resolves.toMatchObject({
      chapterIndex: 1,
      plainText: 'World map',
      contentFormat: 'rich',
      contentVersion: 2,
      importFormatVersion: 3,
    });
  });

  it('replaces rich content rows only within the target novel scope', async () => {
    await chapterRichContentRepository.replaceNovelChapterRichContents(3, {
      chapters: [{
        chapterIndex: 0,
        richBlocks: [{
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Old alpha',
          }],
        }],
        plainText: 'Old alpha',
        contentFormat: 'rich',
        contentVersion: 1,
        importFormatVersion: 1,
      }],
    });
    await chapterRichContentRepository.replaceNovelChapterRichContents(4, {
      chapters: [{
        chapterIndex: 0,
        richBlocks: [{
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Other novel',
          }],
        }],
        plainText: 'Other novel',
        contentFormat: 'rich',
        contentVersion: 1,
        importFormatVersion: 1,
      }],
    });

    await chapterRichContentRepository.replaceNovelChapterRichContents(3, {
      chapters: [{
        chapterIndex: 2,
        richBlocks: [{
          type: 'unsupported',
          fallbackText: 'Replacement',
          originalTag: 'aside',
        }],
        plainText: 'Replacement',
        contentFormat: 'plain',
        contentVersion: 5,
        importFormatVersion: 2,
      }],
    });

    await expect(
      chapterRichContentRepository.listNovelChapterRichContents(3),
    ).resolves.toMatchObject([{
      chapterIndex: 2,
      plainText: 'Replacement',
      contentFormat: 'plain',
      contentVersion: 5,
      importFormatVersion: 2,
    }]);
    await expect(
      chapterRichContentRepository.listNovelChapterRichContents(4),
    ).resolves.toMatchObject([{
      chapterIndex: 0,
      plainText: 'Other novel',
    }]);
  });

  it('deletes rich content rows for only the targeted novel', async () => {
    await db.chapterRichContents.bulkAdd([
      {
        novelId: 8,
        chapterIndex: 0,
        contentRich: [{
          type: 'hr',
        }],
        contentPlain: '',
        contentFormat: 'plain',
        contentVersion: 1,
        importFormatVersion: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        novelId: 9,
        chapterIndex: 0,
        contentRich: [{
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Keep me',
          }],
        }],
        contentPlain: 'Keep me',
        contentFormat: 'rich',
        contentVersion: 1,
        importFormatVersion: 1,
        updatedAt: new Date().toISOString(),
      },
    ]);

    await chapterRichContentRepository.deleteNovelChapterRichContents(8);

    await expect(db.chapterRichContents.where('novelId').equals(8).count()).resolves.toBe(0);
    await expect(db.chapterRichContents.where('novelId').equals(9).count()).resolves.toBe(1);
    await expect(chapterRichContentRepository.getNovelChapterRichContent(8, 0)).resolves.toBeNull();
  });
});
