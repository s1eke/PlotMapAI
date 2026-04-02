import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import type { ChapterContent } from '../../readerContentService';
import type {
  ReaderContextValue,
} from '../../pages/reader-page/ReaderContext';
import type { ChapterChangeSource } from '../navigationTypes';
import type { ReaderRestoreTarget } from '../useReaderStatePersistence';

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scrollModeState = vi.hoisted(() => {
  let currentAnchor: { chapterIndex: number; chapterProgress: number } | null = null;
  let onReadingAnchorChange: ((
    anchor: { chapterIndex: number; chapterProgress: number },
  ) => void) | undefined;

  return {
    handleScroll: vi.fn(),
    scrollChapterElementsRef: { current: new Map<number, HTMLDivElement>() },
    scrollViewportTop: 0,
    syncViewportState: vi.fn(),
    emitAnchor(anchor: { chapterIndex: number; chapterProgress: number }) {
      currentAnchor = anchor;
      onReadingAnchorChange?.(anchor);
    },
    reset() {
      currentAnchor = null;
      onReadingAnchorChange = undefined;
      this.handleScroll.mockReset();
      this.scrollChapterElementsRef.current = new Map();
      this.scrollViewportTop = 0;
      this.syncViewportState.mockReset();
    },
    setOnReadingAnchorChange(
      callback: ((anchor: { chapterIndex: number; chapterProgress: number }) => void) | undefined,
    ) {
      onReadingAnchorChange = callback;
    },
    setScrollViewportTop(nextScrollViewportTop: number) {
      this.scrollViewportTop = nextScrollViewportTop;
    },
    takeCurrentAnchor() {
      return currentAnchor;
    },
  };
});

vi.mock('../useScrollModeChapters', () => ({
  useScrollModeChapters: (
    _contentRef: RefObject<HTMLDivElement | null>,
    _enabled: boolean,
    _chapters: Array<{ index: number; title: string; wordCount: number }>,
    _fetchChapterContent: (index: number) => Promise<ChapterContent>,
    _preloadAdjacent: (index: number, prune?: boolean) => void,
    _scrollModeChapters: number[],
    _setScrollModeChapters: Dispatch<SetStateAction<number[]>>,
    _contentVersion: number,
    onReadingAnchorChange?: (anchor: { chapterIndex: number; chapterProgress: number }) => void,
  ) => {
    scrollModeState.setOnReadingAnchorChange(onReadingAnchorChange);
    return {
      getCurrentAnchor: () => scrollModeState.takeCurrentAnchor(),
      handleScroll: scrollModeState.handleScroll,
      scrollChapterElementsRef: scrollModeState.scrollChapterElementsRef,
      scrollViewportTop: scrollModeState.scrollViewportTop,
      syncViewportState: scrollModeState.syncViewportState,
    };
  },
}));

vi.mock('../useReaderRenderCache', async () => {
  const renderCacheStub = await import('../../test/deterministicRenderCacheStub');

  return {
    useReaderRenderCache: (params: {
      currentChapter: ChapterContent | null;
      scrollChapters: Array<{ chapter: ChapterContent; index: number }>;
    }) => ({
      pagedLayouts: new Map(),
      scrollLayouts: new Map(
        params.scrollChapters.map(({ chapter, index }) => [
          index,
          renderCacheStub.createDeterministicScrollLayout(chapter),
        ]),
      ),
      summaryShells: new Map(),
      typography: {
        bodyFont: 'Stub Sans',
        bodyFontSize: 18,
        bodyLineHeightPx: 28,
        headingFont: 'Stub Sans',
        headingFontSize: 18,
        headingLineHeightPx: 28,
        paragraphSpacing: 16,
      },
      viewportMetrics: {
        scrollViewportHeight: 800,
        scrollViewportWidth: 600,
        scrollTextWidth: 560,
        pagedViewportHeight: 800,
        pagedViewportWidth: 600,
        pagedColumnCount: 1,
        pagedColumnWidth: 600,
        pagedColumnGap: 0,
        pagedFitsTwoColumns: false,
      },
      cacheSourceByKey: new Map(),
      isPreheating: false,
      pendingPreheatCount: 0,
    }),
  };
});

