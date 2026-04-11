import type { ReactNode } from 'react';
import type {
  ChapterChangeSource,
  ReaderLocator,
  ReaderRestoreTarget,
  RestoreSettledResult,
  StoredReaderState,
} from '@shared/contracts/reader';
import type { ScrollModeAnchor } from '../useScrollModeChapters';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createReaderContextWrapper } from '@test/readerRuntimeTestUtils';
import { getReaderSessionSnapshot, resetReaderSessionStoreForTests } from '../readerSessionStore';
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
    canonical: {
      chapterIndex: 5,
      blockIndex: 2,
      kind: 'text',
      lineIndex: 0,
    },
    hints: {
      chapterProgress: 0.4,
      contentMode: 'scroll',
    },
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
    plainText: 'content',
    richBlocks: [],
    contentFormat: 'plain' as const,
    contentVersion: 1,
    wordCount: 100,
    totalChapters: 10,
    hasPrev: true,
    hasNext: true,
  };
}

function createLocator(overrides: Partial<ReaderLocator> = {}): ReaderLocator {
  return {
    chapterIndex: 5,
    blockIndex: 2,
    kind: 'text' as const,
    lineIndex: 0,
    ...overrides,
  };
}

interface RestoreRuntimeHarness {
  Wrapper: ({ children }: { children: ReactNode }) => ReactNode;
  chapterChangeSourceRef: { current: ChapterChangeSource };
  contentRef: { current: HTMLDivElement | null };
  getCurrentAnchorRef: { current: () => ScrollModeAnchor | null };
  getCurrentOriginalLocatorRef: {
    current: () => ReaderLocator | null;
  };
  getCurrentPagedLocatorRef: {
    current: () => ReaderLocator | null;
  };
  isScrollSyncSuppressedRef: { current: boolean };
  preparePersistenceFlushRef: { current: () => void };
  restoreSettledHandlerRef: { current: (result: RestoreSettledResult) => void };
  suppressScrollSyncTemporarilyRef: { current: ReturnType<typeof vi.fn> };
}

interface CreateHookPropsOptions extends Partial<Parameters<typeof useReaderRestoreFlow>[0]> {
  runtime?: Partial<Omit<RestoreRuntimeHarness, 'Wrapper'>>;
}

function createHookHarness(overrides: CreateHookPropsOptions = {}) {
  const mode = overrides.sessionSnapshot?.mode ?? 'scroll';
  const chapterIndex = overrides.sessionSnapshot?.chapterIndex ?? 5;
  const pendingRestoreTarget = overrides.sessionSnapshot?.pendingRestoreTarget ?? null;
  const runtimeOverrides = overrides.runtime ?? {};
  const chapterChangeSourceRef = runtimeOverrides.chapterChangeSourceRef ?? {
    current: null as ChapterChangeSource,
  };
  const contentRef = runtimeOverrides.contentRef ?? { current: makeContainer() };
  const getCurrentAnchorRef = runtimeOverrides.getCurrentAnchorRef ?? { current: () => null };
  const getCurrentOriginalLocatorRef =
    runtimeOverrides.getCurrentOriginalLocatorRef ?? { current: () => null };
  const getCurrentPagedLocatorRef =
    runtimeOverrides.getCurrentPagedLocatorRef ?? { current: () => null };
  const isScrollSyncSuppressedRef =
    runtimeOverrides.isScrollSyncSuppressedRef ?? { current: false };
  const preparePersistenceFlushRef =
    runtimeOverrides.preparePersistenceFlushRef ?? { current: () => undefined };
  const restoreSettledHandlerRef =
    runtimeOverrides.restoreSettledHandlerRef ?? { current: vi.fn() };
  const suppressScrollSyncTemporarilyRef =
    runtimeOverrides.suppressScrollSyncTemporarilyRef ?? { current: vi.fn() };
  const { Wrapper } = createReaderContextWrapper({
    contentRef,
    getChapterChangeSource: () => chapterChangeSourceRef.current,
    setChapterChangeSource: (nextSource) => {
      chapterChangeSourceRef.current = nextSource;
    },
    getCurrentAnchor: () => getCurrentAnchorRef.current(),
    getCurrentOriginalLocator: () => getCurrentOriginalLocatorRef.current(),
    getCurrentPagedLocator: () => getCurrentPagedLocatorRef.current(),
    isScrollSyncSuppressed: () => isScrollSyncSuppressedRef.current,
    notifyRestoreSettled: (result) => {
      restoreSettledHandlerRef.current(result);
    },
    registerBeforeFlush: (handler) => {
      preparePersistenceFlushRef.current = handler;
      return () => {
        if (preparePersistenceFlushRef.current === handler) {
          preparePersistenceFlushRef.current = () => undefined;
        }
      };
    },
    suppressScrollSyncTemporarily: () => {
      suppressScrollSyncTemporarilyRef.current();
    },
  });

  const hookProps = {
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
      mode,
      pendingRestoreTarget,
      ...overrides.sessionSnapshot,
    },
    summaryRestoreSignal: null,
    ...overrides,
  } satisfies Parameters<typeof useReaderRestoreFlow>[0];

  return {
    hookProps,
    runtime: {
      Wrapper,
      chapterChangeSourceRef,
      contentRef,
      getCurrentAnchorRef,
      getCurrentOriginalLocatorRef,
      getCurrentPagedLocatorRef,
      isScrollSyncSuppressedRef,
      preparePersistenceFlushRef,
      restoreSettledHandlerRef,
      suppressScrollSyncTemporarilyRef,
    } satisfies RestoreRuntimeHarness,
  };
}

