import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  dispatchReaderLifecycleEvent,
  markUserInteracted,
  resetReaderSessionStoreForTests,
  setChapterIndex,
  useReaderSessionSelector,
} from '../readerSessionStore';

describe('sessionStore selectors', () => {
  beforeEach(() => {
    localStorage.clear();
    resetReaderSessionStoreForTests();
  });

  it('does not re-render primitive selectors for unrelated store updates', () => {
    let chapterSelectorRenderCount = 0;
    let restoreStatusSelectorRenderCount = 0;

    const chapterIndexHook = renderHook(() => {
      chapterSelectorRenderCount += 1;
      return useReaderSessionSelector((state) => state.chapterIndex);
    });
    const restoreStatusHook = renderHook(() => {
      restoreStatusSelectorRenderCount += 1;
      return useReaderSessionSelector((state) => state.restoreStatus);
    });

    expect(chapterIndexHook.result.current).toBe(0);
    expect(restoreStatusHook.result.current).toBe('hydrating');
    expect(chapterSelectorRenderCount).toBe(1);
    expect(restoreStatusSelectorRenderCount).toBe(1);

    act(() => {
      markUserInteracted();
    });

    expect(chapterSelectorRenderCount).toBe(1);
    expect(restoreStatusSelectorRenderCount).toBe(1);
  });

  it('re-renders selectors only when their selected value changes', () => {
    let chapterSelectorRenderCount = 0;
    let restoreStatusSelectorRenderCount = 0;

    const chapterIndexHook = renderHook(() => {
      chapterSelectorRenderCount += 1;
      return useReaderSessionSelector((state) => state.chapterIndex);
    });
    const restoreStatusHook = renderHook(() => {
      restoreStatusSelectorRenderCount += 1;
      return useReaderSessionSelector((state) => state.restoreStatus);
    });

    act(() => {
      setChapterIndex(3);
    });

    expect(chapterIndexHook.result.current).toBe(3);
    expect(chapterSelectorRenderCount).toBe(2);
    expect(restoreStatusSelectorRenderCount).toBe(1);

    act(() => {
      dispatchReaderLifecycleEvent({ type: 'HYDRATE_SUCCEEDED_NO_CHAPTERS' });
    });

    expect(restoreStatusHook.result.current).toBe('ready');
    expect(chapterSelectorRenderCount).toBe(2);
    expect(restoreStatusSelectorRenderCount).toBe(2);
  });
});
