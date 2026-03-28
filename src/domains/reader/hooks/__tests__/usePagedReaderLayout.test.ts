import type { Dispatch, RefObject, SetStateAction } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getPagedPageCount,
  getPagedScrollLeft,
  usePagedReaderLayout,
} from '../usePagedReaderLayout';

function createAnimationFrameController() {
  const frameCallbacks: Array<FrameRequestCallback | null> = [];
  const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
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

function createViewport(width: number, height: number): HTMLDivElement {
  const viewport = document.createElement('div');

  Object.defineProperty(viewport, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      toJSON: () => ({}),
    }),
  });

  Object.defineProperty(viewport, 'clientWidth', {
    configurable: true,
    get: () => Math.round(width),
  });
  Object.defineProperty(viewport, 'clientHeight', {
    configurable: true,
    get: () => Math.round(height),
  });

  return viewport;
}

function createContent(getScrollWidth: () => number): HTMLDivElement {
  const content = document.createElement('div');

  Object.defineProperty(content, 'scrollWidth', {
    configurable: true,
    get: () => getScrollWidth(),
  });

  return content;
}

function createHookProps(overrides?: {
  pageIndex?: number;
  paragraphSpacing?: number;
  pagedViewportRef?: RefObject<HTMLDivElement | null>;
  pagedContentRef?: RefObject<HTMLDivElement | null>;
  setPageCount?: Dispatch<SetStateAction<number>>;
  setPageIndex?: Dispatch<SetStateAction<number>>;
}) {
  return {
    chapterIndex: 0,
    currentChapter: { title: 'Chapter 1' },
    isLoading: false,
    isPagedMode: true,
    pagedViewportRef: overrides?.pagedViewportRef ?? { current: null },
    pagedContentRef: overrides?.pagedContentRef ?? { current: null },
    pageIndex: overrides?.pageIndex ?? 0,
    pageTargetRef: { current: 'start' as const },
    pendingRestoreStateRef: { current: null },
    clearPendingRestoreState: vi.fn(),
    stopRestoreMask: vi.fn(),
    setPageCount: overrides?.setPageCount ?? vi.fn(),
    setPageIndex: overrides?.setPageIndex ?? vi.fn(),
    fontSize: 18,
    lineSpacing: 1.8,
    paragraphSpacing: overrides?.paragraphSpacing ?? 16,
  };
}

describe('usePagedReaderLayout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('avoids adding a phantom page from subpixel overflow', () => {
    expect(getPagedPageCount(600.4, 600, 648)).toBe(1);
  });

  it('clamps the last page scroll position to the real maxScrollLeft', () => {
    expect(getPagedScrollLeft(2, 647.5, 900.5)).toBe(900.5);
  });

  it('uses fractional viewport width for page positioning and clamps partial last pages', async () => {
    const animationFrames = createAnimationFrameController();
    const viewport = createViewport(599.5, 800);
    const content = createContent(() => 1500);
    const setPageCount = vi.fn();
    const setPageIndex = vi.fn();

    const { rerender } = renderHook((props: ReturnType<typeof createHookProps>) => usePagedReaderLayout(props), {
      initialProps: createHookProps({
        pagedViewportRef: { current: viewport },
        pagedContentRef: { current: content },
        setPageCount,
        setPageIndex,
      }),
    });

    await animationFrames.flushAnimationFrames();

    expect(setPageCount).toHaveBeenLastCalledWith(3);

    act(() => {
      rerender(createHookProps({
        pageIndex: 1,
        pagedViewportRef: { current: viewport },
        pagedContentRef: { current: content },
        setPageCount,
        setPageIndex,
      }));
    });
    await animationFrames.flushAnimationFrames();
    expect(viewport.scrollLeft).toBeCloseTo(647.5, 4);

    act(() => {
      rerender(createHookProps({
        pageIndex: 2,
        pagedViewportRef: { current: viewport },
        pagedContentRef: { current: content },
        setPageCount,
        setPageIndex,
      }));
    });
    await animationFrames.flushAnimationFrames();
    expect(viewport.scrollLeft).toBeCloseTo(900.5, 4);

    animationFrames.restore();
  });

  it('remeasures when paragraph spacing changes', async () => {
    const animationFrames = createAnimationFrameController();
    const viewport = createViewport(600, 800);
    let scrollWidth = 1248;
    const content = createContent(() => scrollWidth);
    const setPageCount = vi.fn();
    const setPageIndex = vi.fn();

    const { rerender } = renderHook((props: ReturnType<typeof createHookProps>) => usePagedReaderLayout(props), {
      initialProps: createHookProps({
        pagedViewportRef: { current: viewport },
        pagedContentRef: { current: content },
        paragraphSpacing: 16,
        setPageCount,
        setPageIndex,
      }),
    });

    await animationFrames.flushAnimationFrames();
    expect(setPageCount).toHaveBeenLastCalledWith(2);

    scrollWidth = 1896;

    act(() => {
      rerender(createHookProps({
        pagedViewportRef: { current: viewport },
        pagedContentRef: { current: content },
        paragraphSpacing: 32,
        setPageCount,
        setPageIndex,
      }));
    });

    await animationFrames.flushAnimationFrames();
    expect(setPageCount).toHaveBeenLastCalledWith(3);

    animationFrames.restore();
  });
});
