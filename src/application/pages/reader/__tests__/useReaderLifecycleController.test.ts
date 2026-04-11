import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReaderContextWrapper } from '@test/readerRuntimeTestUtils';

import type {
  ReaderHydrateDataResult,
  ReaderLoadActiveChapterResult,
} from '@domains/reader-content';
import { useReaderLifecycleController } from '@application/pages/reader/useReaderLifecycleController';
import { resetReaderSessionStoreForTests } from '@domains/reader-session';
import type { ReaderRestoreTarget, StoredReaderState } from '@shared/contracts/reader';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function createStoredState(overrides: StoredReaderState = {}): StoredReaderState {
  return {
    chapterIndex: 1,
    mode: 'scroll',
    chapterProgress: undefined,
    lastContentMode: 'scroll',
    locator: undefined,
    ...overrides,
  };
}

function createRestoreTarget(
  overrides: Partial<ReaderRestoreTarget> = {},
): ReaderRestoreTarget {
  return {
    chapterIndex: 1,
    mode: 'scroll',
    chapterProgress: 0.4,
    locator: undefined,
    ...overrides,
  };
}

function createChapter(index: number) {
  return {
    index,
    title: `Chapter ${index + 1}`,
    wordCount: 100,
  };
}

function createChapterContent(index: number) {
  return {
    ...createChapter(index),
    plainText: `content-${index}`,
    richBlocks: [],
    contentFormat: 'plain' as const,
    contentVersion: 1,
    totalChapters: 10,
    hasPrev: index > 0,
    hasNext: index < 9,
  };
}

function createProps(
  overrides: Partial<Parameters<typeof useReaderLifecycleController>[0]> = {},
) {
  const hydrateReaderData = vi.fn<() => Promise<ReaderHydrateDataResult>>(async () => ({
    hasChapters: true,
    initialRestoreTarget: null,
    resolvedState: createStoredState(),
    storedState: createStoredState(),
  }));
  const loadActiveChapter = vi.fn<() => Promise<ReaderLoadActiveChapterResult>>(async () => ({
    navigationRestoreTarget: null,
    shouldClearNavigationSource: true,
    shouldResetViewport: true,
  }));
  const resetReaderContent = vi.fn();
  const clearPendingRestoreTarget = vi.fn();
  const setPendingRestoreTarget = vi.fn();
  const startRestoreMaskForTarget = vi.fn();
  const stopRestoreMask = vi.fn();

  return {
    novelId: 1,
    chapterIndex: 1,
    mode: 'scroll' as const,
    currentPagedLayoutChapterIndex: null,
    chapterData: {
      chapters: [createChapter(1)],
      currentChapter: null,
      loadingMessage: null,
      readerError: null,
      hydrateReaderData,
      loadActiveChapter,
      resetReaderContent,
    },
    restoreFlow: {
      pendingRestoreTarget: null,
      clearPendingRestoreTarget,
      setPendingRestoreTarget,
      startRestoreMaskForTarget,
      stopRestoreMask,
    },
    ...overrides,
  };
}

const { Wrapper } = createReaderContextWrapper();

