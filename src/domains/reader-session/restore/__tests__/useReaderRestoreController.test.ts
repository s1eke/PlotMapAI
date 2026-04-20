import type { ReactNode } from 'react';
import type {
  ChapterChangeSource,
  ReaderLocator,
  ReaderRestoreTarget,
  RestoreSettledResult,
  StoredReaderState,
} from '@shared/contracts/reader';
import type { ScrollModeAnchor } from '@shared/contracts/reader';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createReaderContextWrapper } from '@test/readerRuntimeTestUtils';
import { setDebugFeatureEnabled } from '@shared/debug';
import { getReaderSessionSnapshot, resetReaderSessionStoreForTests } from '../../store/readerSessionStore';
import * as readerSessionStore from '../../store/readerSessionStore';
import { useReaderRestoreController as useReaderRestoreFlow } from '../useReaderRestoreController';

const readerTraceMocks = vi.hoisted(() => ({
  enabled: false,
  recordReaderTrace: vi.fn(),
}));

vi.mock('@shared/reader-trace', () => ({
  isReaderTraceEnabled: () => readerTraceMocks.enabled,
  recordReaderTrace: readerTraceMocks.recordReaderTrace,
}));

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

function makeClampedContainer({
  scrollTop = 0,
  scrollHeight = 1000,
  clientHeight = 500,
}: {
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
} = {}): HTMLDivElement {
  const element = document.createElement('div');
  let currentScrollTop = Math.max(0, Math.min(scrollTop, scrollHeight - clientHeight));
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (nextValue: number) => {
      const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
      currentScrollTop = Math.max(0, Math.min(maxScrollTop, Math.round(nextValue)));
    },
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

function createSessionStoreSnapshotMock(
  overrides: Partial<ReturnType<typeof getReaderSessionSnapshot>>,
): ReturnType<typeof getReaderSessionSnapshot> {
  return {
    ...readerSessionStore.readerSessionStore.getState(),
    ...overrides,
  };
}

function createDeferredPromise<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return {
    promise,
    reject,
    resolve,
  };
}

