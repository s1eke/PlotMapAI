import type { ReaderImageGalleryEntry } from '../../utils/readerImageGallery';

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clearReaderImageResourcesForNovelMock = vi.hoisted(() => vi.fn());
const preloadReaderImageResourcesMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

import { useReaderPageImageOverlay } from '../useReaderPageImageOverlay';
import { readerContentService } from '../../readerContentService';

vi.mock('../../readerContentService', () => ({
  readerContentService: {
    getImageGalleryEntries: vi.fn(),
  },
}));

vi.mock('../../utils/readerImageResourceCache', () => ({
  clearReaderImageResourcesForNovel: clearReaderImageResourcesForNovelMock,
  preloadReaderImageResources: preloadReaderImageResourcesMock,
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function createEntry(
  chapterIndex: number,
  blockIndex: number,
  imageKey: string,
  order: number,
): ReaderImageGalleryEntry {
  return {
    blockIndex,
    chapterIndex,
    imageKey,
    order,
  };
}

describe('useReaderPageImageOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({ idx: 0 }, '', '#/novel/1/read');
    vi.mocked(readerContentService.getImageGalleryEntries).mockResolvedValue([]);
    preloadReaderImageResourcesMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deduplicates gallery index loading while opening the viewer', async () => {
    const deferred = createDeferred<ReaderImageGalleryEntry[]>();
    vi.mocked(readerContentService.getImageGalleryEntries).mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
      },
    );

    const sourceElement = document.createElement('button');
    Object.defineProperty(sourceElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 20, 20),
    });

    act(() => {
      result.current.handleImageActivate({
        blockIndex: 0,
        chapterIndex: 0,
        imageKey: 'cover',
        sourceElement,
      });
      result.current.handleImageActivate({
        blockIndex: 0,
        chapterIndex: 0,
        imageKey: 'cover',
        sourceElement,
      });
    });

    expect(readerContentService.getImageGalleryEntries).toHaveBeenCalledTimes(1);
    expect(result.current.imageViewerProps.isIndexLoading).toBe(true);

    deferred.resolve([createEntry(0, 0, 'cover', 0)]);
    await waitFor(() => {
      expect(result.current.imageViewerProps.isIndexResolved).toBe(true);
    });
  });

  it('ignores stale gallery results after switching novels', async () => {
    const firstRequest = createDeferred<ReaderImageGalleryEntry[]>();
    const secondRequest = createDeferred<ReaderImageGalleryEntry[]>();
    vi.mocked(readerContentService.getImageGalleryEntries)
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const { result, rerender } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
      },
    );

    rerender({ isEnabled: true, novelId: 2 });

    firstRequest.resolve([createEntry(0, 0, 'stale', 0)]);
    secondRequest.resolve([createEntry(1, 0, 'fresh', 0)]);

    await waitFor(() => {
      expect(result.current.imageViewerProps.entries).toEqual([
        createEntry(1, 0, 'fresh', 0),
      ]);
    });
  });

  it('restores focus to the activating element when the viewer closes', async () => {
    vi.mocked(readerContentService.getImageGalleryEntries).mockResolvedValueOnce([
      createEntry(0, 0, 'cover', 0),
    ]);

    const { result } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
      },
    );

    await waitFor(() => {
      expect(result.current.imageViewerProps.isIndexResolved).toBe(true);
    });

    const sourceElement = document.createElement('button');
    document.body.append(sourceElement);
    Object.defineProperty(sourceElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 20, 20),
    });

    act(() => {
      result.current.handleImageActivate({
        blockIndex: 0,
        chapterIndex: 0,
        imageKey: 'cover',
        sourceElement,
      });
    });

    sourceElement.blur();

    vi.useFakeTimers();
    act(() => {
      result.current.closeImageViewer();
      vi.runAllTimers();
    });

    expect(document.activeElement).toBe(sourceElement);
  });

  it('closes the viewer when browser back pops the image-viewer history entry', async () => {
    vi.mocked(readerContentService.getImageGalleryEntries).mockResolvedValueOnce([
      createEntry(0, 0, 'cover', 0),
    ]);

    const { result } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
      },
    );

    await waitFor(() => {
      expect(result.current.imageViewerProps.isIndexResolved).toBe(true);
    });

    const sourceElement = document.createElement('button');
    Object.defineProperty(sourceElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 20, 20),
    });

    act(() => {
      result.current.handleImageActivate({
        blockIndex: 0,
        chapterIndex: 0,
        imageKey: 'cover',
        sourceElement,
      });
    });

    await waitFor(() => {
      expect(result.current.isImageViewerOpen).toBe(true);
    });

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', {
        state: { idx: 0 },
      }));
    });

    await waitFor(() => {
      expect(result.current.isImageViewerOpen).toBe(false);
    });
  });

  it('syncs history back when the viewer closes directly', async () => {
    vi.mocked(readerContentService.getImageGalleryEntries).mockResolvedValueOnce([
      createEntry(0, 0, 'cover', 0),
    ]);
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    const { result } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
      },
    );

    await waitFor(() => {
      expect(result.current.imageViewerProps.isIndexResolved).toBe(true);
    });

    const sourceElement = document.createElement('button');
    Object.defineProperty(sourceElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 20, 20),
    });

    act(() => {
      result.current.handleImageActivate({
        blockIndex: 0,
        chapterIndex: 0,
        imageKey: 'cover',
        sourceElement,
      });
    });

    await waitFor(() => {
      expect(result.current.isImageViewerOpen).toBe(true);
    });

    act(() => {
      result.current.closeImageViewer();
    });

    expect(historyBackSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isImageViewerOpen).toBe(false);
  });

  it('navigates using the full-book image order', async () => {
    vi.mocked(readerContentService.getImageGalleryEntries).mockResolvedValueOnce([
      createEntry(0, 0, 'first', 0),
      createEntry(1, 0, 'second', 0),
      createEntry(1, 1, 'third', 1),
    ]);

    const { result } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
      },
    );

    await waitFor(() => {
      expect(result.current.imageViewerProps.entries).toHaveLength(3);
    });

    const sourceElement = document.createElement('button');
    Object.defineProperty(sourceElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 20, 20),
    });

    act(() => {
      result.current.handleImageActivate({
        blockIndex: 0,
        chapterIndex: 1,
        imageKey: 'second',
        sourceElement,
      });
    });

    await act(async () => {
      const didNavigate = await result.current.imageViewerProps.onRequestNavigate('next');
      expect(didNavigate).toBe(true);
    });
    expect(result.current.imageViewerProps.activeEntry).toEqual(
      createEntry(1, 1, 'third', 1),
    );

    await act(async () => {
      const didNavigate = await result.current.imageViewerProps.onRequestNavigate('prev');
      expect(didNavigate).toBe(true);
    });
    expect(result.current.imageViewerProps.activeEntry).toEqual(
      createEntry(1, 0, 'second', 0),
    );
  });

  it('preloads the current image with adjacent neighbors once the viewer opens', async () => {
    vi.mocked(readerContentService.getImageGalleryEntries).mockResolvedValueOnce([
      createEntry(0, 0, 'first', 0),
      createEntry(1, 0, 'second', 0),
      createEntry(1, 1, 'third', 1),
    ]);

    const { result } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
      },
    );

    await waitFor(() => {
      expect(result.current.imageViewerProps.entries).toHaveLength(3);
    });
    preloadReaderImageResourcesMock.mockClear();

    const sourceElement = document.createElement('button');
    Object.defineProperty(sourceElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 20, 20),
    });

    act(() => {
      result.current.handleImageActivate({
        blockIndex: 0,
        chapterIndex: 1,
        imageKey: 'second',
        sourceElement,
      });
    });

    await waitFor(() => {
      expect(preloadReaderImageResourcesMock).toHaveBeenCalledTimes(1);
    });

    const [preloadedNovelId, preloadedKeys] = preloadReaderImageResourcesMock.mock.calls[0] as [
      number,
      Set<string>,
    ];
    expect(preloadedNovelId).toBe(1);
    expect(Array.from(preloadedKeys)).toEqual(['second', 'first', 'third']);
  });
});
