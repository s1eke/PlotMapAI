import type { ChapterChangeSource, PageTarget } from '@shared/contracts/reader';

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReaderContextWrapper } from '@test/readerRuntimeTestUtils';

import { readerContentService } from '../../readerContentService';
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

function createChapter(index: number, totalChapters: number) {
  return {
    index,
    title: `Chapter ${index + 1}`,
    plainText: `Content ${index + 1}`,
    richBlocks: [{
      type: 'paragraph',
      children: [{
        type: 'text',
        text: `Content ${index + 1}`,
      }],
    }],
    contentFormat: 'plain' as const,
    contentVersion: 1,
    wordCount: 120,
    totalChapters,
    hasPrev: index > 0,
    hasNext: index < totalChapters - 1,
  };
}

describe('useReaderChapterData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caches fetched chapter content with rich metadata intact', async () => {
    const chapter = createChapter(0, 2);
    const { Wrapper } = createReaderContextWrapper();

    vi.mocked(readerContentService.getChapterContent).mockResolvedValue(chapter);

    const { result } = renderHook(() => useReaderChapterData({
      novelId: 1,
      onChapterContentResolved: vi.fn(),
      sessionCommands: {
        hasUserInteractedRef: { current: false },
        latestReaderStateRef: { current: {} },
        loadPersistedReaderState: vi.fn(),
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        mode: 'scroll',
      },
    }), {
      wrapper: Wrapper,
    });

    let firstResult: Awaited<ReturnType<typeof result.current.fetchChapterContent>> | null = null;
    let secondResult: Awaited<ReturnType<typeof result.current.fetchChapterContent>> | null = null;

    await act(async () => {
      firstResult = await result.current.fetchChapterContent(0);
      secondResult = await result.current.fetchChapterContent(0);
    });

    expect(firstResult).toEqual(chapter);
    expect(secondResult).toEqual(chapter);
    expect(result.current.cache.getCachedChapter(0)).toEqual(chapter);
    expect(result.current.cache.getCachedChapter(0)).toMatchObject({
      contentFormat: 'plain',
      contentVersion: 1,
      richBlocks: [{
        type: 'paragraph',
        children: [{
          type: 'text',
          text: 'Content 1',
        }],
      }],
    });
    expect(readerContentService.getChapterContent).toHaveBeenCalledTimes(1);
    expect(readerContentService.getChapterContent).toHaveBeenCalledWith(1, 0, {
      onProgress: expect.any(Function),
      signal: undefined,
    });
  });

  it('keeps the navigation source in scroll mode until restore can consume the target', async () => {
    const chapters = [
      { index: 0, title: 'Chapter 1', wordCount: 100 },
      { index: 1, title: 'Chapter 2', wordCount: 100 },
      { index: 2, title: 'Chapter 3', wordCount: 100 },
    ];
    const targetChapter = createChapter(2, chapters.length);
    const contentRef = { current: makeContainer() };
    let chapterChangeSource: ChapterChangeSource = null;
    let pendingPageTarget: PageTarget | null = 'start';
    const suppressScrollSyncTemporarily = vi.fn();
    const { Wrapper } = createReaderContextWrapper({
      contentRef,
      getChapterChangeSource: () => chapterChangeSource,
      getPendingPageTarget: () => pendingPageTarget,
      setChapterChangeSource: (nextSource) => {
        chapterChangeSource = nextSource;
      },
      setPendingPageTarget: (nextTarget) => {
        pendingPageTarget = nextTarget;
      },
      suppressScrollSyncTemporarily,
    });

    vi.mocked(readerContentService.getChapters).mockResolvedValue(chapters);
    vi.mocked(readerContentService.getChapterContent).mockResolvedValue(targetChapter);

    const { result } = renderHook(() => useReaderChapterData({
      novelId: 1,
      onChapterContentResolved: vi.fn(),
      sessionCommands: {
        hasUserInteractedRef: { current: false },
        latestReaderStateRef: { current: {} },
        loadPersistedReaderState: vi.fn(async () => ({
          chapterIndex: 0,
          mode: 'scroll',
        })),
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        mode: 'scroll',
      },
    }), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.hydrateReaderData();
    });

    chapterChangeSource = 'navigation';

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
    expect(chapterChangeSource).toBe('navigation');
    expect(suppressScrollSyncTemporarily).toHaveBeenCalledTimes(1);
    expect(contentRef.current.scrollTop).toBe(0);
    expect(contentRef.current.scrollLeft).toBe(0);
  });
});
