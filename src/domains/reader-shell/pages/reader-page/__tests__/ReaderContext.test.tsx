import type { ReactNode } from 'react';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
});

function createNoopHandler() {
  return vi.fn();
}
