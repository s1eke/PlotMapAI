import type { ReactNode } from 'react';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReaderProvider, useReaderContext } from '../ReaderContext';

function createWrapper(novelId = 1) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ReaderProvider novelId={novelId}>
        {children}
      </ReaderProvider>
    );
  };
}

describe('ReaderProvider', () => {
  it('provides stable UI bridge refs across rerenders', () => {
    const { result, rerender } = renderHook(() => useReaderContext(), {
      wrapper: createWrapper(),
    });

    const initialRefs = {
      contentRef: result.current.contentRef,
      pageTargetRef: result.current.pageTargetRef,
      chapterCacheRef: result.current.chapterCacheRef,
      pagedStateRef: result.current.pagedStateRef,
      restoreSettledHandlerRef: result.current.restoreSettledHandlerRef,
    };

    rerender();

    expect(result.current.contentRef).toBe(initialRefs.contentRef);
    expect(result.current.pageTargetRef).toBe(initialRefs.pageTargetRef);
    expect(result.current.chapterCacheRef).toBe(initialRefs.chapterCacheRef);
    expect(result.current.pagedStateRef).toBe(initialRefs.pagedStateRef);
    expect(result.current.restoreSettledHandlerRef).toBe(initialRefs.restoreSettledHandlerRef);
  });

  it('keeps mutable bridge state writable for page orchestration', () => {
    const { result } = renderHook(() => useReaderContext(), {
      wrapper: createWrapper(),
    });

    const onRestoreSettled = () => undefined;

    act(() => {
      result.current.pageTargetRef.current = 'end';
      result.current.chapterChangeSourceRef.current = 'navigation';
      result.current.pagedStateRef.current = { pageCount: 4, pageIndex: 2 };
      result.current.restoreSettledHandlerRef.current = onRestoreSettled;
      result.current.isScrollSyncSuppressedRef.current = true;
      result.current.chapterCacheRef.current.set(3, {
        index: 3,
        title: 'Chapter 4',
        content: 'content',
        wordCount: 100,
        totalChapters: 4,
        hasPrev: true,
        hasNext: false,
      });
    });

    expect(result.current.pageTargetRef.current).toBe('end');
    expect(result.current.chapterChangeSourceRef.current).toBe('navigation');
    expect(result.current.pagedStateRef.current).toEqual({ pageCount: 4, pageIndex: 2 });
    expect(result.current.restoreSettledHandlerRef.current).toBe(onRestoreSettled);
    expect(result.current.isScrollSyncSuppressedRef.current).toBe(true);
    expect(result.current.chapterCacheRef.current.get(3)?.title).toBe('Chapter 4');
  });

  it('resets the bridge when the page mounts for a different novel', () => {
    const firstRender = renderHook(() => useReaderContext(), {
      wrapper: createWrapper(1),
    });

    act(() => {
      firstRender.result.current.pageTargetRef.current = 'end';
      firstRender.result.current.chapterCacheRef.current.set(1, {
        index: 1,
        title: 'Persisted Chapter',
        content: 'content',
        wordCount: 50,
        totalChapters: 2,
        hasPrev: true,
        hasNext: false,
      });
    });

    firstRender.unmount();

    const secondRender = renderHook(() => useReaderContext(), {
      wrapper: createWrapper(2),
    });

    expect(secondRender.result.current.pageTargetRef.current).toBeNull();
    expect(secondRender.result.current.chapterCacheRef.current.size).toBe(0);
  });
});
