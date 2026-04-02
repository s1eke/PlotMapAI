import type { ReactNode } from 'react';
import type { ChapterContent } from '../../readerContentService';
import type { ReaderContextValue } from '../../pages/reader-page/ReaderContext';
import type { ChapterChangeSource } from '../navigationTypes';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { readerContentService } from '../../readerContentService';
import { ReaderContextProvider } from '../../pages/reader-page/ReaderContext';
import { useReaderChapterData } from '../useReaderChapterData';

vi.mock('../../readerContentService', () => ({
  readerContentService: {
    getChapterContent: vi.fn(),
    getChapters: vi.fn(),
  },
}));

function makeContainer(): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: 240,
  });
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: 36,
  });
  return element;
}

function createChapter(index: number, totalChapters: number): ChapterContent {
  return {
    index,
    title: `Chapter ${index + 1}`,
    content: `Content ${index + 1}`,
    wordCount: 120,
    totalChapters,
    hasPrev: index > 0,
    hasNext: index < totalChapters - 1,
  };
}

function createReaderContextValue(
  overrides: Partial<ReaderContextValue> = {},
): ReaderContextValue {
  const mode = overrides.mode ?? 'scroll';

  return {
    novelId: 1,
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
    loadPersistedReaderState: overrides.loadPersistedReaderState ?? vi.fn(async () => ({
      chapterIndex: 0,
      mode: 'scroll',
    })),
    contentRef: overrides.contentRef ?? { current: makeContainer() },
    pagedViewportRef: overrides.pagedViewportRef ?? { current: null },
    pageTargetRef: overrides.pageTargetRef ?? { current: null },
    wheelDeltaRef: overrides.wheelDeltaRef ?? { current: 0 },
    pageTurnLockedRef: overrides.pageTurnLockedRef ?? { current: false },
    chapterCacheRef: overrides.chapterCacheRef ?? { current: new Map() },
    scrollChapterElementsBridgeRef: { current: new Map() },
    scrollChapterBodyElementsBridgeRef: { current: new Map() },
    chapterChangeSourceRef: overrides.chapterChangeSourceRef ?? {
      current: null as ChapterChangeSource,
    },
    pagedStateRef: { current: { pageCount: 1, pageIndex: 0 } },
    restoreSettledHandlerRef: { current: vi.fn() },
    isScrollSyncSuppressedRef: { current: false },
    suppressScrollSyncTemporarilyRef: overrides.suppressScrollSyncTemporarilyRef ?? {
      current: vi.fn(),
    },
    getCurrentAnchorRef: { current: () => null },
    handleScrollModeScrollRef: { current: vi.fn() },
    readingAnchorHandlerRef: { current: vi.fn() },
    getCurrentOriginalLocatorRef: { current: () => null },
    getCurrentPagedLocatorRef: { current: () => null },
    resolveScrollLocatorOffsetRef: { current: () => null },
    ...overrides,
  };
}

describe('useReaderChapterData', () => {
  it('keeps the navigation source in scroll mode until restore can consume the target', async () => {
    const chapters = [
      { index: 0, title: 'Chapter 1', wordCount: 100 },
      { index: 1, title: 'Chapter 2', wordCount: 100 },
      { index: 2, title: 'Chapter 3', wordCount: 100 },
    ];
    const targetChapter = createChapter(2, chapters.length);
    const contentRef = { current: makeContainer() };
    const chapterChangeSourceRef = {
      current: null as ChapterChangeSource,
    };
    const suppressScrollSyncTemporarily = vi.fn();
    const pageTargetRef = { current: 'start' as const };

    vi.mocked(readerContentService.getChapters).mockResolvedValue(chapters);
    vi.mocked(readerContentService.getChapterContent).mockResolvedValue(targetChapter);

    const contextValue = createReaderContextValue({
      contentRef,
      chapterChangeSourceRef,
      pageTargetRef,
      suppressScrollSyncTemporarilyRef: {
        current: suppressScrollSyncTemporarily,
      },
    });

    const { result } = renderHook(
      () => useReaderChapterData({}),
      {
        wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
          value: contextValue,
          children,
        }),
      },
    );

    await act(async () => {
      await result.current.hydrateReaderData();
    });

    chapterChangeSourceRef.current = 'navigation';

    let loadResult: Awaited<ReturnType<typeof result.current.loadActiveChapter>> | null = null;
    await act(async () => {
      loadResult = await result.current.loadActiveChapter({
        chapterIndex: 2,
        mode: 'scroll',
      });
    });

    expect(loadResult).toMatchObject({
      navigationRestoreTarget: {
        chapterIndex: 2,
        locatorBoundary: 'start',
        mode: 'scroll',
      },
    });
    expect(chapterChangeSourceRef.current).toBe('navigation');
    expect(suppressScrollSyncTemporarily).toHaveBeenCalledTimes(1);
    expect(contentRef.current.scrollTop).toBe(0);
    expect(contentRef.current.scrollLeft).toBe(0);
  });
});
