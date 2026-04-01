import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const debugLogMock = vi.hoisted(() => vi.fn());
const imageCacheMock = vi.hoisted(() => ({
  peekReaderImageDimensions: vi.fn().mockReturnValue(undefined),
}));

const renderCacheMock = vi.hoisted(() => {
  const memory = new Map<string, unknown>();
  const buildKey = (params: {
    chapterIndex: number;
    contentHash: string;
    layoutKey: string;
    novelId: number;
    variantFamily: string;
  }) => `${params.novelId}:${params.chapterIndex}:${params.variantFamily}:${params.layoutKey}:${params.contentHash}`;

  return {
    reset() {
      memory.clear();
    },
    buildStaticRenderManifest: vi.fn((params: {
      chapter: { index: number };
      layoutKey: string;
      layoutSignature: object;
      novelId: number;
      variantFamily: 'original-paged' | 'original-scroll' | 'summary-shell';
    }) => ({
      chapterIndex: params.chapter.index,
      contentHash: `hash:${params.chapter.index}`,
      layoutKey: params.layoutKey,
      layoutSignature: params.layoutSignature,
      novelId: params.novelId,
      queryManifest: { pageCount: 2 },
      storageKind: 'manifest',
      tree: null,
      updatedAt: '2026-04-01T00:00:00.000Z',
      variantFamily: params.variantFamily,
    })),
    buildStaticRenderTree: vi.fn((params: {
      chapter: { index: number; title: string };
      layoutKey: string;
      layoutSignature: object;
      novelId: number;
      variantFamily: 'original-paged' | 'original-scroll' | 'summary-shell';
    }) => ({
      chapterIndex: params.chapter.index,
      contentHash: `hash:${params.chapter.index}`,
      layoutKey: params.layoutKey,
      layoutSignature: params.layoutSignature,
      novelId: params.novelId,
      queryManifest: {},
      storageKind: 'render-tree',
      tree: {
        chapterIndex: params.chapter.index,
        title: params.chapter.title,
        variantFamily: params.variantFamily,
      },
      updatedAt: '2026-04-01T00:00:00.000Z',
      variantFamily: params.variantFamily,
    })),
    getReaderRenderCacheEntryFromMemory: vi.fn((params: {
      chapterIndex: number;
      contentHash: string;
      layoutKey: string;
      novelId: number;
      variantFamily: string;
    }) => memory.get(buildKey(params)) ?? null),
    getReaderRenderCacheRecordFromDexie: vi.fn().mockResolvedValue(null),
    isMaterializedReaderRenderCacheEntry: vi.fn(
      (entry: { storageKind?: string; tree?: unknown } | null | undefined) => (
        entry?.storageKind === 'render-tree' && Boolean(entry.tree)
      ),
    ),
    persistReaderRenderCacheEntry: vi.fn().mockResolvedValue(undefined),
    primeReaderRenderCacheEntry: vi.fn((entry: {
      chapterIndex: number;
      contentHash: string;
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
  debugLog: debugLogMock,
}));

vi.mock('../../utils/readerImageResourceCache', () => imageCacheMock);
vi.mock('../../utils/readerRenderCache', () => renderCacheMock);

import type { ChapterContent } from '../../api/readerApi';
import type { ReaderLayoutSignature } from '../../utils/readerLayout';
import { useReaderRenderPreheater } from '../useReaderRenderPreheater';

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function createVariantSignatures(): Record<
  'original-paged' | 'original-scroll' | 'summary-shell',
  ReaderLayoutSignature
> {
  return {
    'original-paged': {
      columnCount: 1,
      columnGap: 0,
      fontSize: 18,
      lineSpacing: 1.8,
      pageHeight: 720,
      paragraphSpacing: 16,
      textWidth: 520,
    },
    'original-scroll': {
      columnCount: 1,
      columnGap: 0,
      fontSize: 18,
      lineSpacing: 1.8,
      pageHeight: 800,
      paragraphSpacing: 16,
      textWidth: 640,
    },
    'summary-shell': {
      columnCount: 1,
      columnGap: 0,
      fontSize: 18,
      lineSpacing: 1.8,
      pageHeight: 800,
      paragraphSpacing: 16,
      textWidth: 640,
    },
  };
}

function renderReaderRenderPreheaterHook(options?: {
  fetchChapterContent?: (
    index: number,
    options?: { signal?: AbortSignal },
  ) => Promise<ChapterContent>;
  loadedChapters?: ChapterContent[];
  novelId?: number;
  onMaterializedEntry?: () => void;
  preheatTargets?: Array<{
    chapterIndex: number;
    storageKind: 'manifest' | 'render-tree';
    variantFamily: 'original-paged' | 'original-scroll' | 'summary-shell';
  }>;
  readerTelemetryEnabled?: boolean;
}) {
  const loadedChapters = options?.loadedChapters ?? [createChapter(0, 3)];
  const loadedChaptersRef = {
    current: new Map<number, ChapterContent>(
      loadedChapters.map((chapter) => [chapter.index, chapter]),
    ),
  };
  const fetchChapterContent = options?.fetchChapterContent
    ?? (async (index: number) => createChapter(index, 3));
  const onMaterializedEntry = options?.onMaterializedEntry ?? vi.fn();
  const preheatTargets = options?.preheatTargets ?? [{
    chapterIndex: 1,
    storageKind: 'render-tree' as const,
    variantFamily: 'original-paged' as const,
  }];
  const typography = {
    font: 'Stub Sans',
    fontSizePx: 18,
    lineHeightPx: 28,
    paragraphSpacingPx: 16,
    paragraphSpacingRatio: 0.8,
  };
  const variantSignatures = createVariantSignatures();

  const renderResult = renderHook(() => useReaderRenderPreheater({
    currentChapterIndex: 0,
    fetchChapterContent,
    loadedChaptersRef,
    novelId: options?.novelId ?? 1,
    onMaterializedEntry,
    preheatTargets,
    readerTelemetryEnabled: options?.readerTelemetryEnabled ?? false,
    typography,
    variantSignatures,
  }));

  return {
    fetchChapterContent,
    loadedChaptersRef,
    onMaterializedEntry,
    ...renderResult,
  };
}

describe('useReaderRenderPreheater', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    debugLogMock.mockReset();
    imageCacheMock.peekReaderImageDimensions.mockReturnValue(undefined);
    renderCacheMock.reset();
    renderCacheMock.getReaderRenderCacheRecordFromDexie.mockResolvedValue(null);
    renderCacheMock.persistReaderRenderCacheEntry.mockResolvedValue(undefined);
    renderCacheMock.warmReaderRenderImages.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts in-flight chapter fetches when the hook unmounts', async () => {
    const deferredChapter = createDeferred<ChapterContent>();
    let capturedSignal: AbortSignal | undefined;
    const fetchChapterContent = vi.fn(
      async (_index: number, options?: { signal?: AbortSignal }) => {
        capturedSignal = options?.signal;
        return deferredChapter.promise;
      },
    );

    const { unmount } = renderReaderRenderPreheaterHook({
      fetchChapterContent,
      loadedChapters: [createChapter(0, 3)],
      preheatTargets: [{
        chapterIndex: 1,
        storageKind: 'manifest',
        variantFamily: 'original-scroll',
      }],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });

    expect(fetchChapterContent).toHaveBeenCalledWith(1, expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('short-circuits on materialized dexie hits and surfaces them to the visible cache layer', async () => {
    const dexieEntry = {
      chapterIndex: 1,
      contentHash: 'hash:1',
      layoutKey: 'cached-layout',
      layoutSignature: createVariantSignatures()['original-paged'],
      novelId: 1,
      queryManifest: {},
      storageKind: 'render-tree' as const,
      tree: {
        chapterIndex: 1,
      },
      updatedAt: '2026-04-01T00:00:00.000Z',
      variantFamily: 'original-paged' as const,
    };
    renderCacheMock.getReaderRenderCacheRecordFromDexie.mockResolvedValueOnce(dexieEntry);
    const onMaterializedEntry = vi.fn();

    const { result } = renderReaderRenderPreheaterHook({
      loadedChapters: [createChapter(0, 3), createChapter(1, 3)],
      onMaterializedEntry,
      readerTelemetryEnabled: true,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isPreheating).toBe(false);
    expect(result.current.pendingPreheatCount).toBe(0);

    expect(renderCacheMock.primeReaderRenderCacheEntry).toHaveBeenCalledWith(dexieEntry);
    expect(onMaterializedEntry).toHaveBeenCalledTimes(1);
    expect(renderCacheMock.buildStaticRenderTree).not.toHaveBeenCalled();
    expect(renderCacheMock.persistReaderRenderCacheEntry).not.toHaveBeenCalled();
    expect(debugLogMock).toHaveBeenCalledWith(
      'READER',
      'Reader preheat source',
      expect.objectContaining({
        chapterIndex: 1,
        source: 'dexie',
        storageKind: 'render-tree',
        variantFamily: 'original-paged',
      }),
    );
  });

  it('upgrades manifest-only dexie hits into full render trees for render-tree targets', async () => {
    renderCacheMock.getReaderRenderCacheRecordFromDexie.mockResolvedValueOnce({
      chapterIndex: 1,
      contentHash: 'hash:1',
      layoutKey: 'manifest-layout',
      layoutSignature: createVariantSignatures()['original-paged'],
      novelId: 1,
      queryManifest: { pageCount: 2 },
      storageKind: 'manifest',
      tree: null,
      updatedAt: '2026-04-01T00:00:00.000Z',
      variantFamily: 'original-paged',
    });
    const onMaterializedEntry = vi.fn();

    renderReaderRenderPreheaterHook({
      loadedChapters: [createChapter(0, 3), createChapter(1, 3)],
      onMaterializedEntry,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(renderCacheMock.buildStaticRenderTree).toHaveBeenCalledWith(
      expect.objectContaining({
        chapter: expect.objectContaining({ index: 1 }),
        variantFamily: 'original-paged',
      }),
    );

    expect(renderCacheMock.warmReaderRenderImages).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ index: 1 }),
    );
    expect(renderCacheMock.persistReaderRenderCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterIndex: 1,
        storageKind: 'render-tree',
        variantFamily: 'original-paged',
      }),
    );
    expect(onMaterializedEntry).toHaveBeenCalledTimes(1);
  });

  it('logs failures and keeps draining the preheat queue', async () => {
    renderCacheMock.persistReaderRenderCacheEntry
      .mockRejectedValueOnce(new Error('persist failed'))
      .mockResolvedValue(undefined);
    const fetchChapterContent = vi.fn(async (index: number) => createChapter(index, 3));

    const { result } = renderReaderRenderPreheaterHook({
      fetchChapterContent,
      loadedChapters: [createChapter(0, 3)],
      preheatTargets: [
        {
          chapterIndex: 1,
          storageKind: 'manifest',
          variantFamily: 'original-scroll',
        },
        {
          chapterIndex: 2,
          storageKind: 'manifest',
          variantFamily: 'original-scroll',
        },
      ],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(result.current.isPreheating).toBe(false);
    expect(result.current.pendingPreheatCount).toBe(0);

    expect(fetchChapterContent).toHaveBeenNthCalledWith(1, 1, expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    expect(fetchChapterContent).toHaveBeenNthCalledWith(2, 2, expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    expect(debugLogMock).toHaveBeenCalledWith(
      'READER',
      'Reader render preheat failed',
      expect.objectContaining({
        chapterIndex: 1,
        variantFamily: 'original-scroll',
      }),
      expect.any(Error),
    );
    expect(renderCacheMock.persistReaderRenderCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterIndex: 2,
        storageKind: 'manifest',
        variantFamily: 'original-scroll',
      }),
    );
  });
});
