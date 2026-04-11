import { describe, expect, it } from 'vitest';

import type { NovelRecord } from '@infra/db/library';

import { mapNovelRecordToView } from '../mappers';

describe('library mappers', () => {
  it('maps persisted novels into views', () => {
    const record: NovelRecord = {
      id: 7,
      title: 'Novel',
      author: 'Author',
      description: 'Desc',
      tags: ['tag'],
      fileType: 'txt',
      fileHash: 'hash',
      coverPath: 'has_cover',
      originalFilename: 'novel.txt',
      originalEncoding: 'utf-8',
      totalWords: 1234,
      chapterCount: 8,
      createdAt: '2026-04-01T00:00:00.000Z',
    };

    expect(mapNovelRecordToView(record)).toEqual({
      id: 7,
      title: 'Novel',
      author: 'Author',
      description: 'Desc',
      tags: ['tag'],
      fileType: 'txt',
      hasCover: true,
      originalFilename: 'novel.txt',
      originalEncoding: 'utf-8',
      totalWords: 1234,
      chapterCount: 8,
      createdAt: '2026-04-01T00:00:00.000Z',
    });
  });
});
