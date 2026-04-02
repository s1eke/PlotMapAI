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
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 0.6,
      lastContentMode: 'paged',
    });

    const row = await db.readingProgress.where('novelId').equals(1).first();

    expect(row).toMatchObject({
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 0.6,
      locator: undefined,
    });

    await expect(readReadingProgress(1)).resolves.toMatchObject({
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 0.6,
      locator: undefined,
    });
  });

  it('replaces a summary snapshot when a locator snapshot is persisted', async () => {
    await db.readingProgress.add({
      novelId: 1,
      chapterIndex: 3,
      mode: 'summary',
      chapterProgress: 0.75,
      updatedAt: new Date().toISOString(),
    });

    await replaceReadingProgress(1, {
      chapterIndex: 4,
      mode: 'paged',
      locator: {
        chapterIndex: 4,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 0,
      },
      lastContentMode: 'paged',
    });

    const row = await db.readingProgress.where('novelId').equals(1).first();

    expect(row).toMatchObject({
      chapterIndex: 4,
      mode: 'paged',
      chapterProgress: undefined,
      locator: {
        chapterIndex: 4,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 0,
      },
    });

    await expect(readReadingProgress(1)).resolves.toMatchObject({
      chapterIndex: 4,
      mode: 'paged',
      chapterProgress: undefined,
      locator: {
        chapterIndex: 4,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 0,
      },
    });
  });
});
