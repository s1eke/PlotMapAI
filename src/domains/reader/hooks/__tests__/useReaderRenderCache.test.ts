import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const debugLogMock = vi.hoisted(() => vi.fn());

const imageCacheMock = vi.hoisted(() => ({
  peekReaderImageDimensions: vi.fn().mockReturnValue(undefined),
  preloadReaderImageResources: vi.fn().mockResolvedValue(undefined),
}));

const renderCacheMock = vi.hoisted(() => {
  const memory = new Map<string, unknown>();
  const buildKey = (params: {
    chapterIndex: number;
    novelId: number;
    variantFamily: string;
  }) => `${params.novelId}:${params.chapterIndex}:${params.variantFamily}`;

  return {
    reset() {
      memory.clear();
    },
    buildReaderRenderCacheKey: vi.fn(buildKey),
    buildStaticRenderTree: vi.fn((params: {
      chapter: { index: number; title: string };
      layoutSignature: object;
      novelId: number;
      variantFamily: 'original-paged' | 'original-scroll' | 'summary-shell';
    }) => {
      const tree = params.variantFamily === 'original-paged'
        ? {
            chapterIndex: params.chapter.index,
            columnCount: 1,
            columnGap: 0,
            columnWidth: 400,
            pageHeight: 400,
            pageSlices: [],
          }
        : params.variantFamily === 'original-scroll'
          ? {
              blockCount: 0,
              chapterIndex: params.chapter.index,
              metrics: [],
              textWidth: 400,
              totalHeight: 0,
            }
          : {
              chapterIndex: params.chapter.index,
              title: params.chapter.title,
              variant: 'summary-shell',
            };

      return {
        chapterIndex: params.chapter.index,
        contentHash: `hash:${params.chapter.index}`,
        layoutKey: `${params.variantFamily}:${params.novelId}`,
        layoutSignature: params.layoutSignature,
        novelId: params.novelId,
        queryManifest: {},
        tree,
        updatedAt: '2026-03-31T00:00:00.000Z',
        variantFamily: params.variantFamily,
      };
    }),
    clearReaderRenderCacheMemoryForNovel: vi.fn((novelId: number) => {
      for (const key of Array.from(memory.keys())) {
        if (String(key).startsWith(`${novelId}:`)) {
          memory.delete(key);
        }
      }
    }),
    coercePagedTree: vi.fn((entry: { tree: unknown; variantFamily: string } | null | undefined) => (
      entry?.variantFamily === 'original-paged' ? entry.tree : null
    )),
    coerceScrollTree: vi.fn((entry: { tree: unknown; variantFamily: string } | null | undefined) => (
      entry?.variantFamily === 'original-scroll' ? entry.tree : null
    )),
    coerceSummaryShellTree: vi.fn((entry: { tree: unknown; variantFamily: string } | null | undefined) => (
      entry?.variantFamily === 'summary-shell' ? entry.tree : null
    )),
    getReaderRenderCacheEntryFromDexie: vi.fn().mockResolvedValue(null),
    getReaderRenderCacheEntryFromMemory: vi.fn((params: {
      chapterIndex: number;
      novelId: number;
      variantFamily: string;
    }) => memory.get(buildKey(params)) ?? null),
    persistReaderRenderCacheEntry: vi.fn().mockResolvedValue(undefined),
    primeReaderRenderCacheEntry: vi.fn((entry: {
      chapterIndex: number;
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

import type { Chapter, ChapterContent } from '../../api/readerApi';
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

function createViewport(width: number = 600, height: number = 800): HTMLDivElement {
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

function renderReaderRenderCacheHook(options?: {
  chapters?: Chapter[];
  currentChapter?: ChapterContent | null;
  fetchChapterContent?: (index: number, options?: { signal?: AbortSignal }) => Promise<ChapterContent>;
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
  const fetchChapterContent = options?.fetchChapterContent ?? (async (index: number) => createChapter(index, chapters.length));

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
    imageCacheMock.peekReaderImageDimensions.mockReturnValue(undefined);
    imageCacheMock.preloadReaderImageResources.mockResolvedValue(undefined);
    renderCacheMock.reset();
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
});
