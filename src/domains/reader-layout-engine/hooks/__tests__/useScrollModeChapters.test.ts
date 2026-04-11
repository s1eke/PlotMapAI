import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { useScrollModeChapters } from '../useScrollModeChapters';
import type { Chapter, ChapterContent } from '@shared/contracts/reader';

const chapters: Chapter[] = [
  { index: 0, title: 'Ch 1', wordCount: 100 },
  { index: 1, title: 'Ch 2', wordCount: 200 },
  { index: 2, title: 'Ch 3', wordCount: 150 },
  { index: 3, title: 'Ch 4', wordCount: 180 },
];

const makeChapterContent = (index: number): ChapterContent => ({
  index,
  title: `Ch ${index + 1}`,
  plainText: `Content for chapter ${index + 1}`,
  richBlocks: [],
  contentFormat: 'plain',
  contentVersion: 1,
  wordCount: 100,
  totalChapters: chapters.length,
  hasPrev: index > 0,
  hasNext: index < chapters.length - 1,
});

function makeMockElement(opts: {
  offsetTop?: number;
  offsetHeight?: number;
  clientHeight?: number;
  scrollTop?: number;
  scrollHeight?: number;
} = {}): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetTop', { value: opts.offsetTop ?? 0, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: opts.offsetHeight ?? 300, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: opts.clientHeight ?? 600, configurable: true });
  Object.defineProperty(el, 'scrollTop', { value: opts.scrollTop ?? 0, writable: true, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: opts.scrollHeight ?? 1200, configurable: true });
  return el;
}

function populateElements(
  ref: React.MutableRefObject<Map<number, HTMLDivElement>>,
  indices: number[],
) {
  for (const idx of indices) {
    ref.current.set(idx, makeMockElement({ offsetTop: idx * 300, offsetHeight: 300 }));
  }
}

function setupHook(opts: {
  enabled?: boolean;
  scrollModeChapters?: number[];
  fetchChapterContent?: Mock;
  preloadAdjacent?: Mock;
  chapterDataRevision?: number;
  contentElement?: HTMLDivElement;
  onReadingAnchorChange?: Mock;
} = {}) {
  const contentRef = { current: opts.contentElement ?? makeMockElement() };
  const fetchChapterContent =
    opts.fetchChapterContent ?? vi.fn().mockResolvedValue(makeChapterContent(0));
  const preloadAdjacent = opts.preloadAdjacent ?? vi.fn();
  const onReadingAnchorChange = opts.onReadingAnchorChange ?? vi.fn();
  const scrollModeChapters = opts.scrollModeChapters ?? [0];
  const setScrollModeChapters = vi.fn();

  const { result } = renderHook(() =>
    useScrollModeChapters(
      contentRef,
      opts.enabled ?? true,
      chapters,
      fetchChapterContent,
      preloadAdjacent,
      scrollModeChapters,
      setScrollModeChapters,
      opts.chapterDataRevision ?? 0,
      onReadingAnchorChange,
    ));

  return {
    result,
    contentRef,
    fetchChapterContent,
    preloadAdjacent,
    setScrollModeChapters,
    onReadingAnchorChange,
  };
}

