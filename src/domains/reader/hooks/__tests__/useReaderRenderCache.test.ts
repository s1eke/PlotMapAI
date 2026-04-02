import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const debugLogMock = vi.hoisted(() => vi.fn());
const debugFeatureState = vi.hoisted(() => {
  const listeners = new Set<(featureFlags: { readerTelemetry: boolean }) => void>();
  let featureFlags = {
    readerTelemetry: false,
  };

  return {
    getFlags: vi.fn(() => ({ ...featureFlags })),
    isEnabled: vi.fn((flag: 'readerTelemetry') => featureFlags[flag]),
    reset() {
      featureFlags = {
        readerTelemetry: false,
      };
      listeners.clear();
    },
    set(flag: 'readerTelemetry', enabled: boolean) {
      featureFlags = {
        ...featureFlags,
        [flag]: enabled,
      };
      for (const listener of listeners) {
        listener({ ...featureFlags });
      }
    },
    subscribe: vi.fn((listener: (featureFlags: { readerTelemetry: boolean }) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  };
});

const imageCacheMock = vi.hoisted(() => ({
  peekReaderImageDimensions: vi.fn().mockReturnValue(undefined),
  preloadReaderImageResources: vi.fn().mockResolvedValue(undefined),
}));

interface VariantEntry {
  tree: unknown;
  variantFamily: string;
}

interface MaterializedEntry {
  storageKind?: string;
  tree?: unknown;
}

const renderCacheMock = vi.hoisted(() => {
  const memory = new Map<string, unknown>();
  const buildKey = (params: {
    chapterIndex: number;
    layoutKey: string;
    novelId: number;
    variantFamily: string;
  }) => `${params.novelId}:${params.chapterIndex}:${params.variantFamily}:${params.layoutKey}`;

  return {
    reset() {
      memory.clear();
    },
    buildReaderRenderCacheKey: vi.fn(buildKey),
    buildStaticRenderTree: vi.fn((params: {
      chapter: { index: number; title: string };
      layoutKey?: string;
      layoutSignature: object;
      novelId: number;
      variantFamily: 'original-paged' | 'original-scroll' | 'summary-shell';
    }) => {
      let tree;
      if (params.variantFamily === 'original-paged') {
        tree = {
          chapterIndex: params.chapter.index,
          columnCount: 1,
          columnGap: 0,
          columnWidth: 400,
          pageHeight: 400,
          pageSlices: [],
        };
      } else if (params.variantFamily === 'original-scroll') {
        tree = {
          blockCount: 0,
          chapterIndex: params.chapter.index,
          metrics: [],
          textWidth: 400,
          totalHeight: 0,
        };
      } else {
        tree = {
          chapterIndex: params.chapter.index,
          title: params.chapter.title,
          variant: 'summary-shell',
        };
      }

      return {
        chapterIndex: params.chapter.index,
        contentHash: `hash:${params.chapter.index}`,
        layoutKey: params.layoutKey ?? `${params.variantFamily}:${params.novelId}`,
        layoutSignature: params.layoutSignature,
        novelId: params.novelId,
        queryManifest: {},
        storageKind: 'render-tree',
        tree,
        updatedAt: '2026-03-31T00:00:00.000Z',
        variantFamily: params.variantFamily,
      };
    }),
    buildStaticRenderManifest: vi.fn((params: {
      chapter: { index: number };
      layoutKey?: string;
      layoutSignature: object;
      novelId: number;
      variantFamily: 'original-paged' | 'original-scroll' | 'summary-shell';
    }) => ({
      chapterIndex: params.chapter.index,
      contentHash: `hash:${params.chapter.index}`,
      layoutKey: params.layoutKey ?? `${params.variantFamily}:${params.novelId}`,
      layoutSignature: params.layoutSignature,
      novelId: params.novelId,
      queryManifest: {
        blockCount: 2,
        lineCount: 6,
      },
      storageKind: 'manifest',
      tree: null,
      updatedAt: '2026-03-31T00:00:00.000Z',
      variantFamily: params.variantFamily,
    })),
    clearReaderRenderCacheMemoryForNovel: vi.fn((novelId: number) => {
      for (const key of Array.from(memory.keys())) {
        if (String(key).startsWith(`${novelId}:`)) {
          memory.delete(key);
        }
      }
    }),
    coercePagedTree: vi.fn((entry: VariantEntry | null | undefined) => (
      entry?.variantFamily === 'original-paged' ? entry.tree : null
    )),
    coerceScrollTree: vi.fn((entry: VariantEntry | null | undefined) => (
      entry?.variantFamily === 'original-scroll' ? entry.tree : null
    )),
    coerceSummaryShellTree: vi.fn((entry: VariantEntry | null | undefined) => (
      entry?.variantFamily === 'summary-shell' ? entry.tree : null
    )),
    getReaderRenderCacheRecordFromDexie: vi.fn().mockResolvedValue(null),
    getReaderRenderCacheEntryFromDexie: vi.fn().mockResolvedValue(null),
    getReaderRenderCacheEntryFromMemory: vi.fn((params: {
      chapterIndex: number;
      layoutKey: string;
      novelId: number;
      variantFamily: string;
    }) => memory.get(buildKey(params)) ?? null),
    isMaterializedReaderRenderCacheEntry: vi.fn((entry: MaterializedEntry | null | undefined) => (
      entry?.storageKind === 'render-tree' && Boolean(entry.tree)
    )),
    persistReaderRenderCacheEntry: vi.fn().mockResolvedValue(undefined),
    primeReaderRenderCacheEntry: vi.fn((entry: {
      chapterIndex: number;
      layoutKey: string;
      novelId: number;
      variantFamily: string;
    }) => {
      memory.set(buildKey(entry), entry);
      return entry;
    }),
    warmReaderRenderImages: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@app/debug/service', () => ({
  debugFeatureSubscribe: debugFeatureState.subscribe,
  debugLog: debugLogMock,
  isDebugFeatureEnabled: debugFeatureState.isEnabled,
}));

vi.mock('../../utils/readerImageResourceCache', () => imageCacheMock);

vi.mock('../../utils/readerRenderCache', () => renderCacheMock);

import type { Chapter, ChapterContent } from '../../readerContentService';
import { useReaderRenderCache } from '../useReaderRenderCache';

function createChapter(index: number, totalChapters: number): ChapterContent {
  return {
    index,
    title: `Chapter ${index + 1}`,
    content: `Content for chapter ${index + 1}`,
    wordCount: 120,
    totalChapters,
    hasPrev: index > 0,
    hasNext: index < totalChapters - 1,
  };
}

function createViewport(width = 600, height = 800): HTMLDivElement {
  const viewport = document.createElement('div');
  Object.defineProperty(viewport, 'clientWidth', {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(viewport, 'clientHeight', {
    configurable: true,
    get: () => height,
  });
  Object.defineProperty(viewport, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      toJSON: () => ({}),
    }),
  });
  return viewport;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function renderReaderRenderCacheHook(options?: {
  chapters?: Chapter[];
  currentChapter?: ChapterContent | null;
  fetchChapterContent?: (
    index: number,
    options?: { signal?: AbortSignal },
  ) => Promise<ChapterContent>;
  isPagedMode?: boolean;
  novelId?: number;
  pagedChapters?: ChapterContent[];
  scrollChapters?: Array<{ chapter: ChapterContent; index: number }>;
  viewMode?: 'original' | 'summary';
}) {
  const chapters = options?.chapters ?? [
    { index: 0, title: 'Chapter 1', wordCount: 120 },
    { index: 1, title: 'Chapter 2', wordCount: 120 },
  ];
  const currentChapter = options?.currentChapter ?? createChapter(0, chapters.length);
  const viewport = createViewport();
  const contentRef = { current: viewport };
  const fetchChapterContent = options?.fetchChapterContent
    ?? (async (index: number) => createChapter(index, chapters.length));

  return renderHook(() => useReaderRenderCache({
    chapters,
    contentRef,
    currentChapter,
    fetchChapterContent,
    fontSize: 18,
    isPagedMode: options?.isPagedMode ?? false,
    lineSpacing: 1.8,
    novelId: options?.novelId ?? 1,
    pagedChapters: options?.pagedChapters ?? [],
    pagedViewportElement: viewport,
    paragraphSpacing: 16,
    scrollChapters: options?.scrollChapters ?? [],
    viewMode: options?.viewMode ?? 'original',
  }));
}

describe('useReaderRenderCache', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    debugLogMock.mockReset();
    debugFeatureState.reset();
    imageCacheMock.peekReaderImageDimensions.mockReturnValue(undefined);
    imageCacheMock.preloadReaderImageResources.mockResolvedValue(undefined);
    renderCacheMock.reset();
    renderCacheMock.getReaderRenderCacheRecordFromDexie.mockResolvedValue(null);
    renderCacheMock.getReaderRenderCacheEntryFromDexie.mockResolvedValue(null);
    renderCacheMock.persistReaderRenderCacheEntry.mockResolvedValue(undefined);
    renderCacheMock.warmReaderRenderImages.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('continues preheating after image warming failures and clears the preheating state', async () => {
    renderCacheMock.warmReaderRenderImages.mockRejectedValueOnce(new Error('warm failed'));
    const fetchChapterContent = vi.fn(async (index: number) => createChapter(index, 2));

    const { result } = renderReaderRenderCacheHook({
      fetchChapterContent,
    });

    await waitFor(() => {
      expect(result.current.isPreheating).toBe(false);
      expect(result.current.pendingPreheatCount).toBe(0);
    });

    expect(fetchChapterContent).toHaveBeenCalledWith(1, expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    expect(debugLogMock).toHaveBeenCalledWith(
      'READER',
      'Reader render preheat failed',
      expect.objectContaining({
        chapterIndex: 0,
        variantFamily: 'original-paged',
      }),
      expect.any(Error),
    );
  });

  it('continues preheating after persistence failures and clears the preheating state', async () => {
    renderCacheMock.persistReaderRenderCacheEntry.mockRejectedValueOnce(new Error('persist failed'));
    const fetchChapterContent = vi.fn(async (index: number) => createChapter(index, 2));

    const { result } = renderReaderRenderCacheHook({
      fetchChapterContent,
    });

    await waitFor(() => {
      expect(result.current.isPreheating).toBe(false);
      expect(result.current.pendingPreheatCount).toBe(0);
    });

    expect(fetchChapterContent).toHaveBeenCalledWith(1, expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    expect(debugLogMock).toHaveBeenCalledWith(
      'READER',
      'Reader render preheat failed',
      expect.objectContaining({
        chapterIndex: 0,
        variantFamily: 'original-paged',
      }),
      expect.any(Error),
    );
  });

  it('catches visible render persistence failures without breaking the visible layout state', async () => {
    const currentChapter = createChapter(0, 1);
    renderCacheMock.persistReaderRenderCacheEntry.mockRejectedValueOnce(new Error('visible persist failed'));

    const { result } = renderReaderRenderCacheHook({
      chapters: [{ index: 0, title: 'Chapter 1', wordCount: 120 }],
      currentChapter,
      novelId: 0,
      scrollChapters: [{ chapter: currentChapter, index: currentChapter.index }],
    });

    await waitFor(() => {
      expect(result.current.scrollLayouts.has(0)).toBe(true);
    });

    expect(debugLogMock).toHaveBeenCalledWith(
      'READER',
      'Visible render cache persistence failed',
      expect.objectContaining({
        chapterIndex: 0,
        variantFamily: 'original-scroll',
      }),
      expect.any(Error),
    );
  });

  it('rebuilds visible image chapters when decoded image dimensions become available', async () => {
    const currentChapter = {
      ...createChapter(0, 1),
      content: 'Before image\n[IMG:cover]\nAfter image',
    };
    const preload = createDeferred<undefined>();

    imageCacheMock.preloadReaderImageResources.mockImplementation(async () => {
      await preload.promise;
      imageCacheMock.peekReaderImageDimensions.mockReturnValue({
        aspectRatio: 5,
        height: 240,
        width: 1200,
      });
    });

    renderReaderRenderCacheHook({
      chapters: [{ index: 0, title: 'Chapter 1', wordCount: 120 }],
      currentChapter,
      novelId: 9,
      scrollChapters: [{ chapter: currentChapter, index: currentChapter.index }],
    });

    const getVisibleScrollBuildCalls = () => renderCacheMock.buildStaticRenderTree.mock.calls
      .map(([params]) => (
        params as {
          chapter: { index: number };
          layoutKey?: string;
          variantFamily: string;
        }
      ))
      .filter((params) => (
        params.variantFamily === 'original-scroll' && params.chapter.index === 0
      ));

    await waitFor(() => {
      expect(getVisibleScrollBuildCalls()).not.toHaveLength(0);
    });

    const [initialBuild] = getVisibleScrollBuildCalls();
    expect(initialBuild.layoutKey).toContain('cover:pending');
    renderCacheMock.buildStaticRenderTree.mockClear();

    preload.resolve(undefined);
    await Promise.resolve();

    await waitFor(() => {
      expect(getVisibleScrollBuildCalls()).not.toHaveLength(0);
    });

    const rebuiltWithDimensions = getVisibleScrollBuildCalls().at(-1);
    expect(rebuiltWithDimensions).toBeDefined();
    expect(rebuiltWithDimensions?.layoutKey).toContain('cover:1200x240');
    expect(rebuiltWithDimensions?.layoutKey).not.toBe(initialBuild.layoutKey);
    expect(renderCacheMock.persistReaderRenderCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterIndex: 0,
        layoutKey: expect.stringContaining('cover:1200x240'),
        storageKind: 'render-tree',
        variantFamily: 'original-scroll',
      }),
    );
  });

  it('does not retrigger image preload forever when chapter arrays get recreated on rerender', async () => {
    const currentChapter = {
      ...createChapter(0, 1),
      content: 'Before image\n[IMG:cover]\nAfter image',
    };
    const viewport = createViewport();
    const contentRef = { current: viewport };

    renderHook(() => useReaderRenderCache({
      chapters: [{ index: 0, title: 'Chapter 1', wordCount: 120 }],
      contentRef,
      currentChapter,
      fetchChapterContent: async (index: number) => createChapter(index, 1),
      fontSize: 18,
      isPagedMode: false,
      lineSpacing: 1.8,
      novelId: 7,
      pagedChapters: [],
      pagedViewportElement: viewport,
      paragraphSpacing: 16,
      scrollChapters: [{ chapter: currentChapter, index: currentChapter.index }],
      viewMode: 'original',
    }));

    await waitFor(() => {
      expect(imageCacheMock.preloadReaderImageResources).toHaveBeenCalledTimes(1);
    });
  });

  it('does not restart preheating when the current chapter object is recreated with the same index', async () => {
    const currentChapter = createChapter(0, 1);
    const viewport = createViewport();
    const contentRef = { current: viewport };
    const chapters = [{ index: 0, title: 'Chapter 1', wordCount: 120 }];
    const fetchChapterContent = async (index: number) => createChapter(index, 1);

    const { result, rerender } = renderHook(
      ({ nextCurrentChapter }: { nextCurrentChapter: ChapterContent }) => useReaderRenderCache({
        chapters,
        contentRef,
        currentChapter: nextCurrentChapter,
        fetchChapterContent,
        fontSize: 18,
        isPagedMode: false,
        lineSpacing: 1.8,
        novelId: 11,
        pagedChapters: [],
        pagedViewportElement: viewport,
        paragraphSpacing: 16,
        scrollChapters: [{ chapter: nextCurrentChapter, index: nextCurrentChapter.index }],
        viewMode: 'original',
      }),
      {
        initialProps: { nextCurrentChapter: currentChapter },
      },
    );

    await waitFor(() => {
      expect(result.current.isPreheating).toBe(false);
      expect(result.current.pendingPreheatCount).toBe(0);
    });
    const initialDexieLookupCount =
      renderCacheMock.getReaderRenderCacheRecordFromDexie.mock.calls.length;
    expect(initialDexieLookupCount).toBeGreaterThan(0);

    rerender({
      nextCurrentChapter: {
        ...currentChapter,
      },
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      renderCacheMock.getReaderRenderCacheRecordFromDexie,
    ).toHaveBeenCalledTimes(initialDexieLookupCount);
  });

  it('does not restart preheating when fetchChapterContent gets a new function identity', async () => {
    const currentChapter = createChapter(0, 1);
    const viewport = createViewport();
    const contentRef = { current: viewport };
    const chapters = [{ index: 0, title: 'Chapter 1', wordCount: 120 }];
    const createFetchChapterContent = () => async (index: number) => createChapter(index, 1);

    const { result, rerender } = renderHook(
      ({ nextFetchChapterContent }: {
        nextFetchChapterContent: (index: number) => Promise<ChapterContent>;
      }) => useReaderRenderCache({
        chapters,
        contentRef,
        currentChapter,
        fetchChapterContent: nextFetchChapterContent,
        fontSize: 18,
        isPagedMode: false,
        lineSpacing: 1.8,
        novelId: 13,
        pagedChapters: [],
        pagedViewportElement: viewport,
        paragraphSpacing: 16,
        scrollChapters: [{ chapter: currentChapter, index: currentChapter.index }],
        viewMode: 'original',
      }),
      {
        initialProps: {
          nextFetchChapterContent: createFetchChapterContent(),
        },
      },
    );

    await waitFor(() => {
      expect(result.current.isPreheating).toBe(false);
      expect(result.current.pendingPreheatCount).toBe(0);
    });
    const initialDexieLookupCount =
      renderCacheMock.getReaderRenderCacheRecordFromDexie.mock.calls.length;
    expect(initialDexieLookupCount).toBeGreaterThan(0);

    rerender({
      nextFetchChapterContent: createFetchChapterContent(),
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      renderCacheMock.getReaderRenderCacheRecordFromDexie,
    ).toHaveBeenCalledTimes(initialDexieLookupCount);
  });

  it('logs reader layout snapshots with visible counts and cache source breakdowns', async () => {
    debugFeatureState.set('readerTelemetry', true);
    const currentChapter = createChapter(0, 1);

    renderReaderRenderCacheHook({
      chapters: [{ index: 0, title: 'Chapter 1', wordCount: 120 }],
      currentChapter,
      scrollChapters: [{ chapter: currentChapter, index: currentChapter.index }],
    });

    await waitFor(() => {
      expect(debugLogMock).toHaveBeenCalledWith(
        'READER',
        'Reader layout snapshot',
        expect.objectContaining({
          activeVariant: 'original-scroll',
          cacheModel: 'layered-render-cache',
          currentPagedPageCount: 0,
          currentPagedPageItemCount: 0,
          scrollBlockCount: 0,
          scrollChapterCount: 1,
          visibleCacheSources: {
            built: 1,
            dexie: 0,
            memory: 0,
          },
        }),
      );
    });
  });

  it('does not emit extra layout snapshots when only pending preheat state changes', async () => {
    vi.useFakeTimers();
    debugFeatureState.set('readerTelemetry', true);
    const currentChapter = createChapter(0, 1);
    const stalledPagedPersist = createDeferred<undefined>();
    const stalledSummaryPersist = createDeferred<undefined>();
    renderCacheMock.persistReaderRenderCacheEntry.mockImplementation((entry: {
      chapterIndex: number;
      variantFamily: 'original-paged' | 'original-scroll' | 'summary-shell';
    }) => {
      if (entry.chapterIndex === 0 && entry.variantFamily === 'original-paged') {
        return stalledPagedPersist.promise;
      }
      if (entry.chapterIndex === 0 && entry.variantFamily === 'summary-shell') {
        return stalledSummaryPersist.promise;
      }
      return Promise.resolve(undefined);
    });

    const { result } = renderReaderRenderCacheHook({
      chapters: [{ index: 0, title: 'Chapter 1', wordCount: 120 }],
      currentChapter,
      scrollChapters: [{ chapter: currentChapter, index: currentChapter.index }],
    });

    const getLayoutSnapshotCalls = () => debugLogMock.mock.calls.filter((call) => (
      call[0] === 'READER' && call[1] === 'Reader layout snapshot'
    ));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    debugLogMock.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });

    expect(result.current.isPreheating).toBe(true);
    expect(result.current.pendingPreheatCount).toBe(1);
    debugLogMock.mockClear();

    await act(async () => {
      stalledPagedPersist.resolve();
      await vi.advanceTimersByTimeAsync(16);
    });

    expect(result.current.pendingPreheatCount).toBe(0);
    expect(getLayoutSnapshotCalls()).toHaveLength(0);

    await act(async () => {
      stalledSummaryPersist.resolve();
      await vi.advanceTimersByTimeAsync(500);
    });
  });

  it('logs preheat cache sources for non-visible reader variants', async () => {
    debugFeatureState.set('readerTelemetry', true);
    renderReaderRenderCacheHook();

    await waitFor(() => {
      expect(debugLogMock).toHaveBeenCalledWith(
        'READER',
        'Reader preheat source',
        expect.objectContaining({
          chapterIndex: 0,
          source: 'built',
          storageKind: 'render-tree',
          variantFamily: 'original-paged',
        }),
      );
    });
  });

  it('persists far preheat targets as manifest summaries for the active variant only', async () => {
    renderReaderRenderCacheHook({
      chapters: [
        { index: 0, title: 'Chapter 1', wordCount: 120 },
        { index: 1, title: 'Chapter 2', wordCount: 120 },
        { index: 2, title: 'Chapter 3', wordCount: 120 },
      ],
      currentChapter: createChapter(0, 3),
      scrollChapters: [{ chapter: createChapter(0, 3), index: 0 }],
    });

    await waitFor(() => {
      expect(renderCacheMock.persistReaderRenderCacheEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterIndex: 2,
          storageKind: 'manifest',
          tree: null,
          variantFamily: 'original-scroll',
        }),
      );
    });

    expect(renderCacheMock.persistReaderRenderCacheEntry).not.toHaveBeenCalledWith(
      expect.objectContaining({
        chapterIndex: 1,
        variantFamily: 'original-paged',
      }),
    );
    expect(renderCacheMock.buildStaticRenderManifest).toHaveBeenCalled();
    expect(renderCacheMock.buildStaticRenderTree).not.toHaveBeenCalledWith(
      expect.objectContaining({
        chapter: expect.objectContaining({ index: 2 }),
        variantFamily: 'original-scroll',
      }),
    );
  });

  it('upgrades manifest-only dexie hits to full render trees for near render targets', async () => {
    renderCacheMock.getReaderRenderCacheRecordFromDexie.mockImplementation(async (params: {
      chapterIndex: number;
      variantFamily: string;
    }) => {
      if (params.chapterIndex === 0 && params.variantFamily === 'original-paged') {
        return {
          chapterIndex: 0,
          contentHash: 'hash:0',
          layoutKey: 'original-paged:1',
          layoutSignature: {},
          novelId: 1,
          queryManifest: { pageCount: 3 },
          storageKind: 'manifest',
          tree: null,
          updatedAt: '2026-03-31T00:00:00.000Z',
          variantFamily: 'original-paged',
        };
      }

      return null;
    });

    renderReaderRenderCacheHook();

    await waitFor(() => {
      expect(renderCacheMock.buildStaticRenderTree).toHaveBeenCalledWith(
        expect.objectContaining({
          chapter: expect.objectContaining({ index: 0 }),
          variantFamily: 'original-paged',
        }),
      );
    });

    expect(renderCacheMock.persistReaderRenderCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterIndex: 0,
        storageKind: 'render-tree',
        variantFamily: 'original-paged',
      }),
    );
  });

  it('keeps verbose reader telemetry disabled by default', async () => {
    renderReaderRenderCacheHook();

    await waitFor(() => {
      expect(renderCacheMock.warmReaderRenderImages).toHaveBeenCalled();
    });

    expect(debugLogMock).not.toHaveBeenCalledWith(
      'READER',
      'Reader layout snapshot',
      expect.anything(),
    );
    expect(debugLogMock).not.toHaveBeenCalledWith(
      'READER',
      'Reader preheat source',
      expect.anything(),
    );
  });

  it('does not restart preheating when reader telemetry toggles', async () => {
    vi.useFakeTimers();
    const deferredChapter = createDeferred<ChapterContent>();
    const fetchChapterContent = vi.fn(async (index: number) => {
      if (index !== 1) {
        return createChapter(index, 2);
      }
      return deferredChapter.promise;
    });

    const { result } = renderReaderRenderCacheHook({
      fetchChapterContent,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(fetchChapterContent).toHaveBeenCalledTimes(1);
    expect(fetchChapterContent).toHaveBeenCalledWith(1, expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));

    await act(async () => {
      debugFeatureState.set('readerTelemetry', true);
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(fetchChapterContent).toHaveBeenCalledTimes(1);
    expect(result.current.isPreheating).toBe(true);

    await act(async () => {
      deferredChapter.resolve(createChapter(1, 2));
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.isPreheating).toBe(false);
    expect(result.current.pendingPreheatCount).toBe(0);
  });
});
