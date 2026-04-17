import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReaderContextWrapper } from '@test/readerRuntimeTestUtils';

const debugLogMock = vi.hoisted(() => vi.fn());
const imageCacheMock = vi.hoisted(() => ({
  peekReaderImageDimensions: vi.fn().mockReturnValue(undefined),
}));

const renderCacheMock = vi.hoisted(() => {
  const memory = new Map<string, unknown>();
  const READER_RENDERER_VERSION = 2;
  const createContentHash = (chapter: {
    contentFormat: 'plain' | 'rich';
    contentVersion: number;
    index: number;
    plainText: string;
    richBlocks: unknown[];
    title: string;
  }) => {
    const source = chapter.contentFormat === 'rich'
      ? `${chapter.index}\u0000${chapter.title}\u0000${chapter.plainText}\u0000${chapter.contentFormat}\u0000${chapter.contentVersion}\u0000${JSON.stringify(chapter.richBlocks)}`
      : `${chapter.index}\u0000${chapter.title}\u0000${chapter.plainText}\u0000${chapter.contentFormat}\u0000${chapter.contentVersion}`;
    let hashA = 0x811c9dc5;
    let hashB = 0x01000193;
    const UINT32_MOD = 0x1_0000_0000;

    const normalizeUint32 = (value: number) => {
      const normalized = value % UINT32_MOD;
      return normalized >= 0 ? normalized : normalized + UINT32_MOD;
    };

    for (let index = 0; index < source.length; index += 1) {
      const value = source.charCodeAt(index);
      hashA = normalizeUint32(Math.imul(hashA, 0x01000193) + value);
      hashB = normalizeUint32(Math.imul(hashB, 0x27d4eb2d) + value);
    }

    return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
  };
  const resolveLayoutFeatureSet = (params: {
    chapter: {
      contentFormat: 'plain' | 'rich';
      richBlocks: unknown[];
    };
    preferRichScrollRendering?: boolean;
    variantFamily: 'original-paged' | 'original-scroll' | 'summary-shell';
  }) => {
    if (params.variantFamily === 'summary-shell') {
      return 'summary-shell';
    }

    if (params.variantFamily === 'original-paged') {
      return 'paged-pagination-block';
    }

    return params.chapter.contentFormat === 'rich'
      && params.chapter.richBlocks.length > 0
      && params.preferRichScrollRendering !== false
      ? 'scroll-rich-inline'
      : 'scroll-plain';
  };
  const buildKey = (params: {
    chapterIndex: number;
    contentFormat: 'plain' | 'rich';
    contentHash: string;
    contentVersion: number;
    layoutFeatureSet: string;
    layoutKey: string;
    novelId: number;
    rendererVersion: number;
    variantFamily: string;
  }) => (
    `${params.novelId}:${params.chapterIndex}:${params.variantFamily}:${params.contentFormat}:${params.contentVersion}:${params.rendererVersion}:${params.layoutFeatureSet}:${params.layoutKey}:${params.contentHash}`
  );

  return {
    READER_RENDERER_VERSION,
    reset() {
      memory.clear();
    },
    buildStaticRenderManifest: vi.fn((params: {
      chapter: {
        contentFormat: 'plain' | 'rich';
        contentVersion: number;
        index: number;
        plainText: string;
        richBlocks: unknown[];
        title: string;
      };
      layoutKey: string;
      layoutSignature: object;
      novelId: number;
      preferRichScrollRendering?: boolean;
      variantFamily: 'original-paged' | 'original-scroll' | 'summary-shell';
    }) => {
      const contentHash = createContentHash(params.chapter);
      const layoutFeatureSet = resolveLayoutFeatureSet({
        chapter: params.chapter,
        preferRichScrollRendering: params.preferRichScrollRendering,
        variantFamily: params.variantFamily,
      });

      return {
        chapterIndex: params.chapter.index,
        contentFormat: params.chapter.contentFormat,
        contentHash,
        contentVersion: params.chapter.contentVersion,
        layoutFeatureSet,
        layoutKey: params.layoutKey,
        layoutSignature: params.layoutSignature,
        novelId: params.novelId,
        queryManifest: { pageCount: 2 },
        rendererVersion: READER_RENDERER_VERSION,
        storageKind: 'manifest',
        tree: null,
        updatedAt: '2026-04-01T00:00:00.000Z',
        variantFamily: params.variantFamily,
      };
    }),
    buildStaticRenderTree: vi.fn((params: {
      chapter: {
        contentFormat: 'plain' | 'rich';
        contentVersion: number;
        index: number;
        plainText: string;
        richBlocks: unknown[];
        title: string;
      };
      layoutKey: string;
      layoutSignature: object;
      novelId: number;
      preferRichScrollRendering?: boolean;
      variantFamily: 'original-paged' | 'original-scroll' | 'summary-shell';
    }) => {
      const contentHash = createContentHash(params.chapter);
      const layoutFeatureSet = resolveLayoutFeatureSet({
        chapter: params.chapter,
        preferRichScrollRendering: params.preferRichScrollRendering,
        variantFamily: params.variantFamily,
      });

      return {
        chapterIndex: params.chapter.index,
        contentFormat: params.chapter.contentFormat,
        contentHash,
        contentVersion: params.chapter.contentVersion,
        layoutFeatureSet,
        layoutKey: params.layoutKey,
        layoutSignature: params.layoutSignature,
        novelId: params.novelId,
        queryManifest: {},
        rendererVersion: READER_RENDERER_VERSION,
        storageKind: 'render-tree',
        tree: {
          chapterIndex: params.chapter.index,
          title: params.chapter.title,
          variantFamily: params.variantFamily,
        },
        updatedAt: '2026-04-01T00:00:00.000Z',
        variantFamily: params.variantFamily,
      };
    }),
    getReaderRenderCacheEntryFromMemory: vi.fn((params: {
      chapterIndex: number;
      contentFormat: 'plain' | 'rich';
      contentHash: string;
      contentVersion: number;
      layoutFeatureSet: string;
      layoutKey: string;
      novelId: number;
      rendererVersion: number;
      variantFamily: string;
    }) => memory.get(buildKey(params)) ?? null),
    getReaderRenderCacheRecordFromDexie: vi.fn().mockResolvedValue(null),
    isMaterializedReaderRenderCacheEntry: vi.fn(
      (entry: { storageKind?: string; tree?: unknown } | null | undefined) => (
        entry?.storageKind === 'render-tree' && Boolean(entry.tree)
      ),
    ),
    persistReaderRenderCacheEntry: vi.fn().mockResolvedValue(undefined),
    resolveReaderLayoutFeatureSet: vi.fn(resolveLayoutFeatureSet),
    primeReaderRenderCacheEntry: vi.fn((entry: {
      chapterIndex: number;
      contentFormat: 'plain' | 'rich';
      contentHash: string;
      contentVersion: number;
      layoutFeatureSet: string;
      layoutKey: string;
      novelId: number;
      rendererVersion: number;
      variantFamily: string;
    }) => {
      memory.set(buildKey(entry), entry);
      return entry;
    }),
    warmReaderRenderImages: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@shared/debug', () => ({
  debugLog: debugLogMock,
}));

