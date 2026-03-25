import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReaderRestoreFlow } from '../useReaderRestoreFlow';
import type { ScrollModeAnchor } from '../useScrollModeChapters';
import type { StoredReaderState } from '../useReaderStatePersistence';
import { resetReaderSessionStoreForTests } from '../sessionStore';

function makeContainer({
  scrollTop = 0,
  scrollHeight = 1000,
  clientHeight = 500,
}: {
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
} = {}): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  });
  return element;
}

function createStoredState(overrides: StoredReaderState = {}): StoredReaderState {
  return {
    chapterIndex: 5,
    viewMode: 'original',
    isTwoColumn: false,
    chapterProgress: 0.4,
    ...overrides,
  };
}

describe('useReaderRestoreFlow', () => {
  beforeEach(() => {
    resetReaderSessionStoreForTests();
  });

  it('restores the last original reading position when switching back from summary view', () => {
    const persistReaderState = vi.fn();
    const markUserInteracted = vi.fn();
    const setChapterIndex = vi.fn();
    const setViewMode = vi.fn();
    const setIsTwoColumn = vi.fn();
    const latestReaderStateRef = { current: createStoredState() };
    const contentRef = { current: makeContainer() };
    const getCurrentAnchorRef = {
      current: () => ({ chapterIndex: 5, chapterProgress: 0.4 } satisfies ScrollModeAnchor),
    };

    const { result, rerender } = renderHook((viewMode: 'original' | 'summary') => useReaderRestoreFlow({
      novelId: 1,
      chapterIndex: 5,
      setChapterIndex,
      viewMode,
      setViewMode,
      isTwoColumn: false,
      setIsTwoColumn,
      isPagedMode: false,
      pageIndex: 0,
      pageCount: 1,
      currentChapter: {
        index: 5,
        title: 'Chapter 6',
        content: 'content',
        wordCount: 100,
        totalChapters: 10,
        hasPrev: true,
        hasNext: true,
      },
      isLoading: false,
      scrollModeChapters: [4, 5, 6],
      contentRef,
      scrollChapterElementsRef: { current: new Map() },
      latestReaderStateRef,
      hasHydratedReaderState: true,
      markUserInteracted,
      persistReaderState,
      getCurrentAnchorRef,
      handleScrollModeScrollRef: { current: vi.fn() },
      readingAnchorHandlerRef: { current: vi.fn() },
      summaryRestoreSignal: null,
      isChapterAnalysisLoading: false,
    }), {
      initialProps: 'original',
    });

    act(() => {
      result.current.handleSetViewMode('summary');
    });

    contentRef.current = makeContainer({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 });

    rerender('summary');

    act(() => {
      result.current.handleSetViewMode('original');
    });

    expect(result.current.pendingRestoreStateRef.current).toMatchObject({
      chapterIndex: 5,
      viewMode: 'original',
      chapterProgress: 0.4,
    });
    expect(markUserInteracted).toHaveBeenCalledTimes(2);
    expect(setChapterIndex).toHaveBeenLastCalledWith(5);
    expect(setViewMode).toHaveBeenLastCalledWith('original');
  });
});
