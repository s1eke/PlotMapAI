import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readerContentService } from '../../readerContentService';
import {
  acquireReaderImageResource,
  areReaderImageResourcesReady,
  clearReaderImageResourcesForNovel,
  peekReaderImageResource,
  preloadReaderImageResources,
  releaseReaderImageResource,
  resetReaderImageResourceCacheForTests,
} from '../readerImageResourceCache';

vi.mock('../../readerContentService', () => ({
  readerContentService: {
    getImageBlob: vi.fn(),
  },
}));

describe('readerImageResourceCache', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    resetReaderImageResourceCacheForTests();
    vi.clearAllMocks();

    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}`) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;

    vi.stubGlobal('Image', class {
      src = '';

      decode() {
        return Promise.resolve();
      }
    });
  });

  afterEach(() => {
    resetReaderImageResourceCacheForTests();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('reuses one object URL for concurrent acquisitions and revokes it after the last release', async () => {
    vi.mocked(readerContentService.getImageBlob).mockResolvedValue(new Blob(['image-data']));

    const [firstUrl, secondUrl] = await Promise.all([
      acquireReaderImageResource(1, 'hero'),
      acquireReaderImageResource(1, 'hero'),
    ]);

    expect(firstUrl).toBe('blob:10');
    expect(secondUrl).toBe('blob:10');
    expect(readerContentService.getImageBlob).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    releaseReaderImageResource(1, 'hero');
    vi.runOnlyPendingTimers();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    releaseReaderImageResource(1, 'hero');
    vi.advanceTimersByTime(10_000);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:10');
  });

  it('preloads unique image keys without creating duplicate URLs', async () => {
    vi.mocked(readerContentService.getImageBlob).mockResolvedValue(new Blob(['image-data']));

    await preloadReaderImageResources(1, ['hero', 'hero', 'cover']);

    expect(readerContentService.getImageBlob).toHaveBeenCalledTimes(2);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(peekReaderImageResource(1, 'hero')).toBe('blob:10');
    expect(areReaderImageResourcesReady(1, ['hero', 'cover'])).toBe(true);
  });

  it('clears all URLs for a novel without touching other novels', async () => {
    vi.mocked(readerContentService.getImageBlob)
      .mockResolvedValueOnce(new Blob(['one']))
      .mockResolvedValueOnce(new Blob(['two']));

    await acquireReaderImageResource(1, 'hero');
    await acquireReaderImageResource(2, 'villain');

    clearReaderImageResourcesForNovel(1);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:3');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('keeps preloaded resources alive until decode finishes', async () => {
    vi.mocked(readerContentService.getImageBlob).mockResolvedValue(new Blob(['image-data']));

    let resolveDecode!: () => void;
    const decodePromise = new Promise<void>((resolve) => {
      resolveDecode = resolve;
    });
    vi.stubGlobal('Image', class {
      naturalWidth = 120;
      naturalHeight = 60;
      src = '';

      decode() {
        return decodePromise;
      }
    });

    const preloadPromise = preloadReaderImageResources(1, ['hero']);
    await Promise.resolve();
    await Promise.resolve();

    vi.advanceTimersByTime(10_000);
    expect(peekReaderImageResource(1, 'hero')).toBe('blob:10');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    resolveDecode();
    await preloadPromise;

    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:10');
  });

  it('assigns image.src only once when decode() is unavailable', async () => {
    vi.mocked(readerContentService.getImageBlob).mockResolvedValue(new Blob(['image-data']));

    let srcAssignments = 0;
    vi.stubGlobal('Image', class {
      naturalWidth = 200;
      naturalHeight = 100;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      get src() {
        return '';
      }

      set src(_value: string) {
        srcAssignments += 1;
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    });

    await preloadReaderImageResources(1, ['hero']);

    expect(srcAssignments).toBe(1);
  });
});
