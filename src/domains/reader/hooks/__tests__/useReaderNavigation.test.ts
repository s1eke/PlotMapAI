import type { Chapter, ChapterContent } from '../../readerContentService';
import type { ChapterChangeSource } from '../navigationTypes';
import type { PageTarget, ReaderMode } from '../useReaderStatePersistence';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useReaderNavigation } from '../useReaderNavigation';

const chapters: Chapter[] = [
  { index: 0, title: 'Ch 1', wordCount: 100 },
  { index: 1, title: 'Ch 2', wordCount: 200 },
  { index: 2, title: 'Ch 3', wordCount: 150 },
];

function makeChapter(overrides: Partial<ChapterContent> = {}): ChapterContent {
  return {
    index: 0,
    title: 'Ch',
    content: 'text',
    wordCount: 100,
    totalChapters: 3,
    hasPrev: false,
    hasNext: true,
    ...overrides,
  };
}

function createPagedNavigation() {
  return {
    goToChapter: vi.fn(),
    goToNextPage: vi.fn(),
    goToPrevPage: vi.fn(),
    goToNextPageSilently: vi.fn(),
    goToPrevPageSilently: vi.fn(),
    handleNext: vi.fn(),
    handlePrev: vi.fn(),
    toolbarHasPrev: true,
    toolbarHasNext: false,
    pageTurnDirection: 'prev' as const,
    pageTurnToken: 7,
  };
}

function setupHook({
  chapterIndex = 0,
  currentChapter = makeChapter({ index: chapterIndex }),
  hookOverrides,
  mode = 'scroll' as ReaderMode,
}: {
  chapterIndex?: number;
  currentChapter?: ChapterContent | null;
  hookOverrides?: Partial<Parameters<typeof useReaderNavigation>[0]>;
  mode?: ReaderMode;
} = {}) {
  const setChapterIndex = vi.fn();
  const persistReaderState = vi.fn();
  const pageTargetRef = { current: null as PageTarget | null };
  const hasUserInteractedRef = { current: false };
  const chapterChangeSourceRef = { current: null as ChapterChangeSource };
  const beforeChapterChange = vi.fn();
  const pagedNavigation = createPagedNavigation();

  const { result, rerender } = renderHook(
    (props: Parameters<typeof useReaderNavigation>[0]) => useReaderNavigation(props),
    {
      initialProps: {
        beforeChapterChange,
        chapters,
        currentChapter,
        pagedNavigation,
        sessionCommands: {
          hasUserInteractedRef,
          persistReaderState,
          setChapterIndex,
        },
        sessionSnapshot: {
          chapterIndex,
          mode,
        },
        uiBridge: {
          chapterChangeSourceRef,
          pageTargetRef,
        },
        ...hookOverrides,
      },
    },
  );

  return {
    beforeChapterChange,
    chapterChangeSourceRef,
    hasUserInteractedRef,
    pageTargetRef,
    pagedNavigation,
    persistReaderState,
    rerender,
    result,
    setChapterIndex,
  };
}

describe('useReaderNavigation', () => {
  it('navigates by chapter in non-paged modes and persists the target position', () => {
    const {
      result,
      setChapterIndex,
      persistReaderState,
      pageTargetRef,
      hasUserInteractedRef,
      chapterChangeSourceRef,
      beforeChapterChange,
    } = setupHook({
      mode: 'scroll',
    });

    act(() => {
      result.current.goToChapter(2, 'end');
    });

    expect(beforeChapterChange).toHaveBeenCalled();
    expect(hasUserInteractedRef.current).toBe(true);
    expect(chapterChangeSourceRef.current).toBe('navigation');
    expect(pageTargetRef.current).toBe('end');
    expect(setChapterIndex).toHaveBeenCalledWith(2);
    expect(persistReaderState).toHaveBeenCalledWith({
      chapterIndex: 2,
      mode: 'scroll',
    });
  });

  it('uses simple chapter stepping for next and previous navigation in non-paged modes', () => {
    const { result, setChapterIndex } = setupHook({
      chapterIndex: 1,
      currentChapter: makeChapter({ index: 1, hasPrev: true, hasNext: true }),
      mode: 'summary',
    });

    act(() => {
      result.current.goToNextPage();
      result.current.goToPrevPage();
    });

    expect(setChapterIndex).toHaveBeenNthCalledWith(1, 2);
    expect(setChapterIndex).toHaveBeenNthCalledWith(2, 0);
    expect(result.current.pageTurnDirection).toBe('next');
    expect(result.current.pageTurnToken).toBe(0);
  });

  it('does not navigate to an out-of-range chapter', () => {
    const { result, setChapterIndex, persistReaderState } = setupHook({
      chapterIndex: 0,
      mode: 'scroll',
    });

    act(() => {
      result.current.goToChapter(-1);
      result.current.goToChapter(99);
    });

    expect(setChapterIndex).not.toHaveBeenCalled();
    expect(persistReaderState).not.toHaveBeenCalled();
  });

  it('combines chapter bounds with current chapter flags for toolbar state in non-paged modes', () => {
    const { result } = setupHook({
      chapterIndex: 0,
      currentChapter: makeChapter({ index: 0, hasPrev: false, hasNext: true }),
      mode: 'scroll',
    });

    expect(result.current.toolbarHasPrev).toBe(false);
    expect(result.current.toolbarHasNext).toBe(true);
  });

  it('delegates fully to paged navigation while in paged mode', () => {
    const { result, pagedNavigation } = setupHook({
      chapterIndex: 1,
      mode: 'paged',
    });

    expect(result.current.goToChapter).toBe(pagedNavigation.goToChapter);
    expect(result.current.goToNextPage).toBe(pagedNavigation.goToNextPage);
    expect(result.current.goToPrevPage).toBe(pagedNavigation.goToPrevPage);
    expect(result.current.goToNextPageSilently).toBe(pagedNavigation.goToNextPageSilently);
    expect(result.current.goToPrevPageSilently).toBe(pagedNavigation.goToPrevPageSilently);
    expect(result.current.handleNext).toBe(pagedNavigation.handleNext);
    expect(result.current.handlePrev).toBe(pagedNavigation.handlePrev);
    expect(result.current.toolbarHasPrev).toBe(true);
    expect(result.current.toolbarHasNext).toBe(false);
    expect(result.current.pageTurnDirection).toBe('prev');
    expect(result.current.pageTurnToken).toBe(7);
  });
});
