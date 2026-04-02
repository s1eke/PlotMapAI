import type { ChapterChangeSource } from '../navigationTypes';
import type { ScrollModeAnchor } from '../useScrollModeChapters';
import type {
  ReaderRestoreTarget,
  StoredReaderState,
} from '../useReaderStatePersistence';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getReaderSessionSnapshot, resetReaderSessionStoreForTests } from '../sessionStore';
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

function createHookProps(overrides: Partial<Parameters<typeof useReaderRestoreFlow>[0]> = {}) {
  const mode = overrides.sessionSnapshot?.mode ?? 'scroll';
  const chapterIndex = overrides.sessionSnapshot?.chapterIndex ?? 5;
  const lastContentMode = overrides.sessionSnapshot?.lastContentMode ?? 'scroll';
  const pendingRestoreTarget = overrides.sessionSnapshot?.pendingRestoreTarget ?? null;
  const viewMode = overrides.sessionSnapshot?.viewMode ?? (mode === 'summary' ? 'summary' : 'original');

  return {
    currentChapter: createCurrentChapter(),
    isChapterAnalysisLoading: false,
    sessionCommands: {
      latestReaderStateRef: { current: createStoredState() },
      markUserInteracted: vi.fn(),
      persistReaderState: vi.fn(),
      setChapterIndex: vi.fn(),
      setMode: vi.fn(),
      ...overrides.sessionCommands,
    },
    sessionSnapshot: {
      chapterIndex,
      lastContentMode,
      mode,
      pendingRestoreTarget,
      viewMode,
      ...overrides.sessionSnapshot,
    },
    summaryRestoreSignal: null,
    uiBridge: {
      chapterChangeSourceRef: { current: null as ChapterChangeSource },
      contentRef: { current: makeContainer() },
      getCurrentAnchorRef: { current: () => null },
      getCurrentOriginalLocatorRef: { current: () => null },
      getCurrentPagedLocatorRef: { current: () => null },
      isScrollSyncSuppressedRef: { current: false },
      preparePersistenceFlushRef: { current: () => undefined },
      restoreSettledHandlerRef: { current: vi.fn() },
      suppressScrollSyncTemporarilyRef: { current: vi.fn() },
      ...overrides.uiBridge,
    },
    ...overrides,
  } satisfies Parameters<typeof useReaderRestoreFlow>[0];
}