vi.mock('@domains/reader-media', () => imageCacheMock);
vi.mock('../../utils/render-cache/readerRenderCache', () => renderCacheMock);

import type { ChapterContent } from '@shared/contracts/reader';
import type { ReaderLayoutSignature } from '../../utils/layout/readerLayout';
import { useReaderRenderPreheater } from '../useReaderRenderPreheater';

function createChapter(index: number, totalChapters: number): ChapterContent {
  return {
    index,
    title: `Chapter ${index + 1}`,
    plainText: `Content for chapter ${index + 1}`,
    richBlocks: [],
    contentFormat: 'plain',
    contentVersion: 1,
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
  const { Wrapper } = createReaderContextWrapper();

  const renderResult = renderHook(() => useReaderRenderPreheater({
    currentChapterIndex: 0,
    fetchChapterContent,
    loadedChaptersRef,
    novelId: options?.novelId ?? 1,
    onMaterializedEntry,
    preheatTargets,
    preferRichScrollRendering: true,
    readerTelemetryEnabled: options?.readerTelemetryEnabled ?? false,
    typography,
    variantSignatures,
  }), {
    wrapper: Wrapper,
  });

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
      contentFormat: 'plain' as const,
      contentHash: '7df65d4673d7f45e',
      contentVersion: 1,
      layoutFeatureSet: 'paged-pagination-block' as const,
      layoutKey: 'cached-layout',
      layoutSignature: createVariantSignatures()['original-paged'],
      novelId: 1,
      queryManifest: {},
      rendererVersion: 2,
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
      contentFormat: 'plain' as const,
      contentHash: '7df65d4673d7f45e',
      contentVersion: 1,
      layoutFeatureSet: 'paged-pagination-block' as const,
      layoutKey: 'manifest-layout',
      layoutSignature: createVariantSignatures()['original-paged'],
      novelId: 1,
      queryManifest: { pageCount: 2 },
      rendererVersion: 2,
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
      expect.objectContaining({
        getImageBlob: expect.any(Function),
      }),
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