describe('useScrollModeChapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns scrollChapterElementsRef and handleScroll', () => {
    const { result } = setupHook();
    expect(result.current.scrollChapterElementsRef).toBeDefined();
    expect(typeof result.current.handleScroll).toBe('function');
    expect(typeof result.current.getCurrentAnchor).toBe('function');
    expect(typeof result.current.syncViewportState).toBe('function');
    expect(result.current.scrollViewportTop).toBe(0);
  });

  it('tracks the latest scrollTop for block windowing', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    try {
      const { result, contentRef } = setupHook();

      act(() => {
        const initialFrame = frameCallbacks.shift();
        initialFrame?.(0);
      });

      contentRef.current.scrollTop = 180;

      act(() => {
        result.current.syncViewportState();
      });

      expect(result.current.scrollViewportTop).toBe(0);

      act(() => {
        const viewportFrame = frameCallbacks.shift();
        viewportFrame?.(0);
      });

      expect(result.current.scrollViewportTop).toBe(180);
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it('batches repeated viewport sync requests into one animation frame', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    try {
      const { result, contentRef } = setupHook();

      act(() => {
        const initialFrame = frameCallbacks.shift();
        initialFrame?.(0);
      });
      requestAnimationFrameSpy.mockClear();

      act(() => {
        contentRef.current.scrollTop = 120;
        result.current.syncViewportState();
        contentRef.current.scrollTop = 280;
        result.current.syncViewportState();
        contentRef.current.scrollTop = 360;
        result.current.syncViewportState();
      });

      expect(frameCallbacks).toHaveLength(1);
      expect(result.current.scrollViewportTop).toBe(0);

      act(() => {
        const viewportFrame = frameCallbacks.shift();
        viewportFrame?.(0);
      });

      expect(result.current.scrollViewportTop).toBe(360);
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  describe('handleScroll guards', () => {
    it('does nothing when disabled', () => {
      const { result, fetchChapterContent } = setupHook({ enabled: false });

      act(() => { result.current.handleScroll(); });

      expect(fetchChapterContent).not.toHaveBeenCalled();
    });
  });

  describe('auto-fill', () => {
    it('loads the next chapter when the rendered content is not scrollable', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeChapterContent(1));
      const requestAnimationFrameSpy = vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback: FrameRequestCallback) => {
          callback(0);
          return 1;
        });
      const cancelAnimationFrameSpy = vi
        .spyOn(window, 'cancelAnimationFrame')
        .mockImplementation(() => undefined);

      try {
        setupHook({
          scrollModeChapters: [0],
          fetchChapterContent: fetchFn,
          contentElement: makeMockElement({
            clientHeight: 600,
            scrollHeight: 300,
          }),
        });

        await waitFor(() => {
          expect(fetchFn).toHaveBeenCalledWith(1);
        });
      } finally {
        requestAnimationFrameSpy.mockRestore();
        cancelAnimationFrameSpy.mockRestore();
      }
    });
  });

  describe('throttle', () => {
    it('throttles rapid scroll events', () => {
      const { result, fetchChapterContent, contentRef } = setupHook({
        scrollModeChapters: [0],
      });

      populateElements(result.current.scrollChapterElementsRef, [0]);
      contentRef.current.scrollTop = 200;

      act(() => { result.current.handleScroll(); });

      // Immediately scroll again - should be throttled (< 150ms)
      const callsAfterFirst = fetchChapterContent.mock.calls.length;
      act(() => { result.current.handleScroll(); });

      expect(fetchChapterContent.mock.calls.length).toBe(callsAfterFirst);
    });
  });

  describe('forward chapter loading', () => {
    it('returns null when no measurable chapter elements are registered yet', () => {
      const { result, contentRef } = setupHook({
        scrollModeChapters: [1, 2, 3],
      });

      contentRef.current.scrollTop = 150;

      expect(result.current.getCurrentAnchor()).toBeNull();

      act(() => { result.current.handleScroll(); });

      expect(result.current.getCurrentAnchor()).toBeNull();
    });

    it('reports the current reading anchor', () => {
      const onReadingAnchorChange = vi.fn();
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0],
        onReadingAnchorChange,
      });

      populateElements(result.current.scrollChapterElementsRef, [0]);
      contentRef.current.scrollTop = 150;

      act(() => { result.current.handleScroll(); });

      expect(onReadingAnchorChange).toHaveBeenCalledWith({ chapterIndex: 0, chapterProgress: 0.5 });
      expect(result.current.getCurrentAnchor()).toEqual({ chapterIndex: 0, chapterProgress: 0.5 });
    });

    it('fetches next chapter when scroll progress >= 50%', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeChapterContent(1));
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0],
        fetchChapterContent: fetchFn,
      });

      populateElements(result.current.scrollChapterElementsRef, [0]);
      // scrollTop at 200, element height 300 => progress = 200/300 = 0.67 >= 0.5
      contentRef.current.scrollTop = 200;

      act(() => { result.current.handleScroll(); });

      // The fetch is called in a .then() microtask
      await waitFor(() => {
        expect(fetchFn).toHaveBeenCalledWith(1);
      });
    });

    it('does not fetch when progress < 50%', () => {
      const fetchFn = vi.fn().mockResolvedValue(makeChapterContent(1));
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0],
        fetchChapterContent: fetchFn,
      });

      populateElements(result.current.scrollChapterElementsRef, [0]);
      // scrollTop at 100 => progress = 100/300 = 0.33 < 0.5
      contentRef.current.scrollTop = 100;

      act(() => { result.current.handleScroll(); });

      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('does not fetch when next chapter exceeds total chapters', () => {
      const fetchFn = vi.fn();
      // All chapters loaded, lastIdx = 3, nextIdx = 4 >= chapters.length
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0, 1, 2, 3],
        fetchChapterContent: fetchFn,
      });

      populateElements(result.current.scrollChapterElementsRef, [0, 1, 2, 3]);
      contentRef.current.scrollTop = 200;

      act(() => { result.current.handleScroll(); });

      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('does not fetch beyond last chapter', () => {
      const fetchFn = vi.fn();
      const { result, contentRef } = setupHook({
        scrollModeChapters: [3],
        fetchChapterContent: fetchFn,
      });

      populateElements(result.current.scrollChapterElementsRef, [3]);
      contentRef.current.scrollTop = 200;

      act(() => { result.current.handleScroll(); });

      // lastIdx = 3, nextIdx = 4, 4 < chapters.length(4) = false
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('backward chapter loading', () => {
    it('fetches prev chapter when scrollTop < 50', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeChapterContent(0));
      const { result, contentRef } = setupHook({
        scrollModeChapters: [1],
        fetchChapterContent: fetchFn,
      });

      contentRef.current.scrollTop = 10;

      act(() => { result.current.handleScroll(); });

      await waitFor(() => {
        expect(fetchFn).toHaveBeenCalledWith(0);
      });
    });

    it('does not fetch prev when first chapter is already in list', () => {
      const fetchFn = vi.fn();
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0, 1],
        fetchChapterContent: fetchFn,
      });

      contentRef.current.scrollTop = 10;

      act(() => { result.current.handleScroll(); });

      // firstIdx=0, prevIdx=-1, -1 >= 0 is false
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('does not fetch prev when at chapter 0', () => {
      const fetchFn = vi.fn();
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0],
        fetchChapterContent: fetchFn,
      });

      contentRef.current.scrollTop = 10;

      act(() => { result.current.handleScroll(); });

      // firstIdx=0, prevIdx=-1, -1 >= 0 is false
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('removes pending fetch on error', async () => {
      // Simulate a failed fetch that skips the success branch but still runs
      // the cleanup in .finally(), without introducing an unhandled rejection.
      const fetchFn = vi.fn()
        .mockImplementationOnce(() => ({
          then: () => ({
            finally: (onFinally: () => void) => Promise.resolve().then(onFinally),
          }),
        }))
        .mockResolvedValueOnce(makeChapterContent(1));

      const { result, contentRef } = setupHook({
        scrollModeChapters: [0],
        fetchChapterContent: fetchFn,
      });

      populateElements(result.current.scrollChapterElementsRef, [0]);
      contentRef.current.scrollTop = 200;

      act(() => { result.current.handleScroll(); });

      await waitFor(() => {
        expect(fetchFn).toHaveBeenCalledTimes(1);
      });

      // Let .finally() clear the pending set
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Now try again - pending should be cleared by .finally()
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 200);

      act(() => { result.current.handleScroll(); });

      await waitFor(() => {
        expect(fetchFn).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('duplicate fetch prevention', () => {
    it('does not fetch if already pending', () => {
      const fetchFn = vi.fn().mockImplementation(
        () => new Promise(() => {}), // never resolves
      );
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0],
        fetchChapterContent: fetchFn,
      });

      populateElements(result.current.scrollChapterElementsRef, [0]);
      contentRef.current.scrollTop = 200;

      act(() => { result.current.handleScroll(); });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Bypass throttle
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 200);

      act(() => { result.current.handleScroll(); });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('setScrollModeChapters behavior', () => {
    it('appends next chapter to list on successful fetch', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeChapterContent(1));
      const { result, setScrollModeChapters, contentRef } = setupHook({
        scrollModeChapters: [0],
        fetchChapterContent: fetchFn,
      });

      populateElements(result.current.scrollChapterElementsRef, [0]);
      contentRef.current.scrollTop = 200;

      act(() => { result.current.handleScroll(); });

      await waitFor(() => {
        expect(setScrollModeChapters).toHaveBeenCalled();
      });

      // The updater function should append 1 to [0]
      const updaterFn = setScrollModeChapters.mock.calls[0][0];
      const newState = updaterFn([0]);
      expect(newState).toEqual([0, 1]);
    });

    it('does not duplicate chapter in list', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeChapterContent(1));
      const { result, setScrollModeChapters, contentRef } = setupHook({
        scrollModeChapters: [0],
        fetchChapterContent: fetchFn,
      });

      populateElements(result.current.scrollChapterElementsRef, [0]);
      contentRef.current.scrollTop = 200;

      act(() => { result.current.handleScroll(); });

      await waitFor(() => {
        expect(setScrollModeChapters).toHaveBeenCalled();
      });

      // If chapter 1 is already in the list, the updater should return unchanged
      const updaterFn = setScrollModeChapters.mock.calls[0][0];
      const newState = updaterFn([0, 1]);
      expect(newState).toEqual([0, 1]);
    });
  });
});