describe('useReaderRestoreFlow', () => {
  beforeEach(() => {
    resetReaderSessionStoreForTests();
  });

  it('reuses the shared restorable-position semantics for non-forced pending restore targets', () => {
    const { result } = renderHook(() => useReaderRestoreFlow(createHookProps()));

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
    const { result } = renderHook(() => useReaderRestoreFlow(createHookProps()));

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
    let hookProps = createHookProps({
      sessionCommands: {
        latestReaderStateRef,
        markUserInteracted,
        persistReaderState,
        setChapterIndex,
        setMode,
      },
      sessionSnapshot: {
        chapterIndex: 5,
        lastContentMode: 'scroll',
        mode: 'scroll',
        pendingRestoreTarget: null,
        viewMode: 'original',
      },
      uiBridge: {
        chapterChangeSourceRef: { current: null as ChapterChangeSource },
        contentRef,
        getCurrentAnchorRef,
        getCurrentOriginalLocatorRef: { current: () => locator },
        getCurrentPagedLocatorRef: { current: () => null },
        isScrollSyncSuppressedRef: { current: false },
        preparePersistenceFlushRef: { current: () => undefined },
        restoreSettledHandlerRef: { current: vi.fn() },
        suppressScrollSyncTemporarilyRef: { current: vi.fn() },
      },
    });

    const { result, rerender } = renderHook(
      (props: Parameters<typeof useReaderRestoreFlow>[0]) => useReaderRestoreFlow(props),
      {
        initialProps: hookProps,
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
    hookProps = createHookProps({
      sessionCommands: {
        latestReaderStateRef,
        markUserInteracted,
        persistReaderState,
        setChapterIndex,
        setMode,
      },
      sessionSnapshot: {
        chapterIndex: 5,
        lastContentMode: 'scroll',
        mode: 'summary',
        pendingRestoreTarget: null,
        viewMode: 'summary',
      },
      summaryRestoreSignal: 1,
      uiBridge: {
        chapterChangeSourceRef: { current: null as ChapterChangeSource },
        contentRef,
        getCurrentAnchorRef,
        getCurrentOriginalLocatorRef: { current: () => null },
        getCurrentPagedLocatorRef: { current: () => null },
        isScrollSyncSuppressedRef: { current: false },
        preparePersistenceFlushRef: { current: () => undefined },
        restoreSettledHandlerRef: { current: vi.fn() },
        suppressScrollSyncTemporarilyRef: { current: vi.fn() },
      },
    });
    rerender(hookProps);

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
    const latestReaderStateRef = {
      current: createStoredState({
        chapterIndex: 8,
        locator: createLocator({
          chapterIndex: 8,
        }),
      }),
    };

    const { result } = renderHook(() => useReaderRestoreFlow(createHookProps({
      sessionCommands: {
        latestReaderStateRef,
        markUserInteracted: vi.fn(),
        persistReaderState,
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      uiBridge: {
        chapterChangeSourceRef: {
          current: 'navigation' as ChapterChangeSource,
        },
        contentRef: { current: makeContainer() },
        getCurrentAnchorRef: {
          current: () => ({ chapterIndex: 5, chapterProgress: 0.2 } satisfies ScrollModeAnchor),
        },
        getCurrentOriginalLocatorRef: {
          current: () => createLocator(),
        },
        getCurrentPagedLocatorRef: { current: () => null },
        isScrollSyncSuppressedRef: { current: false },
        preparePersistenceFlushRef: { current: () => undefined },
        restoreSettledHandlerRef: { current: vi.fn() },
        suppressScrollSyncTemporarilyRef: { current: vi.fn() },
      },
    })));

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

  it('registers a persistence-boundary callback that captures the current reading position', () => {
    const persistReaderState = vi.fn();
    const locator = createLocator();
    const preparePersistenceFlushRef = { current: () => undefined };

    renderHook(() => useReaderRestoreFlow(createHookProps({
      sessionCommands: {
        latestReaderStateRef: { current: createStoredState() },
        markUserInteracted: vi.fn(),
        persistReaderState,
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      uiBridge: {
        chapterChangeSourceRef: { current: null as ChapterChangeSource },
        contentRef: { current: makeContainer() },
        getCurrentAnchorRef: {
          current: () => ({ chapterIndex: 5, chapterProgress: 0.6 } satisfies ScrollModeAnchor),
        },
        getCurrentOriginalLocatorRef: {
          current: () => locator,
        },
        getCurrentPagedLocatorRef: { current: () => null },
        isScrollSyncSuppressedRef: { current: false },
        preparePersistenceFlushRef,
        restoreSettledHandlerRef: { current: vi.fn() },
        suppressScrollSyncTemporarilyRef: { current: vi.fn() },
      },
    })));

    act(() => {
      preparePersistenceFlushRef.current();
    });

    expect(persistReaderState).toHaveBeenCalledWith(expect.objectContaining({
      chapterIndex: 5,
      locator,
      mode: 'scroll',
    }), {
      flush: undefined,
    });
  });

  it('captures the current reading position when the hook unmounts', () => {
    const persistReaderState = vi.fn();
    const locator = createLocator();

    const { unmount } = renderHook(() => useReaderRestoreFlow(createHookProps({
      sessionCommands: {
        latestReaderStateRef: { current: createStoredState() },
        markUserInteracted: vi.fn(),
        persistReaderState,
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      uiBridge: {
        chapterChangeSourceRef: { current: null as ChapterChangeSource },
        contentRef: { current: makeContainer() },
        getCurrentAnchorRef: {
          current: () => ({ chapterIndex: 5, chapterProgress: 0.55 } satisfies ScrollModeAnchor),
        },
        getCurrentOriginalLocatorRef: {
          current: () => locator,
        },
        getCurrentPagedLocatorRef: { current: () => null },
        isScrollSyncSuppressedRef: { current: false },
        preparePersistenceFlushRef: { current: () => undefined },
        restoreSettledHandlerRef: { current: vi.fn() },
        suppressScrollSyncTemporarilyRef: { current: vi.fn() },
      },
    })));

    unmount();

    expect(persistReaderState).toHaveBeenCalledWith(expect.objectContaining({
      chapterIndex: 5,
      locator,
      mode: 'scroll',
    }), {
      flush: undefined,
    });
  });

  it('reports restore settle results when forced summary restore targets are skipped or completed', async () => {
    const onRestoreSettled = vi.fn();
    const hookProps = createHookProps({
      sessionSnapshot: {
        chapterIndex: 5,
        lastContentMode: 'scroll',
        mode: 'summary',
        pendingRestoreTarget: null,
        viewMode: 'summary',
      },
      uiBridge: {
        chapterChangeSourceRef: { current: null as ChapterChangeSource },
        contentRef: { current: makeContainer() },
        getCurrentAnchorRef: { current: () => null },
        getCurrentOriginalLocatorRef: { current: () => null },
        getCurrentPagedLocatorRef: { current: () => null },
        isScrollSyncSuppressedRef: { current: false },
        preparePersistenceFlushRef: { current: () => undefined },
        restoreSettledHandlerRef: { current: onRestoreSettled },
        suppressScrollSyncTemporarilyRef: { current: vi.fn() },
      },
    });

    const { result, rerender } = renderHook(
      (props: Parameters<typeof useReaderRestoreFlow>[0]) => useReaderRestoreFlow(props),
      {
        initialProps: hookProps,
      },
    );

    act(() => {
      result.current.setPendingRestoreTarget({
        chapterIndex: 5,
        mode: 'summary',
      }, { force: true });
    });

    rerender({
      ...hookProps,
      sessionSnapshot: {
        ...hookProps.sessionSnapshot,
        pendingRestoreTarget: {
          chapterIndex: 5,
          mode: 'summary',
        },
      },
    });

    await waitFor(() => {
      expect(onRestoreSettled).toHaveBeenCalledWith('skipped');
    });

    act(() => {
      result.current.setPendingRestoreTarget(createRestoreTarget({
        mode: 'summary',
        chapterProgress: 0.5,
      }), { force: true });
    });

    rerender({
      ...hookProps,
      sessionSnapshot: {
        ...hookProps.sessionSnapshot,
        pendingRestoreTarget: createRestoreTarget({
          mode: 'summary',
          chapterProgress: 0.5,
        }),
      },
      summaryRestoreSignal: 1,
    });

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(onRestoreSettled).toHaveBeenCalledWith('completed');
  });
});
