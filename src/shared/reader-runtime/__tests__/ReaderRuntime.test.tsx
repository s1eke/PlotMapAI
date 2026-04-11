import type { ReactNode } from 'react';
import type { ReaderContentRuntimeValue, ReaderLocator } from '@shared/contracts/reader';

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ReaderContentRuntimeContextProvider,
  ReaderRuntimeProvider,
  useReaderContentRuntime,
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '../ReaderRuntime';

function createContentRuntime(): ReaderContentRuntimeValue {
  return {
    getChapters: vi.fn(async () => []),
    getChapterContent: vi.fn(async () => {
      throw new Error('not configured');
    }),
    getImageBlob: vi.fn(async () => null),
    getImageGalleryEntries: vi.fn(async () => []),
    loadPurifiedBookChapters: vi.fn(async () => []),
  };
}

function createWrapper(contentRuntime: ReaderContentRuntimeValue = createContentRuntime()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ReaderRuntimeProvider>
        <ReaderContentRuntimeContextProvider value={contentRuntime}>
          {children}
        </ReaderContentRuntimeContextProvider>
      </ReaderRuntimeProvider>
    );
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

  async function flushNextAnimationFrame(): Promise<void> {
    const nextCallback = frameCallbacks.shift() ?? null;
    await act(async () => {
      nextCallback?.(0);
      await Promise.resolve();
    });
  }

  return {
    cancelAnimationFrameSpy,
    flushNextAnimationFrame,
    restore() {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    },
  };
}

function useRuntimeHarness() {
  return {
    content: useReaderContentRuntime(),
    layout: useReaderLayoutQueries(),
    navigation: useReaderNavigationRuntime(),
    persistence: useReaderPersistenceRuntime(),
    viewport: useReaderViewportContext(),
  };
}

const hookCases = [
  ['useReaderViewportContext', () => useReaderViewportContext()],
  ['useReaderContentRuntime', () => useReaderContentRuntime()],
  ['useReaderNavigationRuntime', () => useReaderNavigationRuntime()],
  ['useReaderLayoutQueries', () => useReaderLayoutQueries()],
  ['useReaderPersistenceRuntime', () => useReaderPersistenceRuntime()],
] as const;

