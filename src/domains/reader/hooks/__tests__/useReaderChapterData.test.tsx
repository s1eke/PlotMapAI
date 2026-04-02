import type { ChapterChangeSource } from '../navigationTypes';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
    content: `Content ${index + 1}`,
    wordCount: 120,
    totalChapters,
    hasPrev: index > 0,
    hasNext: index < totalChapters - 1,
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
      uiBridge: {
        chapterCacheRef: { current: new Map() },
        chapterChangeSourceRef,
        contentRef,
        pageTargetRef,
        pagedViewportRef: { current: null },
        pageTurnLockedRef: { current: false },
        suppressScrollSyncTemporarilyRef: {
          current: suppressScrollSyncTemporarily,
        },
        wheelDeltaRef: { current: 0 },
      },
    }));

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