import { SCROLL_READING_ANCHOR_RATIO } from '../../utils/readerPosition';
import {
  ReaderContextProvider,
} from '../../pages/reader-page/ReaderContext';
import { createDeterministicScrollLayout } from '../../test/deterministicRenderCacheStub';
import { useScrollReaderController } from '../useScrollReaderController';

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

function createChapter(index: number, totalChapters: number, content?: string): ChapterContent {
  return {
    index,
    title: `Chapter ${index + 1}`,
    content: content ?? `Paragraph ${index + 1}\nParagraph ${index + 1} continued`,
    wordCount: 120,
    totalChapters,
    hasPrev: index > 0,
    hasNext: index < totalChapters - 1,
  };
}

function makeContainer({
  clientHeight = 600,
  clientWidth = 600,
  scrollHeight = 4000,
  scrollTop = 0,
  top = 0,
}: {
  clientHeight?: number;
  clientWidth?: number;
  scrollHeight?: number;
  scrollTop?: number;
  top?: number;
} = {}): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, top, clientWidth, clientHeight),
  });
  return element;
}

function makeChapterElement({
  offsetHeight = 300,
  offsetTop = 120,
}: {
  offsetHeight?: number;
  offsetTop?: number;
} = {}): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'offsetHeight', {
    configurable: true,
    get: () => offsetHeight,
  });
  Object.defineProperty(element, 'offsetTop', {
    configurable: true,
    get: () => offsetTop,
  });
  return element;
}

function makeChapterBodyElement({
  height = 1200,
  offsetTop = 120,
  top = 120,
  width = 560,
}: {
  height?: number;
  offsetTop?: number;
  top?: number;
  width?: number;
} = {}): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'offsetTop', {
    configurable: true,
    get: () => offsetTop,
  });
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, top, width, height),
  });
  return element;
}

function createReaderContextValue(
  overrides: Partial<ReaderContextValue> = {},
): ReaderContextValue {
  const mode = overrides.mode ?? 'scroll';

  return {
    novelId: 1,
    chapterIndex: overrides.chapterIndex ?? 1,
    mode,
    viewMode: overrides.viewMode ?? (mode === 'summary' ? 'summary' : 'original'),
    isPagedMode: overrides.isPagedMode ?? mode === 'paged',
    setChapterIndex: overrides.setChapterIndex ?? vi.fn(),
    setMode: overrides.setMode ?? vi.fn(),
    latestReaderStateRef: { current: {} },
    hasUserInteractedRef: { current: false },
    markUserInteracted: vi.fn(),
    persistReaderState: vi.fn(),
    loadPersistedReaderState: vi.fn(async () => ({})),
    contentRef: { current: makeContainer() },
    pagedViewportRef: { current: null },
    pageTargetRef: { current: null },
    wheelDeltaRef: { current: 0 },
    pageTurnLockedRef: { current: false },
    chapterCacheRef: { current: new Map() },
    scrollChapterElementsBridgeRef: { current: new Map() },
    scrollChapterBodyElementsBridgeRef: { current: new Map() },
    chapterChangeSourceRef: { current: null as ChapterChangeSource },
    pagedStateRef: { current: { pageCount: 1, pageIndex: 0 } },
    restoreSettledHandlerRef: { current: vi.fn() },
    isScrollSyncSuppressedRef: { current: false },
    suppressScrollSyncTemporarilyRef: { current: vi.fn() },
    getCurrentAnchorRef: { current: () => null },
    handleScrollModeScrollRef: { current: vi.fn() },
    readingAnchorHandlerRef: { current: vi.fn() },
    getCurrentOriginalLocatorRef: { current: () => null },
    getCurrentPagedLocatorRef: { current: () => null },
    resolveScrollLocatorOffsetRef: { current: () => null },
    ...overrides,
  };
}

