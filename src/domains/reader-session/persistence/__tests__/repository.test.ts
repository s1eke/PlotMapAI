import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';

import {
  readReadingProgress,
  replaceReadingProgress,
} from '../repository';

describe('reader-session repository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('returns null when durable progress is missing', async () => {
    await expect(readReadingProgress(1)).resolves.toBeNull();
  });

  it('writes and reads canonical progress records', async () => {
    await replaceReadingProgress(1, {
      canonical: {
        chapterIndex: 2,
        edge: 'start',
      },
      hints: {
        chapterProgress: 0.6,
      },
    });

    const row = await db.readingProgress.where('novelId').equals(1).first();

    expect(row).toMatchObject({
      canonical: {
        chapterIndex: 2,
        edge: 'start',
      },
    });

    await expect(readReadingProgress(1)).resolves.toMatchObject({
      canonical: {
        chapterIndex: 2,
        edge: 'start',
      },
      hints: {
        chapterProgress: 0.6,
        contentMode: undefined,
        pageIndex: undefined,
        viewMode: undefined,
      },
    });
  });

  it('increments revision and persists full restore hints on replacement', async () => {
    await replaceReadingProgress(1, {
      canonical: {
        chapterIndex: 2,
        blockIndex: 1,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.3,
        contentMode: 'paged',
        pageIndex: 4,
        viewMode: 'summary',
      },
    });
    await replaceReadingProgress(1, {
      canonical: {
        chapterIndex: 2,
        blockIndex: 1,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.6,
        contentMode: 'paged',
        pageIndex: 6,
        viewMode: 'summary',
      },
    });

    const row = await db.readingProgress.where('novelId').equals(1).first();

    expect(row).toMatchObject({
      revision: 2,
      chapterProgress: 0.6,
      contentMode: 'paged',
      pageIndex: 6,
      viewMode: 'summary',
    });
    await expect(readReadingProgress(1)).resolves.toEqual({
      canonical: {
        chapterIndex: 2,
        blockIndex: 1,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.6,
        contentMode: 'paged',
        pageIndex: 6,
        viewMode: 'summary',
      },
    });
  });

  it('drops legacy mixed rows without canonical payload', async () => {
    await db.readingProgress.add({
      novelId: 1,
      chapterIndex: 3,
      mode: 'summary',
      chapterProgress: 0.75,
      updatedAt: new Date().toISOString(),
    });

    await expect(readReadingProgress(1)).resolves.toBeNull();
    await expect(db.readingProgress.where('novelId').equals(1).first()).resolves.toBeUndefined();
  });

  it('replaces a legacy row with a canonical snapshot on write', async () => {
    await db.readingProgress.add({
      novelId: 1,
      chapterIndex: 3,
      mode: 'summary',
      chapterProgress: 0.75,
      updatedAt: new Date().toISOString(),
    });

    await replaceReadingProgress(1, {
      canonical: {
        chapterIndex: 4,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 0,
      },
    });

    const row = await db.readingProgress.where('novelId').equals(1).first();

    expect(row).toMatchObject({
      canonical: {
        chapterIndex: 4,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 0,
      },
    });

    await expect(readReadingProgress(1)).resolves.toMatchObject({
      canonical: {
        chapterIndex: 4,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 0,
      },
    });
  });
});
