import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  resetReaderSessionStoreForTests,
  setAppTheme,
  setChapterIndex,
  setReaderTheme,
  useReaderSessionSelector,
} from '../sessionStore';

describe('sessionStore selectors', () => {
  beforeEach(() => {
    localStorage.clear();
    resetReaderSessionStoreForTests();
  });

  it('does not re-render primitive selectors for unrelated store updates', () => {
    let chapterSelectorRenderCount = 0;
    let appThemeSelectorRenderCount = 0;

    const chapterIndexHook = renderHook(() => {
      chapterSelectorRenderCount += 1;
      return useReaderSessionSelector((state) => state.chapterIndex);
    });
    const appThemeHook = renderHook(() => {
      appThemeSelectorRenderCount += 1;
      return useReaderSessionSelector((state) => state.appTheme);
    });

    expect(chapterIndexHook.result.current).toBe(0);
    expect(appThemeHook.result.current).toBe('light');
    expect(chapterSelectorRenderCount).toBe(1);
    expect(appThemeSelectorRenderCount).toBe(1);

    act(() => {
      setReaderTheme('night');
    });

    expect(chapterSelectorRenderCount).toBe(1);
    expect(appThemeSelectorRenderCount).toBe(1);
  });

  it('re-renders selectors only when their selected value changes', () => {
    let chapterSelectorRenderCount = 0;
    let appThemeSelectorRenderCount = 0;

    const chapterIndexHook = renderHook(() => {
      chapterSelectorRenderCount += 1;
      return useReaderSessionSelector((state) => state.chapterIndex);
    });
    const appThemeHook = renderHook(() => {
      appThemeSelectorRenderCount += 1;
      return useReaderSessionSelector((state) => state.appTheme);
    });

    act(() => {
      setChapterIndex(3);
    });

    expect(chapterIndexHook.result.current).toBe(3);
    expect(chapterSelectorRenderCount).toBe(2);
    expect(appThemeSelectorRenderCount).toBe(1);

    act(() => {
      setAppTheme('dark');
    });

    expect(appThemeHook.result.current).toBe('dark');
    expect(chapterSelectorRenderCount).toBe(2);
    expect(appThemeSelectorRenderCount).toBe(2);
  });
});
