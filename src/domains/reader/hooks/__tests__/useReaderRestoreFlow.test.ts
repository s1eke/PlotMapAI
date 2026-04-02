import type { ReactNode } from 'react';
import type { ReaderContextValue } from '../../pages/reader-page/ReaderContext';
import type { ChapterChangeSource } from '../navigationTypes';
import type { ScrollModeAnchor } from '../useScrollModeChapters';
import type {
  ReaderRestoreTarget,
  StoredReaderState,
} from '../useReaderStatePersistence';

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ReaderContextProvider,
} from '../../pages/reader-page/ReaderContext';
import {
  getReaderSessionSnapshot,
  resetReaderSessionStoreForTests,
} from '../sessionStore';
import { useReaderRestoreFlow } from '../useReaderRestoreFlow';

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
    mode: 'scroll',
    chapterProgress: 0.4,
    lastContentMode: 'scroll',
    locator: undefined,
    ...overrides,
  };
}

function createRestoreTarget(
  overrides: Partial<ReaderRestoreTarget> = {},
): ReaderRestoreTarget {
  return {
    chapterIndex: 5,
    mode: 'scroll',
    chapterProgress: 0.4,
    locator: undefined,
    ...overrides,
  };
}

function createReaderContextValue(
  overrides: Partial<ReaderContextValue> = {},
): ReaderContextValue {
  const mode = overrides.mode ?? 'scroll';

  return {
    novelId: 1,
    chapterIndex: overrides.chapterIndex ?? 5,
    mode,
    viewMode: overrides.viewMode ?? (mode === 'summary' ? 'summary' : 'original'),
    isPagedMode: overrides.isPagedMode ?? mode === 'paged',
    setChapterIndex: overrides.setChapterIndex ?? vi.fn(),
    setMode: overrides.setMode ?? vi.fn(),
    latestReaderStateRef: { current: createStoredState() },
    hasUserInteractedRef: { current: false },
    markUserInteracted: vi.fn(),
    persistReaderState: vi.fn(),
    loadPersistedReaderState: vi.fn(async () => createStoredState()),
    contentRef: { current: makeContainer() },
    pagedViewportRef: { current: null },
    pageTargetRef: { current: null },
    wheelDeltaRef: { current: 0 },
    pageTurnLockedRef: { current: false },
    chapterCacheRef: { current: new Map() },
    scrollChapterElementsBridgeRef: { current: new Map() },
    scrollChapterBodyElementsBridgeRef: { current: new Map() },
    chapterChangeSourceRef: { current: null as ChapterChangeSource },
    pagedStateRef: { current: { pageIndex: 0, pageCount: 1 } },
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

function createCurrentChapter(index = 5) {
  return {
    index,
    title: `Chapter ${index + 1}`,
    content: 'content',
    wordCount: 100,
    totalChapters: 10,
    hasPrev: true,
    hasNext: true,
  };
}

function createLocator(overrides: Partial<NonNullable<StoredReaderState['locator']>> = {}) {
  return {
    chapterIndex: 5,
    blockIndex: 2,
    kind: 'text' as const,
    lineIndex: 0,
    ...overrides,
  };
}

describe('useReaderRestoreFlow', () => {
  beforeEach(() => {
    resetReaderSessionStoreForTests();
  });

  it('reuses the shared restorable-position semantics for non-forced pending restore targets', () => {
    const contextValue = createReaderContextValue();

    const { result } = renderHook(() => useReaderRestoreFlow({
      currentChapter: createCurrentChapter(),
      summaryRestoreSignal: null,
      isChapterAnalysisLoading: false,
    }), {
      wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
        value: contextValue,
        children,
      }),
    });

    act(() => {
      result.current.setPendingRestoreTarget(createRestoreTarget({
        chapterProgress: 0,
        locator: undefined,
      }));
    });

    expect(getReaderSessionSnapshot().pendingRestoreTarget).toBeNull();

    act(() => {
      result.current.setPendingRestoreTarget(createRestoreTarget({
        chapterProgress: 0.4,
      }));
    });

    expect(getReaderSessionSnapshot().pendingRestoreTarget).toMatchObject({
      chapterIndex: 5,
      chapterProgress: 0.4,
      mode: 'scroll',
    });
  });

  it('keeps forced chapter-start restore targets so navigation restore still runs', () => {
    const contextValue = createReaderContextValue();

    const { result } = renderHook(() => useReaderRestoreFlow({
      currentChapter: createCurrentChapter(),
      summaryRestoreSignal: null,
      isChapterAnalysisLoading: false,
    }), {
      wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
        value: contextValue,
        children,
      }),
    });

    act(() => {
      result.current.setPendingRestoreTarget(createRestoreTarget({
        chapterProgress: 0,
      }), { force: true });
    });

    expect(getReaderSessionSnapshot().pendingRestoreTarget).toMatchObject({
      chapterIndex: 5,
      chapterProgress: 0,
      mode: 'scroll',
    });
  });

  it('restores the last content reading position when switching back from summary', () => {
    const persistReaderState = vi.fn();
    const markUserInteracted = vi.fn();
    const setChapterIndex = vi.fn();
    const setMode = vi.fn();
    const latestReaderStateRef = { current: createStoredState() };
    const contentRef = { current: makeContainer() };
    const locator = createLocator();
    const getCurrentAnchorRef = {
      current: () => ({ chapterIndex: 5, chapterProgress: 0.4 } satisfies ScrollModeAnchor),
    };
    let contextValue = createReaderContextValue({
      chapterIndex: 5,
      mode: 'scroll',
      contentRef,
      getCurrentAnchorRef,
      getCurrentOriginalLocatorRef: { current: () => locator },
      latestReaderStateRef,
      markUserInteracted,
      persistReaderState,
      setChapterIndex,
      setMode,
    });

    const { result, rerender } = renderHook(
      ({ signal }: { signal: number }) => useReaderRestoreFlow({
        currentChapter: createCurrentChapter(),
        summaryRestoreSignal: signal,
        isChapterAnalysisLoading: false,
      }),
      {
        initialProps: { signal: 0 },
        wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
          value: contextValue,
          children,
        }),
      },
    );

    act(() => {
      result.current.handleSetViewMode('summary');
    });

    contentRef.current = makeContainer({
      scrollTop: 500,
      scrollHeight: 1000,
      clientHeight: 500,
    });
    contextValue = createReaderContextValue({
      chapterIndex: 5,
      mode: 'summary',
      contentRef,
      getCurrentAnchorRef,
      latestReaderStateRef,
      markUserInteracted,
      persistReaderState,
      setChapterIndex,
      setMode,
    });
    rerender({ signal: 1 });

    act(() => {
      result.current.handleSetViewMode('original');
    });

    expect(result.current.pendingRestoreTargetRef.current).toMatchObject({
      chapterIndex: 5,
      mode: 'scroll',
      locator,
    });
    expect(markUserInteracted).toHaveBeenCalledTimes(2);
    expect(setChapterIndex).toHaveBeenLastCalledWith(5);
    expect(setMode).toHaveBeenLastCalledWith('scroll');
  });

  it('prefers the latest persisted reader snapshot when capture runs during navigation', () => {
    const persistReaderState = vi.fn();
    const chapterChangeSourceRef = {
      current: 'navigation' as ChapterChangeSource,
    };
    const latestReaderStateRef = {
      current: createStoredState({
        chapterIndex: 8,
        locator: createLocator({
          chapterIndex: 8,
        }),
      }),
    };
    const contextValue = createReaderContextValue({
      latestReaderStateRef,
      persistReaderState,
      chapterChangeSourceRef,
      getCurrentAnchorRef: {
        current: () => ({ chapterIndex: 5, chapterProgress: 0.2 } satisfies ScrollModeAnchor),
      },
      getCurrentOriginalLocatorRef: {
        current: () => createLocator(),
      },
    });

    const { result } = renderHook(() => useReaderRestoreFlow({
      currentChapter: createCurrentChapter(),
      summaryRestoreSignal: null,
      isChapterAnalysisLoading: false,
    }), {
      wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
        value: contextValue,
        children,
      }),
    });

    let capturedState: StoredReaderState | null = null;
    act(() => {
      capturedState = result.current.captureCurrentReaderPosition();
    });

    expect(persistReaderState).toHaveBeenCalledWith(expect.objectContaining({
      chapterIndex: 8,
      locator: latestReaderStateRef.current.locator,
      mode: 'scroll',
    }), {
      flush: undefined,
    });
    expect(capturedState).toMatchObject({
      chapterIndex: 8,
      locator: latestReaderStateRef.current.locator,
      mode: 'scroll',
    });
  });

  it('flushes the current reading position on pagehide and hidden visibility changes', () => {
    const persistReaderState = vi.fn();
    const locator = createLocator();
    const visibilityStateDescriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'visibilityState',
    );
    const contextValue = createReaderContextValue({
      persistReaderState,
      getCurrentAnchorRef: {
        current: () => ({ chapterIndex: 5, chapterProgress: 0.6 } satisfies ScrollModeAnchor),
      },
      getCurrentOriginalLocatorRef: {
        current: () => locator,
      },
    });

    renderHook(() => useReaderRestoreFlow({
      currentChapter: createCurrentChapter(),
      summaryRestoreSignal: null,
      isChapterAnalysisLoading: false,
    }), {
      wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
        value: contextValue,
        children,
      }),
    });

    window.dispatchEvent(new Event('pagehide'));

    Object.defineProperty(Document.prototype, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      if (visibilityStateDescriptor) {
        Object.defineProperty(Document.prototype, 'visibilityState', visibilityStateDescriptor);
      } else {
        Reflect.deleteProperty(Document.prototype, 'visibilityState');
      }
    }

    expect(persistReaderState).toHaveBeenNthCalledWith(1, expect.objectContaining({
      chapterIndex: 5,
      locator,
      mode: 'scroll',
    }), {
      flush: true,
    });
    expect(persistReaderState).toHaveBeenNthCalledWith(2, expect.objectContaining({
      chapterIndex: 5,
      locator,
      mode: 'scroll',
    }), {
      flush: true,
    });
  });

  it('captures and flushes the current reading position when the reader unmounts', () => {
    const persistReaderState = vi.fn();
    const locator = createLocator();
    const contextValue = createReaderContextValue({
      persistReaderState,
      getCurrentAnchorRef: {
        current: () => ({ chapterIndex: 5, chapterProgress: 0.55 } satisfies ScrollModeAnchor),
      },
      getCurrentOriginalLocatorRef: {
        current: () => locator,
      },
    });

    const { unmount } = renderHook(() => useReaderRestoreFlow({
      currentChapter: createCurrentChapter(),
      summaryRestoreSignal: null,
      isChapterAnalysisLoading: false,
    }), {
      wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
        value: contextValue,
        children,
      }),
    });

    unmount();

    expect(persistReaderState).toHaveBeenCalledWith(expect.objectContaining({
      chapterIndex: 5,
      locator,
      mode: 'scroll',
    }), {
      flush: true,
    });
  });

  it('reports restore settle results when forced summary restore targets are skipped or completed', async () => {
    const onRestoreSettled = vi.fn();
    const contextValue = createReaderContextValue({
      mode: 'summary',
      contentRef: { current: makeContainer() },
      restoreSettledHandlerRef: { current: onRestoreSettled },
    });

    const { result, rerender } = renderHook(
      ({ signal }: { signal: number }) => useReaderRestoreFlow({
        currentChapter: createCurrentChapter(),
        summaryRestoreSignal: signal,
        isChapterAnalysisLoading: false,
      }),
      {
        initialProps: { signal: 0 },
        wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
          value: contextValue,
          children,
        }),
      },
    );

    act(() => {
      result.current.setPendingRestoreTarget({
        chapterIndex: 5,
        mode: 'summary',
      }, { force: true });
    });

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(onRestoreSettled).toHaveBeenCalledWith('skipped');

    act(() => {
      result.current.setPendingRestoreTarget(createRestoreTarget({
        mode: 'summary',
        chapterProgress: 0.5,
      }), { force: true });
    });

    rerender({ signal: 1 });

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(onRestoreSettled).toHaveBeenCalledWith('completed');
  });
});
