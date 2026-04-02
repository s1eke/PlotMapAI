import type { ReactNode } from 'react';
import type { Chapter, ChapterContent } from '../../readerContentService';
import type { ReaderContextValue } from '../../pages/reader-page/ReaderContext';
import type { ChapterChangeSource } from '../navigationTypes';
import type { PageTarget, ReaderMode } from '../useReaderStatePersistence';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReaderContextProvider } from '../../pages/reader-page/ReaderContext';
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

function createReaderContextValue(
  overrides: Partial<ReaderContextValue> = {},
): ReaderContextValue {
  const mode = overrides.mode ?? 'scroll';
  const setChapterIndex = overrides.setChapterIndex ?? vi.fn();
  const setMode = overrides.setMode ?? vi.fn();

  return {
    novelId: 1,
    chapterIndex: overrides.chapterIndex ?? 0,
    mode,
    viewMode: overrides.viewMode ?? (mode === 'summary' ? 'summary' : 'original'),
    isPagedMode: overrides.isPagedMode ?? mode === 'paged',
    setChapterIndex,
    setMode,
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
    chapterChangeSourceRef: { current: null as ChapterChangeSource },
    pagedStateRef: { current: { pageCount: 1, pageIndex: 0 } },
    restoreSettledHandlerRef: { current: vi.fn() },
    isScrollSyncSuppressedRef: { current: false },
    suppressScrollSyncTemporarilyRef: { current: vi.fn() },
    getCurrentAnchorRef: { current: () => null },
    handleScrollModeScrollRef: { current: vi.fn() },
    readingAnchorHandlerRef: { current: vi.fn() },
    getCurrentOriginalLocatorRef: { current: () => null },
    getCurrentPagedLocatorRef: { current: () => null },
    resolveScrollLocatorOffsetRef: { current: () => null },
    ...overrides,
  };
}

function setupHook({
  contextOverrides,
  hookOverrides,
}: {
  contextOverrides?: Partial<ReaderContextValue>;
  hookOverrides?: Partial<Parameters<typeof useReaderNavigation>[0]>;
} = {}) {
  const setChapterIndex = vi.fn();
  const persistReaderState = vi.fn();
  const pageTargetRef = { current: null as PageTarget | null };
  const hasUserInteractedRef = { current: false };
  const chapterChangeSourceRef = { current: null as ChapterChangeSource };
  const beforeChapterChange = vi.fn();
  const pagedNavigation = createPagedNavigation();
  const mode = contextOverrides?.mode ?? 'scroll';
  const chapterIndex = contextOverrides?.chapterIndex ?? 0;
  const contextValue = createReaderContextValue({
    chapterIndex,
    mode,
    setChapterIndex,
    persistReaderState,
    pageTargetRef,
    hasUserInteractedRef,
    chapterChangeSourceRef,
    ...contextOverrides,
  });

  const { result, rerender } = renderHook(
    (props: Parameters<typeof useReaderNavigation>[0]) => useReaderNavigation(props),
    {
      initialProps: {
        chapters,
        currentChapter: makeChapter({ index: chapterIndex }),
        pagedNavigation,
        beforeChapterChange,
        ...hookOverrides,
      },
      wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
        value: contextValue,
        children,
      }),
    },
  );

  return {
    result,
    rerender,
    setChapterIndex,
    persistReaderState,
    pageTargetRef,
    hasUserInteractedRef,
    chapterChangeSourceRef,
    beforeChapterChange,
    pagedNavigation,
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
      contextOverrides: { mode: 'scroll' as ReaderMode },
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
      contextOverrides: {
        chapterIndex: 1,
        mode: 'summary' as ReaderMode,
      },
      hookOverrides: {
        currentChapter: makeChapter({ index: 1, hasPrev: true, hasNext: true }),
      },
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
      contextOverrides: {
        chapterIndex: 0,
        mode: 'scroll' as ReaderMode,
      },
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
      contextOverrides: {
        chapterIndex: 0,
        mode: 'scroll' as ReaderMode,
      },
      hookOverrides: {
        currentChapter: makeChapter({ hasPrev: true, hasNext: false }),
      },
    });

    expect(result.current.toolbarHasPrev).toBe(true);
    expect(result.current.toolbarHasNext).toBe(true);
  });

  it('delegates to the paged controller contract in paged mode', () => {
    const { result, pagedNavigation } = setupHook({
      contextOverrides: { mode: 'paged' as ReaderMode },
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