describe('useReaderRestoreFlow', () => {
  beforeEach(() => {
    resetReaderSessionStoreForTests();
  });

  it('keeps summary progress restore targets but clears original-mode progress-only ones', () => {
    const { hookProps, runtime } = createHookHarness();
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
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
        mode: 'summary',
      }));
    });

    expect(getReaderSessionSnapshot().pendingRestoreTarget).toMatchObject({
      chapterIndex: 5,
      chapterProgress: 0.4,
      mode: 'summary',
    });
  });

  it('keeps forced chapter-start restore targets so navigation restore still runs', () => {
    const { hookProps, runtime } = createHookHarness();
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
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

  it('forces summary restores to chapter-start progress without locator hints', () => {
    const persistReaderState = vi.fn();
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: { current: createStoredState() },
        markUserInteracted: vi.fn(),
        persistReaderState,
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        chapterIndex: 5,
        mode: 'scroll',
        pendingRestoreTarget: null,
      },
      runtime: {
        getCurrentOriginalLocatorRef: {
          current: () => createLocator(),
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    act(() => {
      result.current.switchMode('summary');
    });

    expect(result.current.pendingRestoreTargetRef.current).toMatchObject({
      chapterIndex: 5,
      chapterProgress: 0,
      mode: 'summary',
    });
    expect(result.current.pendingRestoreTargetRef.current?.locator).toBeUndefined();
    expect(result.current.pendingRestoreTargetRef.current?.locatorBoundary).toBeUndefined();
    expect(persistReaderState).toHaveBeenLastCalledWith(expect.objectContaining({
      hints: expect.objectContaining({
        chapterProgress: 0,
      }),
    }), {
      persistRemote: false,
    });
  });

  it('reuses captured location when switching between content modes', () => {
    const setChapterIndex = vi.fn();
    const setMode = vi.fn();
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: createLocator({
              chapterIndex: 7,
            }),
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState: vi.fn(),
        setChapterIndex,
        setMode,
      },
      sessionSnapshot: {
        chapterIndex: 7,
        mode: 'scroll',
        pendingRestoreTarget: null,
      },
      runtime: {
        getCurrentOriginalLocatorRef: {
          current: () => createLocator({
            chapterIndex: 7,
          }),
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    act(() => {
      result.current.switchMode('paged');
    });

    expect(result.current.pendingRestoreTargetRef.current).toMatchObject({
      chapterIndex: 7,
      mode: 'paged',
    });
    expect(result.current.pendingRestoreTargetRef.current?.locatorBoundary).toBeUndefined();
    expect(setChapterIndex).toHaveBeenCalledWith(7);
    expect(setMode).toHaveBeenCalledWith('paged');
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
    const { hookProps: initialHookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef,
        markUserInteracted,
        persistReaderState,
        setChapterIndex,
        setMode,
      },
      sessionSnapshot: {
        chapterIndex: 5,
        mode: 'scroll',
        pendingRestoreTarget: null,
      },
      runtime: {
        contentRef,
        getCurrentAnchorRef,
        getCurrentOriginalLocatorRef: { current: () => locator },
      },
    });
    let hookProps = initialHookProps;

    const { result, rerender } = renderHook(
      (props: Parameters<typeof useReaderRestoreFlow>[0]) => useReaderRestoreFlow(props),
      {
        initialProps: hookProps,
        wrapper: runtime.Wrapper,
      },
    );

    act(() => {
      result.current.switchMode('summary');
    });

    contentRef.current = makeContainer({
      scrollTop: 500,
      scrollHeight: 1000,
      clientHeight: 500,
    });
    hookProps = createHookHarness({
      sessionCommands: {
        latestReaderStateRef,
        markUserInteracted,
        persistReaderState,
        setChapterIndex,
        setMode,
      },
      sessionSnapshot: {
        chapterIndex: 5,
        mode: 'summary',
        pendingRestoreTarget: null,
      },
      summaryRestoreSignal: 1,
      runtime: {
        contentRef,
        getCurrentAnchorRef,
      },
    }).hookProps;
    rerender(hookProps);

    act(() => {
      result.current.switchMode('scroll');
    });

    expect(result.current.pendingRestoreTargetRef.current).toMatchObject({
      chapterIndex: 5,
      mode: 'scroll',
    });
    expect(markUserInteracted).toHaveBeenCalledTimes(2);
    expect(setChapterIndex).toHaveBeenLastCalledWith(5);
    expect(setMode).toHaveBeenLastCalledWith('scroll');
  });

  it('prefers the latest persisted reader snapshot when capture runs during navigation', () => {
    const persistReaderState = vi.fn();
    const latestReaderStateRef = {
      current: createStoredState({
        canonical: createLocator({
          chapterIndex: 8,
        }),
      }),
    };

    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef,
        markUserInteracted: vi.fn(),
        persistReaderState,
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      runtime: {
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
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    let capturedState: StoredReaderState | null = null;
    act(() => {
      capturedState = result.current.captureCurrentReaderPosition();
    });

    expect(persistReaderState).toHaveBeenCalledWith(expect.objectContaining({
      canonical: latestReaderStateRef.current.canonical,
    }), {
      flush: undefined,
    });
    expect(capturedState).toMatchObject({
      canonical: latestReaderStateRef.current.canonical,
    });
  });

  it('registers a persistence-boundary callback that captures the current reading position', () => {
    const persistReaderState = vi.fn();
    const locator = createLocator();
    const preparePersistenceFlushRef = { current: () => undefined };

    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: { current: createStoredState() },
        markUserInteracted: vi.fn(),
        persistReaderState,
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      runtime: {
        preparePersistenceFlushRef,
        contentRef: { current: makeContainer() },
        getCurrentAnchorRef: {
          current: () => ({ chapterIndex: 5, chapterProgress: 0.6 } satisfies ScrollModeAnchor),
        },
        getCurrentOriginalLocatorRef: {
          current: () => locator,
        },
      },
    });
    renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    act(() => {
      preparePersistenceFlushRef.current();
    });

    expect(persistReaderState).toHaveBeenCalledWith(expect.objectContaining({
      canonical: {
        chapterIndex: 5,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 0,
      },
    }), {
      flush: undefined,
    });
  });

  it('captures the current reading position when the hook unmounts', () => {
    const persistReaderState = vi.fn();
    const locator = createLocator();

    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: { current: createStoredState() },
        markUserInteracted: vi.fn(),
        persistReaderState,
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      runtime: {
        contentRef: { current: makeContainer() },
        getCurrentAnchorRef: {
          current: () => ({ chapterIndex: 5, chapterProgress: 0.55 } satisfies ScrollModeAnchor),
        },
        getCurrentOriginalLocatorRef: {
          current: () => locator,
        },
      },
    });
    const { unmount } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    unmount();

    expect(persistReaderState).toHaveBeenCalledWith(expect.objectContaining({
      canonical: {
        chapterIndex: 5,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 0,
      },
    }), {
      flush: undefined,
    });
  });

  it('reports restore settle results when forced summary restore targets are skipped or completed', async () => {
    const onRestoreSettled = vi.fn();
    const { hookProps, runtime } = createHookHarness({
      sessionSnapshot: {
        chapterIndex: 5,
        mode: 'summary',
        pendingRestoreTarget: null,
      },
      runtime: {
        contentRef: { current: makeContainer() },
        restoreSettledHandlerRef: { current: onRestoreSettled },
      },
    });

    const { result, rerender } = renderHook(
      (props: Parameters<typeof useReaderRestoreFlow>[0]) => useReaderRestoreFlow(props),
      {
        initialProps: hookProps,
        wrapper: runtime.Wrapper,
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
