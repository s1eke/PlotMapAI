import type { ReactNode } from 'react';

import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistenceMocks = vi.hoisted(() => ({
  flushReaderPreferencesPersistence: vi.fn(async () => undefined),
  flushReaderStateWithCapture: vi.fn(async () => undefined),
}));

vi.mock('@domains/reader-session', () => ({
  flushReaderStateWithCapture: persistenceMocks.flushReaderStateWithCapture,
}));

vi.mock('../../../hooks/readerPreferencesStore', () => ({
  flushReaderPreferencesPersistence: persistenceMocks.flushReaderPreferencesPersistence,
}));

import { ReaderProvider, useReaderContext } from '../ReaderContext';

function createContentRuntime() {
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

function createWrapper(novelId = 1) {
  const contentRuntime = createContentRuntime();

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ReaderProvider contentRuntime={contentRuntime} novelId={novelId}>
        {children}
      </ReaderProvider>
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

  async function flushNextAnimationFrame() {
    if (frameCallbacks.length === 0) {
      return;
    }

    const queuedCallbacks = frameCallbacks.splice(0, frameCallbacks.length);
    await act(async () => {
      queuedCallbacks.forEach((callback) => callback?.(0));
      await Promise.resolve();
    });
  }

  return {
    flushNextAnimationFrame,
    restore() {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    },
  };
}

beforeEach(() => {
  persistenceMocks.flushReaderStateWithCapture.mockClear();
  persistenceMocks.flushReaderPreferencesPersistence.mockClear();
});

describe('ReaderProvider', () => {
  it('provides stable reader runtime bindings across rerenders', () => {
    const { result, rerender } = renderHook(() => useReaderContext(), {
      wrapper: createWrapper(),
    });

    const initialBindings = {
      contentRef: result.current.contentRef,
      pagedViewportRef: result.current.pagedViewportRef,
      getChapters: result.current.getChapters,
      getPendingPageTarget: result.current.getPendingPageTarget,
      setPendingPageTarget: result.current.setPendingPageTarget,
      getPagedState: result.current.getPagedState,
      setPagedState: result.current.setPagedState,
    };

    rerender();

    expect(result.current.contentRef).toBe(initialBindings.contentRef);
    expect(result.current.pagedViewportRef).toBe(initialBindings.pagedViewportRef);
    expect(result.current.getChapters).toBe(initialBindings.getChapters);
    expect(result.current.getPendingPageTarget).toBe(initialBindings.getPendingPageTarget);
    expect(result.current.setPendingPageTarget).toBe(initialBindings.setPendingPageTarget);
    expect(result.current.getPagedState).toBe(initialBindings.getPagedState);
    expect(result.current.setPagedState).toBe(initialBindings.setPagedState);
  });

  it('keeps runtime state writable for page orchestration', () => {
    const { result } = renderHook(() => useReaderContext(), {
      wrapper: createWrapper(),
    });

    const onRestoreSettled = createNoopHandler();

    act(() => {
      result.current.setPendingPageTarget('end');
      result.current.setChapterChangeSource('navigation');
      result.current.setPagedState({ pageCount: 4, pageIndex: 2 });
      result.current.registerRestoreSettledHandler(onRestoreSettled);
      result.current.suppressScrollSyncTemporarily();
      result.current.notifyRestoreSettled('completed');
    });

    expect(result.current.getPendingPageTarget()).toBe('end');
    expect(result.current.getChapterChangeSource()).toBe('navigation');
    expect(result.current.getPagedState()).toEqual({ pageCount: 4, pageIndex: 2 });
    expect(result.current.getImageGalleryEntries).toBeTypeOf('function');
    expect(result.current.isScrollSyncSuppressed()).toBe(true);
    expect(onRestoreSettled).toHaveBeenCalledWith('completed');
  });

  it('resets the runtime when the page mounts for a different novel', () => {
    const firstRender = renderHook(() => useReaderContext(), {
      wrapper: createWrapper(1),
    });

    act(() => {
      firstRender.result.current.setPendingPageTarget('end');
      firstRender.result.current.setPagedState({ pageCount: 3, pageIndex: 1 });
    });

    firstRender.unmount();

    const secondRender = renderHook(() => useReaderContext(), {
      wrapper: createWrapper(2),
    });

    expect(secondRender.result.current.getPendingPageTarget()).toBeNull();
    expect(secondRender.result.current.getPagedState()).toEqual({ pageCount: 1, pageIndex: 0 });
  });

  it('skips the StrictMode probe cleanup before the first animation frame', async () => {
    const animationFrames = createAnimationFrameController();
    const contentRuntime = createContentRuntime();

    try {
      const { unmount } = renderHook(() => useReaderContext(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <StrictMode>
            <ReaderProvider contentRuntime={contentRuntime} novelId={1}>
              {children}
            </ReaderProvider>
          </StrictMode>
        ),
      });

      expect(persistenceMocks.flushReaderStateWithCapture).not.toHaveBeenCalled();
      expect(persistenceMocks.flushReaderPreferencesPersistence).not.toHaveBeenCalled();

      await animationFrames.flushNextAnimationFrame();
      unmount();

      await waitFor(() => {
        expect(persistenceMocks.flushReaderStateWithCapture).toHaveBeenCalledTimes(1);
        expect(persistenceMocks.flushReaderPreferencesPersistence).toHaveBeenCalledTimes(1);
      });
    } finally {
      animationFrames.restore();
    }
  });
});

function createNoopHandler() {
  return vi.fn();
}
