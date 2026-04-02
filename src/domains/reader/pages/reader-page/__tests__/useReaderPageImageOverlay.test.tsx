import type { ReactNode } from 'react';
import type { ReaderContextValue } from '../ReaderContext';
import type { ReaderImageGalleryEntry } from '../../../utils/readerImageGallery';

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clearReaderImageResourcesForNovelMock = vi.hoisted(() => vi.fn());
const preloadReaderImageResourcesMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

import {
  ReaderContextProvider,
} from '../ReaderContext';
import { useReaderPageImageOverlay } from '../useReaderPageImageOverlay';
import { readerApi } from '../../../api/readerApi';

vi.mock('../../../api/readerApi', () => ({
  readerApi: {
    getImageGalleryEntries: vi.fn(),
  },
}));

vi.mock('../../../utils/readerImageResourceCache', () => ({
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

function createReaderContextValue(
  novelId: number,
  overrides: Partial<ReaderContextValue> = {},
): ReaderContextValue {
  const mode = overrides.mode ?? 'scroll';

  return {
    novelId,
    chapterIndex: overrides.chapterIndex ?? 0,
    mode,
    viewMode: overrides.viewMode ?? (mode === 'summary' ? 'summary' : 'original'),
    isPagedMode: overrides.isPagedMode ?? mode === 'paged',
    setChapterIndex: overrides.setChapterIndex ?? vi.fn(),
    setMode: overrides.setMode ?? vi.fn(),
    latestReaderStateRef: { current: {} },
    hasUserInteractedRef: { current: false },
    markUserInteracted: vi.fn(),
    persistReaderState: vi.fn(),
    loadPersistedReaderState: vi.fn(async () => ({})),
    contentRef: { current: null },
    pagedViewportRef: { current: null },
    pageTargetRef: { current: null },
    wheelDeltaRef: { current: 0 },
    pageTurnLockedRef: { current: false },
    chapterCacheRef: { current: new Map() },
    scrollChapterElementsBridgeRef: { current: new Map() },
    scrollChapterBodyElementsBridgeRef: { current: new Map() },
    chapterChangeSourceRef: { current: null },
    pagedStateRef: { current: { pageCount: 1, pageIndex: 0 } },
    restoreSettledHandlerRef: { current: vi.fn() },
    isScrollSyncSuppressedRef: { current: false },
    suppressScrollSyncTemporarilyRef: { current: vi.fn() },
    getCurrentAnchorRef: { current: () => null },
    handleScrollModeScrollRef: { current: () => undefined },
    readingAnchorHandlerRef: { current: () => undefined },
    getCurrentOriginalLocatorRef: { current: () => null },
    getCurrentPagedLocatorRef: { current: () => null },
    resolveScrollLocatorOffsetRef: { current: () => null },
    ...overrides,
  };
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
    vi.mocked(readerApi.getImageGalleryEntries).mockResolvedValue([]);
    preloadReaderImageResourcesMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deduplicates gallery index loading while opening the viewer', async () => {
    const deferred = createDeferred<ReaderImageGalleryEntry[]>();
    vi.mocked(readerApi.getImageGalleryEntries).mockReturnValueOnce(deferred.promise);

    const contextValue = createReaderContextValue(1);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ReaderContextProvider value={contextValue}>
        {children}
      </ReaderContextProvider>
    );
    const { result } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
        wrapper,
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

    expect(readerApi.getImageGalleryEntries).toHaveBeenCalledTimes(1);
    expect(result.current.imageViewerProps.isIndexLoading).toBe(true);

    deferred.resolve([createEntry(0, 0, 'cover', 0)]);
    await waitFor(() => {
      expect(result.current.imageViewerProps.isIndexResolved).toBe(true);
    });
  });

  it('ignores stale gallery results after switching novels', async () => {
    const firstRequest = createDeferred<ReaderImageGalleryEntry[]>();
    const secondRequest = createDeferred<ReaderImageGalleryEntry[]>();
    vi.mocked(readerApi.getImageGalleryEntries)
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    let contextValue = createReaderContextValue(1);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ReaderContextProvider value={contextValue}>
        {children}
      </ReaderContextProvider>
    );

    const { result, rerender } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
        wrapper,
      },
    );

    contextValue = createReaderContextValue(2);
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
    vi.mocked(readerApi.getImageGalleryEntries).mockResolvedValueOnce([
      createEntry(0, 0, 'cover', 0),
    ]);

    const contextValue = createReaderContextValue(1);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ReaderContextProvider value={contextValue}>
        {children}
      </ReaderContextProvider>
    );
    const { result } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
        wrapper,
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

  it('navigates using the full-book image order', async () => {
    vi.mocked(readerApi.getImageGalleryEntries).mockResolvedValueOnce([
      createEntry(0, 0, 'first', 0),
      createEntry(1, 0, 'second', 0),
      createEntry(1, 1, 'third', 1),
    ]);

    const contextValue = createReaderContextValue(1);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ReaderContextProvider value={contextValue}>
        {children}
      </ReaderContextProvider>
    );
    const { result } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
        wrapper,
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
    vi.mocked(readerApi.getImageGalleryEntries).mockResolvedValueOnce([
      createEntry(0, 0, 'first', 0),
      createEntry(1, 0, 'second', 0),
      createEntry(1, 1, 'third', 1),
    ]);

    const contextValue = createReaderContextValue(1);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ReaderContextProvider value={contextValue}>
        {children}
      </ReaderContextProvider>
    );
    const { result } = renderHook(
      ({ isEnabled, novelId }) => useReaderPageImageOverlay({
        dismissBlockedInteraction: vi.fn(),
        isEnabled,
        novelId,
      }),
      {
        initialProps: { isEnabled: true, novelId: 1 },
        wrapper,
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