describe('ReaderRuntime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(hookCases)('%s throws outside the runtime providers', (hookName, useHook) => {
    expect(() => renderHook(() => useHook())).toThrowError(
      `${hookName} must be used within a ReaderRuntimeProvider`,
    );
  });

  it('keeps runtime state writable and releases registered resolvers and element bridges', () => {
    const contentRuntime = createContentRuntime();
    const chapterElement = document.createElement('div');
    const chapterBodyElement = document.createElement('div');
    const anchor = { chapterIndex: 1, chapterProgress: 0.35 };
    const originalLocator: ReaderLocator = {
      blockIndex: 2,
      chapterIndex: 1,
      kind: 'text',
      pageIndex: 0,
    };
    const pagedLocator: ReaderLocator = {
      blockIndex: 4,
      chapterIndex: 1,
      kind: 'heading',
      pageIndex: 2,
    };
    const scrollOffsetTarget: ReaderLocator = {
      blockIndex: 9,
      chapterIndex: 1,
      kind: 'image',
      pageIndex: 0,
    };
    const { result } = renderHook(() => useRuntimeHarness(), {
      wrapper: createWrapper(contentRuntime),
    });

    let cleanupAnchorResolver = () => {};
    let cleanupOriginalLocatorResolver = () => {};
    let cleanupPagedLocatorResolver = () => {};
    let cleanupScrollOffsetResolver = () => {};

    act(() => {
      result.current.navigation.setChapterChangeSource('navigation');
      result.current.navigation.setPendingPageTarget('end');
      result.current.navigation.setPagedState({ pageCount: 4, pageIndex: 2 });
      cleanupAnchorResolver = result.current.layout.registerCurrentAnchorResolver(() => anchor);
      cleanupOriginalLocatorResolver =
        result.current.layout.registerCurrentOriginalLocatorResolver(() => originalLocator);
      cleanupPagedLocatorResolver =
        result.current.layout.registerCurrentPagedLocatorResolver(() => pagedLocator);
      cleanupScrollOffsetResolver = result.current.layout.registerScrollLocatorOffsetResolver(
        (locator) => (locator === scrollOffsetTarget ? 320 : null),
      );
      result.current.layout.registerScrollChapterElement(1, chapterElement);
      result.current.layout.registerScrollChapterBodyElement(1, chapterBodyElement);
      result.current.viewport.contentRef.current = chapterBodyElement;
      result.current.viewport.pagedViewportRef.current = chapterElement;
    });

    expect(result.current.content.getChapters).toBe(contentRuntime.getChapters);
    expect(result.current.navigation.getChapterChangeSource()).toBe('navigation');
    expect(result.current.navigation.getPendingPageTarget()).toBe('end');
    expect(result.current.navigation.getPagedState()).toEqual({ pageCount: 4, pageIndex: 2 });
    expect(result.current.layout.getCurrentAnchor()).toEqual(anchor);
    expect(result.current.layout.getCurrentOriginalLocator()).toEqual(originalLocator);
    expect(result.current.layout.getCurrentPagedLocator()).toEqual(pagedLocator);
    expect(result.current.layout.getScrollChapterElement(1)).toBe(chapterElement);
    expect(result.current.layout.getScrollChapterBodyElement(1)).toBe(chapterBodyElement);
    expect(result.current.layout.hasScrollChapterBodyElement(1)).toBe(true);
    expect(result.current.layout.resolveScrollLocatorOffset(scrollOffsetTarget)).toBe(320);
    expect(result.current.viewport.contentRef.current).toBe(chapterBodyElement);
    expect(result.current.viewport.pagedViewportRef.current).toBe(chapterElement);

    act(() => {
      cleanupAnchorResolver();
      cleanupOriginalLocatorResolver();
      cleanupPagedLocatorResolver();
      cleanupScrollOffsetResolver();
      result.current.layout.clearScrollChapterElements();
      result.current.layout.clearScrollChapterBodyElements();
    });

    expect(result.current.layout.getCurrentAnchor()).toBeNull();
    expect(result.current.layout.getCurrentOriginalLocator()).toBeNull();
    expect(result.current.layout.getCurrentPagedLocator()).toBeNull();
    expect(result.current.layout.resolveScrollLocatorOffset(scrollOffsetTarget)).toBeNull();
    expect(result.current.layout.getScrollChapterElement(1)).toBeNull();
    expect(result.current.layout.getScrollChapterBodyElement(1)).toBeNull();
    expect(result.current.layout.hasScrollChapterBodyElement(1)).toBe(false);
  });

  it('registers before-flush and restore-settled handlers and cleans them up', () => {
    const beforeFlushHandlerA = vi.fn();
    const beforeFlushHandlerB = vi.fn();
    const restoreSettledHandler = vi.fn();
    const { result } = renderHook(() => useRuntimeHarness(), {
      wrapper: createWrapper(),
    });

    let cleanupBeforeFlushHandlerA = () => {};
    let cleanupBeforeFlushHandlerB = () => {};
    let cleanupRestoreSettledHandler = () => {};

    act(() => {
      cleanupBeforeFlushHandlerA =
        result.current.persistence.registerBeforeFlush(beforeFlushHandlerA);
      cleanupBeforeFlushHandlerB =
        result.current.persistence.registerBeforeFlush(beforeFlushHandlerB);
      cleanupRestoreSettledHandler =
        result.current.persistence.registerRestoreSettledHandler(restoreSettledHandler);
    });

    act(() => {
      cleanupBeforeFlushHandlerA();
      result.current.persistence.runBeforeFlush();
      result.current.persistence.notifyRestoreSettled('completed');
    });

    expect(beforeFlushHandlerA).not.toHaveBeenCalled();
    expect(beforeFlushHandlerB).toHaveBeenCalledTimes(1);
    expect(restoreSettledHandler).toHaveBeenCalledWith('completed');

    act(() => {
      cleanupBeforeFlushHandlerB();
      cleanupRestoreSettledHandler();
      result.current.persistence.runBeforeFlush();
      result.current.persistence.notifyRestoreSettled('failed');
    });

    expect(beforeFlushHandlerB).toHaveBeenCalledTimes(1);
    expect(restoreSettledHandler).toHaveBeenCalledTimes(1);
  });

  it('releases temporary scroll sync suppression after two animation frames', async () => {
    const animationFrameController = createAnimationFrameController();
    const { result } = renderHook(() => useRuntimeHarness(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.persistence.suppressScrollSyncTemporarily();
    });

    expect(result.current.persistence.isScrollSyncSuppressed()).toBe(true);

    await animationFrameController.flushNextAnimationFrame();
    expect(result.current.persistence.isScrollSyncSuppressed()).toBe(true);

    await animationFrameController.flushNextAnimationFrame();
    expect(result.current.persistence.isScrollSyncSuppressed()).toBe(false);

    animationFrameController.restore();
  });

  it('cancels a pending scroll sync release frame on unmount', () => {
    const animationFrameController = createAnimationFrameController();
    const { result, unmount } = renderHook(() => useRuntimeHarness(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.persistence.suppressScrollSyncTemporarily();
    });

    unmount();

    expect(animationFrameController.cancelAnimationFrameSpy).toHaveBeenCalledWith(1);

    animationFrameController.restore();
  });
});