describe('useReaderLifecycleController', () => {
  beforeEach(() => {
    resetReaderSessionStoreForTests();
  });

  it('drives hydration into restore and returns to ready when restore settles', async () => {
    const hydrateDeferred = createDeferred<ReaderHydrateDataResult>();
    const loadDeferred = createDeferred<ReaderLoadActiveChapterResult>();
    const restoreTarget = createRestoreTarget({
      chapterIndex: 2,
      chapterProgress: 0.55,
    });
    const hydrateReaderData = vi.fn(() => hydrateDeferred.promise);
    const loadActiveChapter = vi.fn(() => loadDeferred.promise);
    const setPendingRestoreTarget = vi.fn();
    const startRestoreMaskForTarget = vi.fn();

    const { result, rerender } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterIndex: 0,
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: 'loading',
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
        restoreFlow: {
          pendingRestoreTarget: null,
          clearPendingRestoreTarget: vi.fn(),
          setPendingRestoreTarget,
          startRestoreMaskForTarget,
          stopRestoreMask: vi.fn(),
        },
      }),
      wrapper: Wrapper,
    });

    expect(result.current.lifecycleStatus).toBe('loading-chapters');

    await act(async () => {
      hydrateDeferred.resolve({
        hasChapters: true,
        initialRestoreTarget: restoreTarget,
        resolvedState: createStoredState({ chapterIndex: 2, mode: 'scroll' }),
        storedState: createStoredState({ chapterIndex: 2, mode: 'scroll' }),
      });
      await Promise.resolve();
    });

    rerender(createProps({
      chapterIndex: 2,
      mode: 'scroll',
      chapterData: {
        chapters: [createChapter(2)],
        currentChapter: null,
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
      restoreFlow: {
        pendingRestoreTarget: null,
        clearPendingRestoreTarget: vi.fn(),
        setPendingRestoreTarget,
        startRestoreMaskForTarget,
        stopRestoreMask: vi.fn(),
      },
    }));

    await waitFor(() => {
      expect(loadActiveChapter).toHaveBeenCalledWith(
        {
          chapterIndex: 2,
          mode: 'scroll',
        },
        expect.objectContaining({
          navigationSource: null,
          pendingPageTarget: null,
        }),
      );
    });

    await act(async () => {
      loadDeferred.resolve({
        navigationRestoreTarget: null,
        shouldClearNavigationSource: true,
        shouldResetViewport: true,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('ready');
    });
    expect(setPendingRestoreTarget).toHaveBeenLastCalledWith(restoreTarget, { force: true });
    expect(startRestoreMaskForTarget).toHaveBeenLastCalledWith(restoreTarget);

    act(() => {
      result.current.handleRestoreSettled('completed');
    });

    expect(result.current.lifecycleStatus).toBe('ready');
  });

  it('uses hydrated load params even before session props catch up', async () => {
    const hydrateDeferred = createDeferred<ReaderHydrateDataResult>();
    const hydrateReaderData = vi.fn(() => hydrateDeferred.promise);
    const loadActiveChapter = vi.fn(async () => ({
      navigationRestoreTarget: null,
      shouldClearNavigationSource: true,
      shouldResetViewport: true,
    }));

    const { rerender } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterIndex: 0,
        mode: 'scroll',
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: 'loading',
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
      }),
      wrapper: Wrapper,
    });

    await act(async () => {
      hydrateDeferred.resolve({
        hasChapters: true,
        initialRestoreTarget: null,
        resolvedState: createStoredState({
          chapterIndex: 2,
          mode: 'paged',
          lastContentMode: 'paged',
        }),
        storedState: createStoredState({
          chapterIndex: 2,
          mode: 'paged',
          lastContentMode: 'paged',
        }),
      });
      await Promise.resolve();
    });

    rerender(createProps({
      chapterIndex: 0,
      mode: 'scroll',
      currentPagedLayoutChapterIndex: null,
      chapterData: {
        chapters: [createChapter(2)],
        currentChapter: null,
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
    }));

    await waitFor(() => {
      expect(loadActiveChapter).toHaveBeenCalledWith(
        {
          chapterIndex: 2,
          mode: 'paged',
        },
        expect.objectContaining({
          navigationSource: null,
          pendingPageTarget: null,
        }),
      );
    });
  });

  it('goes straight to ready when the loaded chapter has no restore target', async () => {
    const hydrateDeferred = createDeferred<ReaderHydrateDataResult>();
    const loadDeferred = createDeferred<ReaderLoadActiveChapterResult>();
    const hydrateReaderData = vi.fn(() => hydrateDeferred.promise);
    const loadActiveChapter = vi.fn(() => loadDeferred.promise);

    const { result, rerender } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterIndex: 0,
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: 'loading',
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
      }),
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('loading-chapters');
    });

    await act(async () => {
      hydrateDeferred.resolve({
        hasChapters: true,
        initialRestoreTarget: null,
        resolvedState: createStoredState({ chapterIndex: 3, mode: 'scroll' }),
        storedState: createStoredState({ chapterIndex: 3, mode: 'scroll' }),
      });
      await Promise.resolve();
    });

    rerender(createProps({
      chapterIndex: 3,
      mode: 'scroll',
      chapterData: {
        chapters: [createChapter(3)],
        currentChapter: createChapterContent(3),
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
    }));

    await act(async () => {
      loadDeferred.resolve({
        navigationRestoreTarget: null,
        shouldClearNavigationSource: true,
        shouldResetViewport: true,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('ready');
    });
  });

  it('keeps an existing mode-switch restore target when chapter load has no explicit target', async () => {
    const hydrateDeferred = createDeferred<ReaderHydrateDataResult>();
    const loadDeferred = createDeferred<ReaderLoadActiveChapterResult>();
    const persistedRestoreTarget = createRestoreTarget({
      chapterIndex: 2,
      mode: 'paged',
      locatorBoundary: 'start',
      chapterProgress: undefined,
    });
    const hydrateReaderData = vi.fn(() => hydrateDeferred.promise);
    const loadActiveChapter = vi.fn(() => loadDeferred.promise);
    const clearPendingRestoreTarget = vi.fn();
    const setPendingRestoreTarget = vi.fn();
    const startRestoreMaskForTarget = vi.fn();

    const { result, rerender } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterIndex: 0,
        mode: 'scroll',
        currentPagedLayoutChapterIndex: null,
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: 'loading',
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
        restoreFlow: {
          pendingRestoreTarget: null,
          clearPendingRestoreTarget,
          setPendingRestoreTarget,
          startRestoreMaskForTarget,
          stopRestoreMask: vi.fn(),
        },
      }),
      wrapper: Wrapper,
    });

    await act(async () => {
      hydrateDeferred.resolve({
        hasChapters: true,
        initialRestoreTarget: null,
        resolvedState: createStoredState({
          chapterIndex: 2,
          mode: 'paged',
          lastContentMode: 'paged',
        }),
        storedState: createStoredState({
          chapterIndex: 2,
          mode: 'paged',
          lastContentMode: 'paged',
        }),
      });
      await Promise.resolve();
    });

    rerender(createProps({
      chapterIndex: 2,
      mode: 'paged',
      currentPagedLayoutChapterIndex: null,
      chapterData: {
        chapters: [createChapter(2)],
        currentChapter: createChapterContent(2),
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
      restoreFlow: {
        pendingRestoreTarget: persistedRestoreTarget,
        clearPendingRestoreTarget,
        setPendingRestoreTarget,
        startRestoreMaskForTarget,
        stopRestoreMask: vi.fn(),
      },
    }));

    await act(async () => {
      loadDeferred.resolve({
        navigationRestoreTarget: null,
        shouldClearNavigationSource: true,
        shouldResetViewport: true,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('restoring-position');
    });
    expect(setPendingRestoreTarget).toHaveBeenLastCalledWith(
      persistedRestoreTarget,
      { force: true },
    );
    expect(startRestoreMaskForTarget).toHaveBeenLastCalledWith(persistedRestoreTarget);
    expect(clearPendingRestoreTarget).toHaveBeenCalledTimes(1);
  });

  it('keeps the loading overlay visible for paged restores until the layout consumes the restore target', async () => {
    const hydrateDeferred = createDeferred<ReaderHydrateDataResult>();
    const loadDeferred = createDeferred<ReaderLoadActiveChapterResult>();
    const restoreTarget = createRestoreTarget({
      chapterIndex: 2,
      mode: 'paged',
      chapterProgress: 0.5,
    });
    const hydrateReaderData = vi.fn(() => hydrateDeferred.promise);
    const loadActiveChapter = vi.fn(() => loadDeferred.promise);

    const { result, rerender } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterIndex: 0,
        mode: 'scroll',
        currentPagedLayoutChapterIndex: null,
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: 'loading',
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
        restoreFlow: {
          pendingRestoreTarget: null,
          clearPendingRestoreTarget: vi.fn(),
          setPendingRestoreTarget: vi.fn(),
          startRestoreMaskForTarget: vi.fn(),
          stopRestoreMask: vi.fn(),
        },
      }),
      wrapper: Wrapper,
    });

    await act(async () => {
      hydrateDeferred.resolve({
        hasChapters: true,
        initialRestoreTarget: restoreTarget,
        resolvedState: createStoredState({
          chapterIndex: 2,
          mode: 'paged',
          lastContentMode: 'paged',
        }),
        storedState: createStoredState({
          chapterIndex: 2,
          mode: 'paged',
          lastContentMode: 'paged',
        }),
      });
      await Promise.resolve();
    });

    rerender(createProps({
      chapterIndex: 2,
      mode: 'paged',
      currentPagedLayoutChapterIndex: null,
      chapterData: {
        chapters: [createChapter(2)],
        currentChapter: createChapterContent(2),
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
      restoreFlow: {
        pendingRestoreTarget: null,
        clearPendingRestoreTarget: vi.fn(),
        setPendingRestoreTarget: vi.fn(),
        startRestoreMaskForTarget: vi.fn(),
        stopRestoreMask: vi.fn(),
      },
    }));

    await act(async () => {
      loadDeferred.resolve({
        navigationRestoreTarget: restoreTarget,
        shouldClearNavigationSource: false,
        shouldResetViewport: true,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('awaiting-paged-layout');
    });
    expect(result.current.showLoadingOverlay).toBe(true);

    rerender(createProps({
      chapterIndex: 2,
      mode: 'paged',
      currentPagedLayoutChapterIndex: null,
      chapterData: {
        chapters: [createChapter(2)],
        currentChapter: createChapterContent(2),
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
      restoreFlow: {
        pendingRestoreTarget: restoreTarget,
        clearPendingRestoreTarget: vi.fn(),
        setPendingRestoreTarget: vi.fn(),
        startRestoreMaskForTarget: vi.fn(),
        stopRestoreMask: vi.fn(),
      },
    }));

    expect(result.current.showLoadingOverlay).toBe(true);

    rerender(createProps({
      chapterIndex: 2,
      mode: 'paged',
      currentPagedLayoutChapterIndex: 2,
      chapterData: {
        chapters: [createChapter(2)],
        currentChapter: createChapterContent(2),
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
      restoreFlow: {
        pendingRestoreTarget: null,
        clearPendingRestoreTarget: vi.fn(),
        setPendingRestoreTarget: vi.fn(),
        startRestoreMaskForTarget: vi.fn(),
        stopRestoreMask: vi.fn(),
      },
    }));

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('ready');
    });
    expect(result.current.showLoadingOverlay).toBe(false);
  });

  it('returns ready immediately when hydration finds no chapters', async () => {
    const hydrateReaderData = vi.fn(async () => ({
      hasChapters: false,
      initialRestoreTarget: null,
      resolvedState: null,
      storedState: createStoredState({ chapterIndex: 0 }),
    }));
    const loadActiveChapter = vi.fn(async () => ({
      navigationRestoreTarget: null,
      shouldClearNavigationSource: true,
      shouldResetViewport: false,
    }));

    const { result } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: null,
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
      }),
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('ready');
    });
    expect(loadActiveChapter).not.toHaveBeenCalled();
  });

  it('surfaces errors when the active chapter load fails', async () => {
    const hydrateReaderData = vi.fn(async () => ({
      hasChapters: true,
      initialRestoreTarget: null,
      resolvedState: createStoredState({ chapterIndex: 4, mode: 'scroll' }),
      storedState: createStoredState({ chapterIndex: 4, mode: 'scroll' }),
    }));
    const loadError = new Error('chapter load failed');
    const loadActiveChapter = vi.fn(async () => {
      throw loadError;
    });

    const { result, rerender } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterIndex: 0,
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: null,
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
      }),
      wrapper: Wrapper,
    });

    rerender(createProps({
      chapterIndex: 4,
      mode: 'scroll',
      chapterData: {
        chapters: [createChapter(4)],
        currentChapter: null,
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
    }));

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('error');
    });
    expect(result.current.readerError).toBe(loadError);
  });
});