function createAnimationFrameController() {
  const frameCallbacks: Array<FrameRequestCallback | null> = [];
  const requestAnimationFrameSpy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
  const cancelAnimationFrameSpy = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((id: number) => {
      const callbackIndex = id - 1;
      if (callbackIndex >= 0 && callbackIndex < frameCallbacks.length) {
        frameCallbacks[callbackIndex] = null;
      }
    });

  async function flushAnimationFrames() {
    while (frameCallbacks.length > 0) {
      const queuedCallbacks = frameCallbacks.splice(0, frameCallbacks.length);
      await act(async () => {
        queuedCallbacks.forEach((callback) => callback?.(0));
        await Promise.resolve();
      });
    }
  }

  return {
    flushAnimationFrames,
    restore() {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    },
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
  pagedStateRef: { current: { pageCount: number; pageIndex: number } };
  preparePersistenceFlushRef: { current: () => void };
  resolvePagedLocatorPageIndexRef: {
    current: (locator: ReaderLocator) => number | null;
  };
  resolveScrollLocatorOffsetRef: {
    current: (locator: ReaderLocator) => number | null;
  };
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
  const pagedStateRef = runtimeOverrides.pagedStateRef ?? {
    current: { pageCount: 1, pageIndex: 0 },
  };
  const preparePersistenceFlushRef =
    runtimeOverrides.preparePersistenceFlushRef ?? { current: () => undefined };
  const resolvePagedLocatorPageIndexRef =
    runtimeOverrides.resolvePagedLocatorPageIndexRef ?? { current: () => null };
  const resolveScrollLocatorOffsetRef =
    runtimeOverrides.resolveScrollLocatorOffsetRef ?? { current: () => null };
  const restoreSettledHandlerRef =
    runtimeOverrides.restoreSettledHandlerRef ?? { current: vi.fn() };
  const suppressScrollSyncTemporarilyRef =
    runtimeOverrides.suppressScrollSyncTemporarilyRef ?? { current: vi.fn() };
  const { Wrapper } = createReaderContextWrapper({
    contentRef,
    getChapterChangeSource: () => chapterChangeSourceRef.current,
    getPagedState: () => pagedStateRef.current,
    setChapterChangeSource: (nextSource) => {
      chapterChangeSourceRef.current = nextSource;
    },
    setPagedState: (nextState) => {
      pagedStateRef.current = nextState;
    },
    getCurrentAnchor: () => getCurrentAnchorRef.current(),
    getCurrentOriginalLocator: () => getCurrentOriginalLocatorRef.current(),
    getCurrentPagedLocator: () => getCurrentPagedLocatorRef.current(),
    isScrollSyncSuppressed: () => isScrollSyncSuppressedRef.current,
    notifyRestoreSettled: (result) => {
      restoreSettledHandlerRef.current(result);
    },
    resolvePagedLocatorPageIndex: (locator) => {
      return resolvePagedLocatorPageIndexRef.current(locator);
    },
    resolveScrollLocatorOffset: (locator) => {
      return resolveScrollLocatorOffsetRef.current(locator);
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
      restoreStatus: 'ready' as const,
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
      pagedStateRef,
      preparePersistenceFlushRef,
      resolvePagedLocatorPageIndexRef,
      resolveScrollLocatorOffsetRef,
      restoreSettledHandlerRef,
      suppressScrollSyncTemporarilyRef,
    } satisfies RestoreRuntimeHarness,
  };
}

describe('useReaderRestoreFlow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetReaderSessionStoreForTests();
    setDebugFeatureEnabled('readerStrictModeSwitch', false);
    readerTraceMocks.enabled = false;
    readerTraceMocks.recordReaderTrace.mockReset();
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
    readerTraceMocks.enabled = true;
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
        viewMode: 'summary',
      }),
    }));
    const traceCalls = readerTraceMocks.recordReaderTrace.mock.calls;
    expect(traceCalls.map(([eventName]) => eventName)).toEqual(expect.arrayContaining([
      'mode_switch_started',
      'mode_switch_target_resolved',
      'mode_switch_finished',
    ]));
    expect(traceCalls).toContainEqual([
      'mode_switch_target_resolved',
      expect.objectContaining({
        chapterIndex: 5,
        mode: 'summary',
        details: expect.objectContaining({
          chapterProgress: 0,
          sourceMode: 'scroll',
          strict: false,
          targetMode: 'summary',
        }),
      }),
    ]);
  });

  it('persists summary scroll progress through the durable pipeline after debounce', () => {
    vi.useFakeTimers();
    const persistReaderState = vi.fn();
    const contentRef = {
      current: makeContainer({
        scrollTop: 250,
        scrollHeight: 1000,
        clientHeight: 500,
      }),
    };
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
        mode: 'summary',
        pendingRestoreTarget: null,
      },
      runtime: {
        contentRef,
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    act(() => {
      result.current.handleContentScroll();
      vi.advanceTimersByTime(150);
    });

    expect(persistReaderState).toHaveBeenLastCalledWith({
      hints: {
        chapterProgress: 0.5,
      },
    });
    vi.useRealTimers();
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

  it('enters restoring-position immediately for non-strict content-mode switches', () => {
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
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
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

    expect(getReaderSessionSnapshot().restoreStatus).toBe('restoring-position');
    expect(getReaderSessionSnapshot().pendingRestoreTarget).toMatchObject({
      chapterIndex: 7,
      mode: 'paged',
    });
  });

  it('clears mode-switch rollback state after a successful restore settle', () => {
    const { hookProps, runtime } = createHookHarness({
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

    expect(result.current.handleRestoreSettled('completed')).toBe(false);
    expect(result.current.handleRestoreSettled('failed')).toBe(false);
  });

  it('rolls back mode-switch state when restore fails', () => {
    readerTraceMocks.enabled = true;
    const persistReaderState = vi.fn();
    const setMode = vi.fn();
    const setChapterIndex = vi.fn();
    const locator = createLocator({
      chapterIndex: 7,
    });
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: locator,
            hints: {
              chapterProgress: 0.4,
              contentMode: 'scroll',
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState,
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
          current: () => locator,
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    act(() => {
      result.current.switchMode('paged');
    });

    persistReaderState.mockClear();
    setMode.mockClear();
    setChapterIndex.mockClear();

    expect(result.current.handleRestoreSettled('failed')).toBe(true);
    expect(setMode).toHaveBeenCalledWith('scroll');
    expect(result.current.pendingRestoreTargetRef.current).toMatchObject({
      chapterIndex: 7,
      mode: 'scroll',
    });
    expect(persistReaderState).toHaveBeenCalledWith(expect.objectContaining({
      canonical: {
        chapterIndex: 7,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 0,
      },
      hints: expect.objectContaining({
        contentMode: 'scroll',
        viewMode: 'original',
      }),
    }), {
      flush: true,
    });
    expect(readerTraceMocks.recordReaderTrace.mock.calls).toContainEqual([
      'mode_switch_rollback',
      expect.objectContaining({
        chapterIndex: 7,
        mode: 'scroll',
        details: expect.objectContaining({
          failedMode: 'scroll',
          rollbackMode: 'scroll',
        }),
      }),
    ]);
  });

  it('does not enter the target mode when strict mode-switch source capture persistence fails', async () => {
    readerTraceMocks.enabled = true;
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    vi.spyOn(readerSessionStore, 'flushPersistence').mockResolvedValue(undefined);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot')
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: {
          code: 'STORAGE_OPERATION_FAILED',
          message: 'db write failed',
          retryable: true,
          time: 1,
        },
        persistenceStatus: 'degraded',
      }));

    const persistReaderState = vi.fn();
    const setMode = vi.fn();
    const setChapterIndex = vi.fn();
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: { current: createStoredState() },
        markUserInteracted: vi.fn(),
        persistReaderState,
        setChapterIndex,
        setMode,
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

    await act(async () => {
      await expect(result.current.switchMode('paged')).rejects.toMatchObject({
        code: 'READER_MODE_SWITCH_FAILED',
      });
    });

    expect(setMode).not.toHaveBeenCalled();
    expect(result.current.modeSwitchError?.code).toBe('READER_MODE_SWITCH_FAILED');
    expect(result.current.modeSwitchError?.message).toContain('stage=capture_source');
    expect(result.current.modeSwitchError?.message).toContain('switch=scroll->paged');
    expect(readerTraceMocks.recordReaderTrace).toHaveBeenCalledWith(
      'mode_switch_error',
      expect.objectContaining({
        chapterIndex: 5,
        mode: 'scroll',
        details: expect.objectContaining({
          stage: 'capture_source',
          strict: true,
          targetMode: 'paged',
        }),
      }),
    );
  });

  it('clears the pending restore target and surfaces an error when strict mode target persistence fails', async () => {
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    vi.spyOn(readerSessionStore, 'flushPersistence').mockResolvedValue(undefined);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot')
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: {
          code: 'STORAGE_OPERATION_FAILED',
          message: 'persist target hints failed',
          retryable: true,
          time: 2,
        },
        persistenceStatus: 'degraded',
      }));

    const persistReaderState = vi.fn();
    const setMode = vi.fn();
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: { current: createStoredState() },
        markUserInteracted: vi.fn(),
        persistReaderState,
        setChapterIndex: vi.fn(),
        setMode,
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

    await act(async () => {
      await expect(result.current.switchMode('paged')).rejects.toMatchObject({
        code: 'READER_MODE_SWITCH_FAILED',
      });
    });

    expect(setMode).toHaveBeenCalledWith('paged');
    expect(result.current.pendingRestoreTargetRef.current).toBeNull();
    expect(result.current.modeSwitchError?.code).toBe('READER_MODE_SWITCH_FAILED');
    expect(result.current.modeSwitchError?.message).toContain('stage=persist_target_state');
  });

  it('requires a live scroll locator before entering a strict mode switch', async () => {
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    const setMode = vi.fn();
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: createLocator({
              chapterIndex: 7,
            }),
            hints: {
              chapterProgress: 0.4,
              contentMode: 'scroll',
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState: vi.fn(),
        setChapterIndex: vi.fn(),
        setMode,
      },
      sessionSnapshot: {
        chapterIndex: 7,
        mode: 'scroll',
        pendingRestoreTarget: null,
      },
      runtime: {
        getCurrentAnchorRef: {
          current: () => ({ chapterIndex: 7, chapterProgress: 0.4 }),
        },
        getCurrentOriginalLocatorRef: {
          current: () => null,
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    await act(async () => {
      await expect(result.current.switchMode('paged')).rejects.toMatchObject({
        code: 'READER_MODE_SWITCH_FAILED',
      });
    });

    expect(setMode).not.toHaveBeenCalled();
    expect(result.current.modeSwitchError?.message).toContain('stage=capture_source');
    expect(result.current.modeSwitchError?.message).toContain('live_scroll_locator_missing');
  });

  it('disables rollback and automatic retry when strict mode restore fails', async () => {
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    vi.spyOn(readerSessionStore, 'flushPersistence').mockResolvedValue(undefined);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot')
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastRestoreResult: {
          attempts: 1,
          chapterIndex: 7,
          measuredError: {
            actual: 14,
            delta: 4,
            expected: 10,
            metric: 'page_delta',
            tolerance: 0,
          },
          mode: 'paged',
          reason: 'validation_exceeded_tolerance',
          retryable: true,
          status: 'failed',
        },
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastRestoreResult: {
          attempts: 1,
          chapterIndex: 7,
          measuredError: {
            actual: 14,
            delta: 4,
            expected: 10,
            metric: 'page_delta',
            tolerance: 0,
          },
          mode: 'paged',
          reason: 'validation_exceeded_tolerance',
          retryable: true,
          status: 'failed',
        },
      }));

    const persistReaderState = vi.fn();
    const setMode = vi.fn();
    const locator = createLocator({
      chapterIndex: 7,
    });
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: locator,
            hints: {
              chapterProgress: 0.4,
              contentMode: 'scroll',
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState,
        setChapterIndex: vi.fn(),
        setMode,
      },
      sessionSnapshot: {
        chapterIndex: 7,
        mode: 'scroll',
        pendingRestoreTarget: null,
      },
      runtime: {
        getCurrentOriginalLocatorRef: {
          current: () => locator,
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    let switchModePromise: Promise<void> | null = null;
    await act(async () => {
      switchModePromise = result.current.switchMode('paged');
      await Promise.resolve();
    });

    const retryOutcome = result.current.recordRestoreResult({
      attempts: 1,
      chapterIndex: 7,
      measuredError: {
        actual: 14,
        delta: 4,
        expected: 10,
        metric: 'page_delta',
        tolerance: 0,
      },
      mode: 'paged',
      reason: 'validation_exceeded_tolerance',
      retryable: true,
      status: 'failed',
    }, result.current.pendingRestoreTargetRef.current);

    expect(retryOutcome.scheduledRetry).toBe(false);

    persistReaderState.mockClear();
    setMode.mockClear();

    act(() => {
      expect(result.current.handleRestoreSettled('failed')).toBe(false);
    });
    await expect(switchModePromise).rejects.toMatchObject({
      code: 'READER_MODE_SWITCH_FAILED',
    });
    expect(setMode).not.toHaveBeenCalled();
    expect(persistReaderState).not.toHaveBeenCalledWith(expect.anything(), {
      flush: true,
    });
    expect(result.current.modeSwitchError?.code).toBe('READER_MODE_SWITCH_FAILED');
    expect(result.current.modeSwitchError?.message).toContain('stage=restore_target');
    expect(result.current.modeSwitchError?.message).toContain('reason=validation_exceeded_tolerance');
  });

  it('treats skipped strict mode restores as failures and rejects the switch promise', async () => {
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    vi.spyOn(readerSessionStore, 'flushPersistence').mockResolvedValue(undefined);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot')
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      }))
      .mockReturnValueOnce(createSessionStoreSnapshotMock({
        lastRestoreResult: {
          attempts: 1,
          chapterIndex: 7,
          mode: 'paged',
          reason: 'no_target',
          retryable: false,
          status: 'skipped',
        },
      }));

    const locator = createLocator({
      chapterIndex: 7,
    });
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: locator,
            hints: {
              chapterProgress: 0.4,
              contentMode: 'scroll',
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState: vi.fn(),
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        chapterIndex: 7,
        mode: 'scroll',
        pendingRestoreTarget: null,
      },
      runtime: {
        getCurrentOriginalLocatorRef: {
          current: () => locator,
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    let switchModePromise: Promise<void> | null = null;
    await act(async () => {
      switchModePromise = result.current.switchMode('paged');
      await Promise.resolve();
    });

    act(() => {
      expect(result.current.handleRestoreSettled('skipped')).toBe(false);
    });

    await expect(switchModePromise).rejects.toMatchObject({
      code: 'READER_MODE_SWITCH_FAILED',
    });
    expect(result.current.modeSwitchError?.message).toContain('stage=restore_target');
    expect(result.current.modeSwitchError?.message).toContain('reason=no_target');
  });

  it('fails strict scroll-to-paged switches when restore settles on the wrong page', async () => {
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    vi.spyOn(readerSessionStore, 'flushPersistence').mockResolvedValue(undefined);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot').mockImplementation(() => {
      return createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      });
    });

    const locator = createLocator({
      blockIndex: 18,
      chapterIndex: 7,
      lineIndex: 6,
    });
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: locator,
            hints: {
              chapterProgress: 0.4,
              contentMode: 'scroll',
              pageIndex: 0,
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState: vi.fn(),
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        chapterIndex: 7,
        mode: 'scroll',
        pendingRestoreTarget: null,
      },
      runtime: {
        getCurrentOriginalLocatorRef: {
          current: () => locator,
        },
        pagedStateRef: {
          current: { pageCount: 20, pageIndex: 0 },
        },
        resolvePagedLocatorPageIndexRef: {
          current: () => 5,
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    let switchModePromise: Promise<void> | null = null;
    await act(async () => {
      switchModePromise = result.current.switchMode('paged');
      await Promise.resolve();
    });

    act(() => {
      expect(result.current.handleRestoreSettled('completed')).toBe(false);
    });

    await expect(switchModePromise).rejects.toMatchObject({
      code: 'READER_MODE_SWITCH_FAILED',
    });
    expect(result.current.modeSwitchError?.message).toContain('stage=restore_target');
    expect(result.current.modeSwitchError?.message).toContain(
      'resolved_page_mismatch expected=5 actual=0',
    );
    expect(result.current.modeSwitchError?.message).toContain(
      'reason=validation_exceeded_tolerance',
    );
  });

  it('fails strict mode switches that never receive a restore-settled signal', async () => {
    vi.useFakeTimers();
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    vi.spyOn(readerSessionStore, 'flushPersistence').mockResolvedValue(undefined);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot').mockImplementation(() => {
      return createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      });
    });

    const locator = createLocator({
      chapterIndex: 7,
    });
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: locator,
            hints: {
              chapterProgress: 0.4,
              contentMode: 'scroll',
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState: vi.fn(),
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        chapterIndex: 7,
        mode: 'scroll',
        pendingRestoreTarget: null,
      },
      runtime: {
        getCurrentOriginalLocatorRef: {
          current: () => locator,
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    let switchModePromise: Promise<void> | null = null;
    await act(async () => {
      switchModePromise = result.current.switchMode('paged');
      await Promise.resolve();
    });
    const capturedFailure = switchModePromise?.catch((error) => error);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    await expect(capturedFailure).resolves.toMatchObject({
      code: 'READER_MODE_SWITCH_FAILED',
    });
    expect(result.current.modeSwitchError?.message).toContain('stage=restore_target');
    expect(result.current.modeSwitchError?.message).toContain('message=restore_settled_timeout');
    vi.useRealTimers();
  });

  it('allows delayed strict scroll-to-paged restore completion before the paged timeout window', async () => {
    vi.useFakeTimers();
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    vi.spyOn(readerSessionStore, 'flushPersistence').mockResolvedValue(undefined);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot').mockImplementation(() => {
      return createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      });
    });

    const locator = createLocator({
      blockIndex: 18,
      chapterIndex: 7,
      lineIndex: 6,
    });
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: locator,
            hints: {
              chapterProgress: 0.4,
              contentMode: 'scroll',
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState: vi.fn(),
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        chapterIndex: 7,
        mode: 'scroll',
        pendingRestoreTarget: null,
      },
      runtime: {
        getCurrentOriginalLocatorRef: {
          current: () => locator,
        },
        pagedStateRef: {
          current: { pageCount: 20, pageIndex: 0 },
        },
        resolvePagedLocatorPageIndexRef: {
          current: () => 5,
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    let switchModePromise: Promise<void> | null = null;
    await act(async () => {
      switchModePromise = result.current.switchMode('paged');
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.modeSwitchError).toBeNull();

    await act(async () => {
      runtime.pagedStateRef.current = {
        pageCount: 20,
        pageIndex: 5,
      };
      expect(result.current.handleRestoreSettled('completed')).toBe(false);
      await Promise.resolve();
    });

    await expect(switchModePromise).resolves.toBeUndefined();
    expect(result.current.modeSwitchError).toBeNull();
    vi.useRealTimers();
  });

  it('accepts strict scroll-to-paged completion when chapter progress advances beyond a collapsed first-page locator', async () => {
    vi.useFakeTimers();
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    vi.spyOn(readerSessionStore, 'flushPersistence').mockResolvedValue(undefined);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot').mockImplementation(() => {
      return createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      });
    });

    const locator = createLocator({
      blockIndex: 18,
      chapterIndex: 7,
      lineIndex: 6,
    });
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: locator,
            hints: {
              chapterProgress: 0.9,
              contentMode: 'scroll',
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState: vi.fn(),
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        chapterIndex: 7,
        mode: 'scroll',
        pendingRestoreTarget: null,
      },
      runtime: {
        getCurrentOriginalLocatorRef: {
          current: () => locator,
        },
        pagedStateRef: {
          current: { pageCount: 2, pageIndex: 0 },
        },
        resolvePagedLocatorPageIndexRef: {
          current: () => 0,
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    let switchModePromise: Promise<void> | null = null;
    await act(async () => {
      switchModePromise = result.current.switchMode('paged');
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await act(async () => {
      runtime.pagedStateRef.current = {
        pageCount: 2,
        pageIndex: 1,
      };
      expect(result.current.handleRestoreSettled('completed')).toBe(false);
      await Promise.resolve();
    });

    await expect(switchModePromise).resolves.toBeUndefined();
    expect(result.current.modeSwitchError).toBeNull();
    vi.useRealTimers();
  });

  it('consumes strict restore-settled results that arrive before the transaction reaches restore_target', async () => {
    vi.useFakeTimers();
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    const captureFlush = createDeferredPromise();
    const targetFlush = createDeferredPromise();
    vi.spyOn(readerSessionStore, 'flushPersistence')
      .mockImplementationOnce(() => captureFlush.promise)
      .mockImplementationOnce(() => targetFlush.promise);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot').mockImplementation(() => {
      return createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      });
    });

    const locator = createLocator({
      blockIndex: 18,
      chapterIndex: 7,
      lineIndex: 6,
    });
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: locator,
            hints: {
              chapterProgress: 0.4,
              contentMode: 'scroll',
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState: vi.fn(),
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        chapterIndex: 7,
        mode: 'scroll',
        pendingRestoreTarget: null,
      },
      runtime: {
        getCurrentOriginalLocatorRef: {
          current: () => locator,
        },
        pagedStateRef: {
          current: { pageCount: 20, pageIndex: 0 },
        },
        resolvePagedLocatorPageIndexRef: {
          current: () => 5,
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    let switchModePromise: Promise<void> | null = null;
    await act(async () => {
      switchModePromise = result.current.switchMode('paged');
      await Promise.resolve();
    });

    await act(async () => {
      captureFlush.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      runtime.pagedStateRef.current = {
        pageCount: 20,
        pageIndex: 5,
      };
      expect(result.current.handleRestoreSettled('completed')).toBe(false);
    });

    await act(async () => {
      targetFlush.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10000);
    });

    await expect(switchModePromise).resolves.toBeUndefined();
    expect(result.current.modeSwitchError).toBeNull();
    vi.useRealTimers();
  });

  it('accepts strict paged-to-scroll completion when the resolved scroll target clamps to maxScroll', async () => {
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    vi.spyOn(readerSessionStore, 'flushPersistence').mockResolvedValue(undefined);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot').mockImplementation(() => {
      return createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      });
    });

    const pagedLocator = createLocator({
      blockIndex: 22,
      chapterIndex: 5,
      lineIndex: 4,
      pageIndex: 3,
    });
    const contentRef = {
      current: makeClampedContainer({
        clientHeight: 600,
        scrollHeight: 14327,
        scrollTop: 0,
      }),
    };
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: pagedLocator,
            hints: {
              chapterProgress: 0.4,
              contentMode: 'paged',
              pageIndex: 3,
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState: vi.fn(),
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        chapterIndex: 5,
        mode: 'paged',
        pendingRestoreTarget: null,
      },
      runtime: {
        contentRef,
        getCurrentPagedLocatorRef: {
          current: () => pagedLocator,
        },
        resolveScrollLocatorOffsetRef: {
          current: () => 16582,
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    let switchModePromise: Promise<void> | null = null;
    await act(async () => {
      switchModePromise = result.current.switchMode('scroll');
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      contentRef.current.scrollTop = 16402;
      expect(contentRef.current.scrollTop).toBe(13727);
      expect(result.current.handleRestoreSettled('completed')).toBe(false);
    });

    await expect(switchModePromise).resolves.toBeUndefined();
    expect(result.current.modeSwitchError).toBeNull();
  });

  it('waits for strict paged-to-scroll verification until the scroll layout settles', async () => {
    const animationFrames = createAnimationFrameController();
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    vi.spyOn(readerSessionStore, 'flushPersistence').mockResolvedValue(undefined);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot').mockImplementation(() => {
      return createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      });
    });

    const pagedLocator = createLocator({
      blockIndex: 22,
      chapterIndex: 5,
      lineIndex: 4,
      pageIndex: 3,
    });
    const contentRef = {
      current: makeContainer({
        clientHeight: 600,
        scrollHeight: 25000,
        scrollTop: 13727,
      }),
    };
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: pagedLocator,
            hints: {
              chapterProgress: 0.4,
              contentMode: 'paged',
              pageIndex: 3,
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState: vi.fn(),
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        chapterIndex: 5,
        mode: 'paged',
        pendingRestoreTarget: null,
      },
      runtime: {
        contentRef,
        getCurrentPagedLocatorRef: {
          current: () => pagedLocator,
        },
        resolveScrollLocatorOffsetRef: {
          current: () => 18311,
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    try {
      let switchModePromise: Promise<void> | null = null;
      let promiseState: 'pending' | 'resolved' | 'rejected' = 'pending';

      await act(async () => {
        switchModePromise = result.current.switchMode('scroll');
        switchModePromise.then(
          () => {
            promiseState = 'resolved';
          },
          () => {
            promiseState = 'rejected';
          },
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      act(() => {
        expect(result.current.handleRestoreSettled('completed')).toBe(false);
      });

      expect(promiseState).toBe('pending');

      act(() => {
        contentRef.current.scrollTop = 18131;
      });

      await animationFrames.flushAnimationFrames();
      await expect(switchModePromise).resolves.toBeUndefined();
      expect(promiseState).toBe('resolved');
      expect(result.current.modeSwitchError).toBeNull();
    } finally {
      animationFrames.restore();
    }
  });

  it('prefers the settled scroll locator over raw scrollTop during strict paged-to-scroll verification', async () => {
    const animationFrames = createAnimationFrameController();
    setDebugFeatureEnabled('readerStrictModeSwitch', true);
    vi.spyOn(readerSessionStore, 'flushPersistence').mockResolvedValue(undefined);
    vi.spyOn(readerSessionStore, 'getReaderSessionSnapshot').mockImplementation(() => {
      return createSessionStoreSnapshotMock({
        lastPersistenceFailure: null,
        persistenceStatus: 'healthy',
      });
    });

    const pagedLocator = createLocator({
      blockIndex: 22,
      chapterIndex: 5,
      lineIndex: 4,
      pageIndex: 3,
    });
    const settledScrollLocator = createLocator({
      blockIndex: 22,
      chapterIndex: 5,
      lineIndex: 4,
    });
    const contentRef = {
      current: makeContainer({
        clientHeight: 600,
        scrollHeight: 25000,
        scrollTop: 13727,
      }),
    };
    const getCurrentOriginalLocatorRef = {
      current: () => null as ReaderLocator | null,
    };
    const { hookProps, runtime } = createHookHarness({
      sessionCommands: {
        latestReaderStateRef: {
          current: createStoredState({
            canonical: pagedLocator,
            hints: {
              chapterProgress: 0.4,
              contentMode: 'paged',
              pageIndex: 3,
              viewMode: 'original',
            },
          }),
        },
        markUserInteracted: vi.fn(),
        persistReaderState: vi.fn(),
        setChapterIndex: vi.fn(),
        setMode: vi.fn(),
      },
      sessionSnapshot: {
        chapterIndex: 5,
        mode: 'paged',
        pendingRestoreTarget: null,
      },
      runtime: {
        contentRef,
        getCurrentOriginalLocatorRef,
        getCurrentPagedLocatorRef: {
          current: () => pagedLocator,
        },
        resolveScrollLocatorOffsetRef: {
          current: (locator) => {
            if (locator.lineIndex === settledScrollLocator.lineIndex) {
              return 15546;
            }
            return 15546;
          },
        },
      },
    });
    const { result } = renderHook(() => useReaderRestoreFlow(hookProps), {
      wrapper: runtime.Wrapper,
    });

    try {
      let switchModePromise: Promise<void> | null = null;
      await act(async () => {
        switchModePromise = result.current.switchMode('scroll');
        await Promise.resolve();
        await Promise.resolve();
      });

      act(() => {
        getCurrentOriginalLocatorRef.current = () => settledScrollLocator;
        expect(result.current.handleRestoreSettled('completed')).toBe(false);
      });

      await animationFrames.flushAnimationFrames();
      await expect(switchModePromise).resolves.toBeUndefined();
      expect(result.current.modeSwitchError).toBeNull();
    } finally {
      animationFrames.restore();
    }
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
