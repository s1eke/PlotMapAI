import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readerApi } from '../../api/readerApi';
import {
  acquireReaderImageResource,
  areReaderImageResourcesReady,
  clearReaderImageResourcesForNovel,
  peekReaderImageResource,
  preloadReaderImageResources,
  releaseReaderImageResource,
  resetReaderImageResourceCacheForTests,
} from '../readerImageResourceCache';

vi.mock('../../api/readerApi', () => ({
  readerApi: {
    getImageBlob: vi.fn(),
  },
}));

describe('readerImageResourceCache', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalImage = globalThis.Image;

  beforeEach(() => {
    vi.useFakeTimers();
    resetReaderImageResourceCacheForTests();
    vi.clearAllMocks();

    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}`) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;

    globalThis.Image = class {
      src = '';

      decode() {
        return Promise.resolve();
      }
    } as unknown as typeof Image;
  });

  afterEach(() => {
    resetReaderImageResourceCacheForTests();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.Image = originalImage;
  });

  it('reuses one object URL for concurrent acquisitions and revokes it after the last release', async () => {
    vi.mocked(readerApi.getImageBlob).mockResolvedValue(new Blob(['image-data']));

    const [firstUrl, secondUrl] = await Promise.all([
      acquireReaderImageResource(1, 'hero'),
      acquireReaderImageResource(1, 'hero'),
    ]);

    expect(firstUrl).toBe('blob:10');
    expect(secondUrl).toBe('blob:10');
    expect(readerApi.getImageBlob).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    releaseReaderImageResource(1, 'hero');
    vi.runOnlyPendingTimers();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    releaseReaderImageResource(1, 'hero');
    vi.advanceTimersByTime(10_000);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:10');
  });

  it('preloads unique image keys without creating duplicate URLs', async () => {
    vi.mocked(readerApi.getImageBlob).mockResolvedValue(new Blob(['image-data']));

    await preloadReaderImageResources(1, ['hero', 'hero', 'cover']);

    expect(readerApi.getImageBlob).toHaveBeenCalledTimes(2);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(peekReaderImageResource(1, 'hero')).toBe('blob:10');
    expect(areReaderImageResourcesReady(1, ['hero', 'cover'])).toBe(true);
  });

  it('clears all URLs for a novel without touching other novels', async () => {
    vi.mocked(readerApi.getImageBlob)
      .mockResolvedValueOnce(new Blob(['one']))
      .mockResolvedValueOnce(new Blob(['two']));

    await acquireReaderImageResource(1, 'hero');
    await acquireReaderImageResource(2, 'villain');

    clearReaderImageResourcesForNovel(1);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:3');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
