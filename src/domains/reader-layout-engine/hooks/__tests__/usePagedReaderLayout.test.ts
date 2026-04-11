import type { Dispatch, SetStateAction } from 'react';
import type { ReaderRestoreResult, ReaderRestoreTarget } from '@shared/contracts/reader';
import type { PaginatedChapterLayout } from '../../utils/readerLayout';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getPagedMeasuredPageTurnStep,
  getPagedPageCount,
  getPagedScrollLeft,
  usePagedReaderLayout,
} from '../usePagedReaderLayout';

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
  currentPagedLayout?: PaginatedChapterLayout | null;
  enabled?: boolean;
  pageIndex?: number;
  pageTarget?: 'start' | 'end' | null;
  paragraphSpacing?: number;
  pendingRestoreTarget?: {
    chapterIndex: number;
    mode: 'paged';
    locator?: {
      blockIndex: number;
      chapterIndex: number;
      kind: 'heading' | 'text' | 'image';
      pageIndex?: number;
    };
  } | null;
  pagedViewportElement?: HTMLDivElement | null;
  pagedContentElement?: HTMLDivElement | null;
  getRestoreAttempt?: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult?: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => { scheduledRetry: boolean };
  notifyRestoreSettled?: (status: 'completed' | 'failed' | 'skipped') => void;
  setPageCount?: Dispatch<SetStateAction<number>>;
  setPageIndex?: Dispatch<SetStateAction<number>>;
}) {
  return {
    chapterIndex: 0,
    currentChapter: { title: 'Chapter 1' },
    currentPagedLayout: overrides?.currentPagedLayout ?? null,
    isLoading: false,
    enabled: overrides?.enabled ?? true,
    pagedViewportElement: overrides?.pagedViewportElement ?? null,
    pagedContentElement: overrides?.pagedContentElement ?? null,
    pageIndex: overrides?.pageIndex ?? 0,
    pendingPageTarget: overrides?.pageTarget ?? null,
    pendingRestoreTarget: overrides?.pendingRestoreTarget ?? null,
    pendingRestoreTargetRef: { current: overrides?.pendingRestoreTarget ?? null },
    getRestoreAttempt: overrides?.getRestoreAttempt ?? (() => 0),
    recordRestoreResult: overrides?.recordRestoreResult ?? (() => ({ scheduledRetry: false })),
    clearPendingRestoreTarget: vi.fn(),
    clearPendingPageTarget: vi.fn(),
    notifyRestoreSettled: overrides?.notifyRestoreSettled ?? vi.fn(),
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

  it('derives the page turn step from the rendered column metrics when they differ from the ideal width', () => {
    expect(getPagedMeasuredPageTurnStep(599.5, 647.5, true, 276, 48)).toBe(648);
  });

  it('uses fractional viewport width for page positioning and clamps partial last pages', async () => {
    const animationFrames = createAnimationFrameController();
    const viewport = createViewport(599.5, 800);
    const content = createContent(() => 1500);
    const setPageCount = vi.fn();
    const setPageIndex = vi.fn();

    const { rerender } = renderHook(
      (props: ReturnType<typeof createHookProps>) => usePagedReaderLayout(props),
      {
        initialProps: createHookProps({
          pagedViewportElement: viewport,
          pagedContentElement: content,
          setPageCount,
          setPageIndex,
        }),
      },
    );

    await animationFrames.flushAnimationFrames();
    expect(setPageCount).toHaveBeenLastCalledWith(3);

    act(() => {
      rerender(createHookProps({
        pageIndex: 1,
        pagedViewportElement: viewport,
        pagedContentElement: content,
        setPageCount,
        setPageIndex,
      }));
    });
    await animationFrames.flushAnimationFrames();
    expect(viewport.scrollLeft).toBeCloseTo(647.5, 4);

    act(() => {
      rerender(createHookProps({
        pageIndex: 2,
        pagedViewportElement: viewport,
        pagedContentElement: content,
        setPageCount,
        setPageIndex,
      }));
    });
    await animationFrames.flushAnimationFrames();
    expect(viewport.scrollLeft).toBeCloseTo(900.5, 4);

    animationFrames.restore();
  });

  it('uses the browser-resolved column width to calibrate paged offsets', async () => {
    const animationFrames = createAnimationFrameController();
    const viewport = createViewport(599.5, 800);
    const content = createContent(() => 1500);
    const setPageCount = vi.fn();
    const setPageIndex = vi.fn();
    const originalGetComputedStyle = window.getComputedStyle.bind(window);
    const getComputedStyleSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((element: Element) => {
        const style = originalGetComputedStyle(element);
        if (element === content) {
          return {
            ...style,
            columnWidth: '276px',
            columnGap: '48px',
          };
        }
        return style;
      });

    const { result, rerender } = renderHook(
      (props: ReturnType<typeof createHookProps>) => usePagedReaderLayout(props),
      {
        initialProps: createHookProps({
          pagedViewportElement: viewport,
          pagedContentElement: content,
          setPageCount,
          setPageIndex,
        }),
      },
    );

    await animationFrames.flushAnimationFrames();
    expect(result.current.pageTurnStep).toBe(648);

    act(() => {
      rerender(createHookProps({
        pageIndex: 1,
        pagedViewportElement: viewport,
        pagedContentElement: content,
        setPageCount,
        setPageIndex,
      }));
    });
    await animationFrames.flushAnimationFrames();

    expect(viewport.scrollLeft).toBeCloseTo(648, 4);

    getComputedStyleSpy.mockRestore();
    animationFrames.restore();
  });

  it('remeasures once paged elements attach after the initial null render', async () => {
    const animationFrames = createAnimationFrameController();
    const viewport = createViewport(600, 800);
    const content = createContent(() => 1896);
    const setPageCount = vi.fn();
    const setPageIndex = vi.fn();

    const { rerender } = renderHook(
      (props: ReturnType<typeof createHookProps>) => usePagedReaderLayout(props),
      {
        initialProps: createHookProps({
          pagedViewportElement: null,
          pagedContentElement: null,
          setPageCount,
          setPageIndex,
        }),
      },
    );

    await animationFrames.flushAnimationFrames();
    expect(setPageCount).toHaveBeenLastCalledWith(1);

    act(() => {
      rerender(createHookProps({
        pagedViewportElement: viewport,
        pagedContentElement: content,
        setPageCount,
        setPageIndex,
      }));
    });

    await animationFrames.flushAnimationFrames();
    expect(setPageCount).toHaveBeenLastCalledWith(3);

    animationFrames.restore();
  });

  it('remeasures when paragraph spacing changes', async () => {
    const animationFrames = createAnimationFrameController();
    const viewport = createViewport(600, 800);
    let scrollWidth = 1248;
    const content = createContent(() => scrollWidth);
    const setPageCount = vi.fn();
    const setPageIndex = vi.fn();

    const { rerender } = renderHook(
      (props: ReturnType<typeof createHookProps>) => usePagedReaderLayout(props),
      {
        initialProps: createHookProps({
          pagedViewportElement: viewport,
          pagedContentElement: content,
          paragraphSpacing: 16,
          setPageCount,
          setPageIndex,
        }),
      },
    );

    await animationFrames.flushAnimationFrames();
    expect(setPageCount).toHaveBeenLastCalledWith(2);

    scrollWidth = 1896;

    act(() => {
      rerender(createHookProps({
        pagedViewportElement: viewport,
        pagedContentElement: content,
        paragraphSpacing: 32,
        setPageCount,
        setPageIndex,
      }));
    });

    await animationFrames.flushAnimationFrames();
    expect(setPageCount).toHaveBeenLastCalledWith(3);

    animationFrames.restore();
  });

  it('restores the target page from locator pageIndex when available', async () => {
    const animationFrames = createAnimationFrameController();
    const viewport = createViewport(600, 800);
    const content = createContent(() => 1896);
    const setPageCount = vi.fn();
    const setPageIndex = vi.fn();
    const clearPendingRestoreTarget = vi.fn();
    const stopRestoreMask = vi.fn();

    renderHook(() => usePagedReaderLayout({
      ...createHookProps({
        pagedViewportElement: viewport,
        pagedContentElement: content,
        pendingRestoreTarget: {
          chapterIndex: 0,
          mode: 'paged',
          locator: {
            blockIndex: 6,
            chapterIndex: 0,
            kind: 'text',
            pageIndex: 2,
          },
        },
        setPageCount,
        setPageIndex,
      }),
      clearPendingRestoreTarget,
      stopRestoreMask,
    }));

    await animationFrames.flushAnimationFrames();

    expect(setPageCount).toHaveBeenLastCalledWith(3);
    expect(setPageIndex).toHaveBeenLastCalledWith(2);
    expect(clearPendingRestoreTarget).toHaveBeenCalled();
    expect(stopRestoreMask).toHaveBeenCalled();

    animationFrames.restore();
  });

  it('does not reapply the current page index during ordinary paged turns', async () => {
    const animationFrames = createAnimationFrameController();
    const viewport = createViewport(600, 800);
    const content = createContent(() => 1896);
    const setPageCount = vi.fn();
    const setPageIndex = vi.fn();

    const { rerender } = renderHook(
      (props: ReturnType<typeof createHookProps>) => usePagedReaderLayout(props),
      {
        initialProps: createHookProps({
          pagedViewportElement: viewport,
          pagedContentElement: content,
          pageIndex: 0,
          setPageCount,
          setPageIndex,
        }),
      },
    );

    await animationFrames.flushAnimationFrames();
    setPageIndex.mockClear();

    act(() => {
      rerender(createHookProps({
        pagedViewportElement: viewport,
        pagedContentElement: content,
        pageIndex: 1,
        setPageCount,
        setPageIndex,
      }));
    });

    await animationFrames.flushAnimationFrames();
    expect(setPageIndex).not.toHaveBeenCalled();

    animationFrames.restore();
  });
});