function createHookProps(overrides: Partial<Parameters<typeof useScrollReaderController>[0]> = {}) {
  const chapters = overrides.chapters ?? [
    { index: 0, title: 'Chapter 1', wordCount: 100 },
    { index: 1, title: 'Chapter 2', wordCount: 100 },
    { index: 2, title: 'Chapter 3', wordCount: 100 },
    { index: 3, title: 'Chapter 4', wordCount: 100 },
  ];
  const currentChapter = overrides.currentChapter ?? createChapter(1, chapters.length);

  return {
    enabled: true,
    chapters,
    currentChapter,
    contentVersion: 0,
    fetchChapterContent: vi.fn(async (index: number) => createChapter(index, chapters.length)),
    preloadAdjacent: vi.fn(),
    preferences: {
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 16,
    },
    pendingRestoreTarget: null as ReaderRestoreTarget | null,
    pendingRestoreTargetRef: { current: null as ReaderRestoreTarget | null },
    clearPendingRestoreTarget: vi.fn(),
    stopRestoreMask: vi.fn(),
    ...overrides,
  };
}

describe('useScrollReaderController', () => {
  beforeEach(() => {
    scrollModeState.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the surrounding scroll window and exposes renderable chapter layouts', async () => {
    const currentChapter = createChapter(1, 4);
    const fetchChapterContent = vi.fn(async (index: number) => createChapter(index, 4));
    const chapterCacheRef = {
      current: new Map<number, ChapterContent>([[currentChapter.index, currentChapter]]),
    };
    const contextValue = createReaderContextValue({
      chapterIndex: 1,
      chapterCacheRef,
    });
    const props = createHookProps({
      chapters: [
        { index: 0, title: 'Chapter 1', wordCount: 100 },
        { index: 1, title: 'Chapter 2', wordCount: 100 },
        { index: 2, title: 'Chapter 3', wordCount: 100 },
        { index: 3, title: 'Chapter 4', wordCount: 100 },
      ],
      currentChapter,
      fetchChapterContent,
    });

    const { result, rerender } = renderHook(
      (hookProps: ReturnType<typeof createHookProps>) => useScrollReaderController(hookProps),
      {
        initialProps: props,
        wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
          value: contextValue,
          children,
        }),
      },
    );

    await waitFor(() => {
      expect(fetchChapterContent).toHaveBeenCalledTimes(3);
    });
    expect(fetchChapterContent).toHaveBeenCalledWith(0);
    expect(fetchChapterContent).toHaveBeenCalledWith(2);
    expect(fetchChapterContent).toHaveBeenCalledWith(3);

    rerender({
      ...props,
      contentVersion: 1,
    });

    await waitFor(() => {
      expect(
        result.current.renderableScrollLayouts.map(({ index }) => index),
      ).toEqual([0, 1, 2, 3]);
    });
  });

  it('preserves the current viewport when earlier scroll chapters are inserted above it later', async () => {
    const contentRef = { current: makeContainer() };
    Object.defineProperty(contentRef.current, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 420,
    });
    let currentChapterOffsetTop = 0;
    const activeChapterElement = makeChapterElement({
      offsetTop: 0,
      offsetHeight: 300,
    });
    Object.defineProperty(activeChapterElement, 'offsetTop', {
      configurable: true,
      get: () => currentChapterOffsetTop,
    });

    const currentChapter = createChapter(1, 3);
    const chapterCacheRef = {
      current: new Map<number, ChapterContent>([[currentChapter.index, currentChapter]]),
    };
    const suppressScrollSyncTemporarily = vi.fn();
    const { syncViewportState } = scrollModeState;
    const contextValue = createReaderContextValue({
      chapterIndex: 1,
      contentRef,
      chapterCacheRef,
      suppressScrollSyncTemporarilyRef: {
        current: suppressScrollSyncTemporarily,
      },
    });
    const props = createHookProps({
      chapters: [
        { index: 0, title: 'Chapter 1', wordCount: 100 },
        { index: 1, title: 'Chapter 2', wordCount: 100 },
        { index: 2, title: 'Chapter 3', wordCount: 100 },
      ],
      currentChapter,
      contentVersion: 0,
    });

    const { result, rerender } = renderHook(
      (hookProps: ReturnType<typeof createHookProps>) => useScrollReaderController(hookProps),
      {
        initialProps: props,
        wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
          value: contextValue,
          children,
        }),
      },
    );

    await waitFor(() => {
      expect(result.current.renderableScrollLayouts.map(({ index }) => index)).toEqual([1]);
    });

    act(() => {
      result.current.handleScrollChapterElement(1, activeChapterElement);
    });

    rerender({
      ...props,
      contentVersion: 0,
    });

    chapterCacheRef.current.set(0, createChapter(0, 3));
    currentChapterOffsetTop = 600;

    rerender({
      ...props,
      contentVersion: 1,
    });

    await waitFor(() => {
      expect(result.current.renderableScrollLayouts.map(({ index }) => index)).toContain(0);
    });

    expect(contentRef.current.scrollTop).toBe(1020);
    expect(suppressScrollSyncTemporarily).toHaveBeenCalledTimes(1);
    expect(syncViewportState).toHaveBeenCalledWith({ force: true });
  });

  it('does not counteract downward reading when later chapters are appended below', async () => {
    const contentRef = { current: makeContainer() };
    Object.defineProperty(contentRef.current, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 420,
    });
    const activeChapterElement = makeChapterElement({
      offsetTop: 0,
      offsetHeight: 300,
    });

    const currentChapter = createChapter(1, 3);
    const chapterCacheRef = {
      current: new Map<number, ChapterContent>([[currentChapter.index, currentChapter]]),
    };
    const suppressScrollSyncTemporarily = vi.fn();
    const { syncViewportState } = scrollModeState;
    const contextValue = createReaderContextValue({
      chapterIndex: 1,
      contentRef,
      chapterCacheRef,
      suppressScrollSyncTemporarilyRef: {
        current: suppressScrollSyncTemporarily,
      },
    });
    const props = createHookProps({
      chapters: [
        { index: 0, title: 'Chapter 1', wordCount: 100 },
        { index: 1, title: 'Chapter 2', wordCount: 100 },
        { index: 2, title: 'Chapter 3', wordCount: 100 },
      ],
      currentChapter,
      contentVersion: 0,
    });

    const { result, rerender } = renderHook(
      (hookProps: ReturnType<typeof createHookProps>) => useScrollReaderController(hookProps),
      {
        initialProps: props,
        wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
          value: contextValue,
          children,
        }),
      },
    );

    await waitFor(() => {
      expect(result.current.renderableScrollLayouts.map(({ index }) => index)).toEqual([1]);
    });

    act(() => {
      result.current.handleScrollChapterElement(1, activeChapterElement);
    });

    rerender({
      ...props,
      contentVersion: 0,
    });

    chapterCacheRef.current.set(2, createChapter(2, 3));
    contentRef.current.scrollTop = 560;

    rerender({
      ...props,
      contentVersion: 1,
    });

    await waitFor(() => {
      expect(result.current.renderableScrollLayouts.map(({ index }) => index)).toContain(2);
    });

    expect(contentRef.current.scrollTop).toBe(560);
    expect(suppressScrollSyncTemporarily).not.toHaveBeenCalled();
    expect(syncViewportState).not.toHaveBeenCalledWith({ force: true });
  });

  it('ignores stale reading anchors while chapter selection navigation is in progress', () => {
    const persistReaderState = vi.fn();
    const setChapterIndex = vi.fn();
    const chapterChangeSourceRef = {
      current: 'navigation' as ChapterChangeSource,
    };
    const contextValue = createReaderContextValue({
      chapterIndex: 1,
      setChapterIndex,
      chapterChangeSourceRef,
      persistReaderState,
    });
    const props = createHookProps();

    renderHook(() => useScrollReaderController(props), {
      wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
        value: contextValue,
        children,
      }),
    });

    act(() => {
      scrollModeState.emitAnchor({
        chapterIndex: 3,
        chapterProgress: 0.6,
      });
    });

    expect(persistReaderState).not.toHaveBeenCalled();
    expect(setChapterIndex).not.toHaveBeenCalled();
  });

  it('ignores programmatic scroll sync while scroll restoration is temporarily suppressed', () => {
    const persistReaderState = vi.fn();
    const setChapterIndex = vi.fn();
    const { syncViewportState } = scrollModeState;
    const isScrollSyncSuppressedRef = { current: true };
    const contextValue = createReaderContextValue({
      chapterIndex: 1,
      setChapterIndex,
      persistReaderState,
      isScrollSyncSuppressedRef,
    });
    const props = createHookProps();

    const { result } = renderHook(() => useScrollReaderController(props), {
      wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
        value: contextValue,
        children,
      }),
    });

    act(() => {
      scrollModeState.emitAnchor({
        chapterIndex: 3,
        chapterProgress: 0.6,
      });
      result.current.handleContentScroll();
    });

    expect(syncViewportState).toHaveBeenCalledWith({ force: true });
    expect(persistReaderState).not.toHaveBeenCalled();
    expect(setChapterIndex).not.toHaveBeenCalled();
  });

  it('skips non-canonical restore targets and settles the restore lifecycle', async () => {
    const animationFrames = createAnimationFrameController();
    const contentRef = { current: makeContainer() };
    const clearPendingRestoreTarget = vi.fn();
    const stopRestoreMask = vi.fn();
    const onRestoreSettled = vi.fn();
    const currentChapter = createChapter(1, 3);
    const contextValue = createReaderContextValue({
      chapterIndex: 1,
      contentRef,
      chapterCacheRef: {
        current: new Map([[currentChapter.index, currentChapter]]),
      },
      restoreSettledHandlerRef: {
        current: onRestoreSettled,
      },
    });
    const props = createHookProps({
      currentChapter,
      pendingRestoreTarget: {
        chapterIndex: 1,
        mode: 'scroll',
      },
      pendingRestoreTargetRef: {
        current: {
          chapterIndex: 1,
          mode: 'scroll',
        },
      },
      clearPendingRestoreTarget,
      stopRestoreMask,
    });

    try {
      const { result } = renderHook(
        () => useScrollReaderController(props),
        {
          wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
            value: contextValue,
            children,
          }),
        },
      );

      act(() => {
        result.current.handleScrollChapterElement(1, makeChapterElement());
      });

      await animationFrames.flushAnimationFrames();

      expect(contentRef.current.scrollTop).toBe(0);
      expect(clearPendingRestoreTarget).toHaveBeenCalled();
      expect(stopRestoreMask).toHaveBeenCalled();
      expect(onRestoreSettled).toHaveBeenCalledWith('skipped');
    } finally {
      animationFrames.restore();
    }
  });

  it('restores locator targets against the scroll anchor instead of snapping to the chapter top', async () => {
    const animationFrames = createAnimationFrameController();
    const contentRef = {
      current: makeContainer({
        clientHeight: 600,
      }),
    };
    const currentChapter = createChapter(
      1,
      3,
      'Paragraph 1\nParagraph 2\nParagraph 3\nParagraph 4',
    );
    const scrollLayout = createDeterministicScrollLayout(currentChapter);
    const targetMetric = scrollLayout.metrics[1];
    const chapterBodyOffsetTop = 120;
    const locator = {
      chapterIndex: 1,
      blockIndex: targetMetric.block.blockIndex,
      kind: 'text' as const,
      lineIndex: 0,
    };
    const clearPendingRestoreTarget = vi.fn();
    const stopRestoreMask = vi.fn();
    const contextValue = createReaderContextValue({
      chapterIndex: 1,
      contentRef,
      chapterCacheRef: {
        current: new Map([[currentChapter.index, currentChapter]]),
      },
    });
    const props = createHookProps({
      currentChapter,
      pendingRestoreTarget: {
        chapterIndex: 1,
        locator,
        mode: 'scroll',
      },
      pendingRestoreTargetRef: {
        current: {
          chapterIndex: 1,
          locator,
          mode: 'scroll',
        },
      },
      clearPendingRestoreTarget,
      stopRestoreMask,
    });

    try {
      const { result } = renderHook(
        () => useScrollReaderController(props),
        {
          wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
            value: contextValue,
            children,
          }),
        },
      );

      act(() => {
        result.current.handleScrollChapterElement(1, makeChapterElement({
          offsetHeight: 1200,
          offsetTop: chapterBodyOffsetTop,
        }));
        result.current.handleScrollChapterBodyElement(1, makeChapterBodyElement({
          offsetTop: chapterBodyOffsetTop,
        }));
      });

      await animationFrames.flushAnimationFrames();

      expect(contentRef.current.scrollTop).toBe(
        Math.max(
          0,
          Math.round(
            chapterBodyOffsetTop
            + targetMetric.top
            + targetMetric.marginBefore
            - contentRef.current.clientHeight * SCROLL_READING_ANCHOR_RATIO,
          ),
        ),
      );
      expect(clearPendingRestoreTarget).toHaveBeenCalled();
      expect(stopRestoreMask).toHaveBeenCalled();
    } finally {
      animationFrames.restore();
    }
  });

  it('aligns chapter-start boundary restores to the top of the scroll container', async () => {
    const animationFrames = createAnimationFrameController();
    const contentRef = {
      current: makeContainer({
        clientHeight: 600,
      }),
    };
    const currentChapter = createChapter(
      1,
      3,
      'Paragraph 1\nParagraph 2\nParagraph 3\nParagraph 4',
    );
    const chapterContainerOffsetTop = 320;
    const chapterBodyOffsetTop = 360;
    const clearPendingRestoreTarget = vi.fn();
    const stopRestoreMask = vi.fn();
    const contextValue = createReaderContextValue({
      chapterIndex: 1,
      contentRef,
      chapterCacheRef: {
        current: new Map([[currentChapter.index, currentChapter]]),
      },
    });
    const props = createHookProps({
      currentChapter,
      pendingRestoreTarget: {
        chapterIndex: 1,
        locatorBoundary: 'start',
        mode: 'scroll',
      },
      pendingRestoreTargetRef: {
        current: {
          chapterIndex: 1,
          locatorBoundary: 'start',
          mode: 'scroll',
        },
      },
      clearPendingRestoreTarget,
      stopRestoreMask,
    });

    try {
      const { result } = renderHook(
        () => useScrollReaderController(props),
        {
          wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
            value: contextValue,
            children,
          }),
        },
      );

      act(() => {
        result.current.handleScrollChapterElement(1, makeChapterElement({
          offsetHeight: 1200,
          offsetTop: chapterContainerOffsetTop,
        }));
        result.current.handleScrollChapterBodyElement(1, makeChapterBodyElement({
          offsetTop: chapterBodyOffsetTop,
        }));
      });

      await animationFrames.flushAnimationFrames();

      expect(contentRef.current.scrollTop).toBe(chapterContainerOffsetTop);
      expect(clearPendingRestoreTarget).toHaveBeenCalled();
      expect(stopRestoreMask).toHaveBeenCalled();
    } finally {
      animationFrames.restore();
    }
  });

  it('restores when the pending scroll target arrives after the chapter content has already loaded', async () => {
    const animationFrames = createAnimationFrameController();
    const contentRef = { current: makeContainer() };
    const clearPendingRestoreTarget = vi.fn();
    const stopRestoreMask = vi.fn();
    const onRestoreSettled = vi.fn();
    const currentChapter = createChapter(1, 3);
    const pendingRestoreTargetRef = {
      current: null as ReaderRestoreTarget | null,
    };
    const contextValue = createReaderContextValue({
      chapterIndex: 1,
      contentRef,
      chapterCacheRef: {
        current: new Map([[currentChapter.index, currentChapter]]),
      },
      restoreSettledHandlerRef: {
        current: onRestoreSettled,
      },
    });
    const props = createHookProps({
      currentChapter,
      pendingRestoreTarget: null,
      pendingRestoreTargetRef,
      clearPendingRestoreTarget,
      stopRestoreMask,
    });

    try {
      const { result, rerender } = renderHook(
        (hookProps: ReturnType<typeof createHookProps>) => useScrollReaderController(hookProps),
        {
          initialProps: props,
          wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
            value: contextValue,
            children,
          }),
        },
      );

      act(() => {
        result.current.handleScrollChapterElement(1, makeChapterElement({
          offsetTop: 360,
        }));
      });

      const lateTarget: ReaderRestoreTarget = {
        chapterIndex: 1,
        mode: 'scroll',
        locatorBoundary: 'start',
      };
      pendingRestoreTargetRef.current = lateTarget;

      rerender({
        ...props,
        pendingRestoreTarget: lateTarget,
      });

      await animationFrames.flushAnimationFrames();

      expect(contentRef.current.scrollTop).toBe(360);
      expect(clearPendingRestoreTarget).toHaveBeenCalled();
      expect(stopRestoreMask).toHaveBeenCalled();
      expect(onRestoreSettled).toHaveBeenCalledWith('completed');
    } finally {
      animationFrames.restore();
    }
  });

  it('updates visible block ranges after the viewport moves deeper into the chapter', async () => {
    const animationFrames = createAnimationFrameController();
    const currentChapter = createChapter(
      0,
      1,
      Array.from({ length: 12 }, (_, index) => `Paragraph ${index + 1}`).join('\n'),
    );
    const contentRef = {
      current: makeContainer({
        clientHeight: 400,
        scrollHeight: 3200,
      }),
    };
    const chapterBodyElement = makeChapterBodyElement({
      height: 2400,
      offsetTop: 80,
      top: 80,
    });
    const contextValue = createReaderContextValue({
      chapterIndex: 0,
      contentRef,
      chapterCacheRef: {
        current: new Map([[currentChapter.index, currentChapter]]),
      },
    });
    const props = createHookProps({
      chapters: [{ index: 0, title: 'Chapter 1', wordCount: 100 }],
      currentChapter,
    });

    try {
      const { result, rerender } = renderHook(
        (hookProps: ReturnType<typeof createHookProps>) => useScrollReaderController(hookProps),
        {
          initialProps: props,
          wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
            value: contextValue,
            children,
          }),
        },
      );

      act(() => {
        result.current.handleScrollChapterBodyElement(0, chapterBodyElement);
      });

      scrollModeState.setScrollViewportTop(900);
      Object.defineProperty(chapterBodyElement, 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(0, -820, 560, 2400),
      });

      rerender({
        ...props,
        contentVersion: 1,
      });
      await animationFrames.flushAnimationFrames();

      await waitFor(() => {
        expect(
          result.current.visibleScrollBlockRangeByChapter.get(0)?.startIndex,
        ).toBeGreaterThan(0);
      });
    } finally {
      animationFrames.restore();
    }
  });

  it('clears visible block ranges cleanly after the scroll controller is disabled', async () => {
    const animationFrames = createAnimationFrameController();
    const currentChapter = createChapter(
      0,
      1,
      Array.from({ length: 12 }, (_, index) => `Paragraph ${index + 1}`).join('\n'),
    );
    const contentRef = {
      current: makeContainer({
        clientHeight: 400,
        scrollHeight: 3200,
      }),
    };
    const chapterBodyElement = makeChapterBodyElement({
      height: 2400,
      offsetTop: 80,
      top: 80,
    });
    const contextValue = createReaderContextValue({
      chapterIndex: 0,
      contentRef,
      chapterCacheRef: {
        current: new Map([[currentChapter.index, currentChapter]]),
      },
    });
    const props = createHookProps({
      chapters: [{ index: 0, title: 'Chapter 1', wordCount: 100 }],
      currentChapter,
    });

    try {
      const { result, rerender } = renderHook(
        (hookProps: ReturnType<typeof createHookProps>) => useScrollReaderController(hookProps),
        {
          initialProps: props,
          wrapper: ({ children }: { children: ReactNode }) => ReaderContextProvider({
            value: contextValue,
            children,
          }),
        },
      );

      act(() => {
        result.current.handleScrollChapterBodyElement(0, chapterBodyElement);
      });

      await animationFrames.flushAnimationFrames();

      await waitFor(() => {
        expect(result.current.visibleScrollBlockRangeByChapter.size).toBeGreaterThan(0);
      });

      rerender({
        ...props,
        enabled: false,
      });
      await animationFrames.flushAnimationFrames();

      expect(result.current.visibleScrollBlockRangeByChapter.size).toBe(0);

      rerender({
        ...props,
        enabled: false,
      });
      await animationFrames.flushAnimationFrames();

      expect(result.current.visibleScrollBlockRangeByChapter.size).toBe(0);
    } finally {
      animationFrames.restore();
    }
  });
});
