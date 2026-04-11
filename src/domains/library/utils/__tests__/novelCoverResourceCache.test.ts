import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@infra/db';

import {
  acquireNovelCoverResource,
  clearNovelCoverResourcesForNovel,
  peekNovelCoverResource,
  releaseNovelCoverResource,
  resetNovelCoverResourceCacheForTests,
} from '../novelCoverResourceCache';

function createNovelRecord(overrides: Partial<{
  chapterCount: number;
  coverPath: string;
  createdAt: string;
  fileHash: string;
  originalFilename: string;
  title: string;
}> = {}) {
  return {
    author: '',
    coverPath: '',
    createdAt: '2026-04-01T00:00:00.000Z',
    description: '',
    fileHash: 'cover-cache-hash',
    fileType: 'txt',
    originalEncoding: 'utf-8',
    originalFilename: 'cover-cache.txt',
    tags: [],
    title: 'Cover Cache Novel',
    totalWords: 100,
    chapterCount: 0,
    ...overrides,
  };
}

describe('novelCoverResourceCache', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.delete();
    await db.open();
    resetNovelCoverResourceCacheForTests();
    URL.createObjectURL = vi.fn(() => 'blob:cover-url') as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    resetNovelCoverResourceCacheForTests();
    vi.useRealTimers();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('reuses one object URL for concurrent acquisitions and revokes it after the last release', async () => {
    const novelId = await db.novels.add(createNovelRecord({
      chapterCount: 1,
      coverPath: 'has_cover',
      fileHash: 'concurrent-cover-hash',
      originalFilename: 'concurrent-cover.txt',
    }));
    await db.coverImages.add({
      blob: new Blob(['image-data']),
      novelId,
    });

    const [firstUrl, secondUrl] = await Promise.all([
      acquireNovelCoverResource(novelId),
      acquireNovelCoverResource(novelId),
    ]);

    expect(firstUrl).toBe('blob:cover-url');
    expect(secondUrl).toBe('blob:cover-url');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    releaseNovelCoverResource(novelId);
    vi.runOnlyPendingTimers();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    releaseNovelCoverResource(novelId);
    vi.advanceTimersByTime(10_000);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover-url');
  });

  it('clears URLs for one novel without touching other cached covers', async () => {
    const firstNovelId = await db.novels.add(createNovelRecord({
      chapterCount: 1,
      coverPath: 'has_cover',
      fileHash: 'first-cover-hash',
      originalFilename: 'first-cover.txt',
      title: 'First Cover Novel',
    }));
    const secondNovelId = await db.novels.add(createNovelRecord({
      chapterCount: 1,
      coverPath: 'has_cover',
      createdAt: '2026-04-02T00:00:00.000Z',
      fileHash: 'second-cover-hash',
      originalFilename: 'second-cover.txt',
      title: 'Second Cover Novel',
    }));
    await db.coverImages.bulkAdd([
      {
        blob: new Blob(['one']),
        novelId: firstNovelId,
      },
      {
        blob: new Blob(['twenty-two']),
        novelId: secondNovelId,
      },
    ]);
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce('blob:first-cover')
      .mockReturnValueOnce('blob:second-cover');

    await acquireNovelCoverResource(firstNovelId);
    await acquireNovelCoverResource(secondNovelId);

    clearNovelCoverResourcesForNovel(firstNovelId);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-cover');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(peekNovelCoverResource(firstNovelId)).toBeUndefined();
    expect(peekNovelCoverResource(secondNovelId)).toBe('blob:second-cover');
  });

  it('does not leak object URLs when cleared during an in-flight load', async () => {
    let resolveCover!: (value: { blob: Blob; id: number; novelId: number } | undefined) => void;
    const first = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveCover = resolve;
    }));
    const equals = vi.fn(() => ({ first }));
    const whereResult: { equals: typeof equals } = { equals };
    const whereSpy = vi.spyOn(db.coverImages, 'where').mockReturnValue(whereResult as never);

    const acquirePromise = acquireNovelCoverResource(9);
    clearNovelCoverResourcesForNovel(9);
    resolveCover({
      blob: new Blob(['cover']),
      id: 1,
      novelId: 9,
    });

    await expect(acquirePromise).resolves.toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    whereSpy.mockRestore();
  });
});
