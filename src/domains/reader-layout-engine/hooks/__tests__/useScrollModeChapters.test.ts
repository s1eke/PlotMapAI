import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { useScrollModeChapters } from '../useScrollModeChapters';
import type { Chapter, ChapterContent } from '@shared/contracts/reader';
import type { NovelFlowIndex } from '../../utils/flow-index/novelFlowIndex';

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
    ref.current.set(idx, makeMockElement({ offsetTop: idx * 900, offsetHeight: 900 }));
  }
}

function setupHook(opts: {
  enabled?: boolean;
  scrollModeChapters?: number[];
  fetchChapterContent?: Mock;
  preloadAdjacent?: Mock;
  chapterDataRevision?: number;
  contentElement?: HTMLDivElement;
  getNovelFlowIndex?: () => NovelFlowIndex | null;
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
      opts.getNovelFlowIndex,
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

function createNovelFlowIndex(
  entries: Array<{
    chapterIndex: number;
    manifestStatus?: NovelFlowIndex['chapters'][number]['manifestStatus'];
    scrollEnd: number;
    scrollStart: number;
  }>,
): NovelFlowIndex {
  return {
    chapters: entries.map((entry) => ({
      blockSummaries: [],
      chapterIndex: entry.chapterIndex,
      endLocator: null,
      manifestStatus: entry.manifestStatus ?? 'materialized',
      pageEnd: 0,
      pageStart: 0,
      scrollEnd: entry.scrollEnd,
      scrollStart: entry.scrollStart,
      startLocator: null,
    })),
    layoutKey: 'scroll',
    layoutSignature: {
      columnCount: 1,
      columnGap: 0,
      fontSize: 18,
      lineSpacing: 1.6,
      pageHeight: 600,
      paragraphSpacing: 16,
      textWidth: 560,
    },
    novelId: 1,
    totalPageCount: 0,
    totalScrollHeight: Math.max(0, ...entries.map((entry) => entry.scrollEnd)),
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
        contentElement: makeMockElement({
          clientHeight: 600,
          scrollHeight: 2400,
        }),
        onReadingAnchorChange,
      });

      result.current.scrollChapterElementsRef.current.set(0, makeMockElement({
        offsetTop: 0,
        offsetHeight: 1800,
      }));
      contentRef.current.scrollTop = 420;

      act(() => { result.current.handleScroll(); });

      expect(onReadingAnchorChange).toHaveBeenCalledWith({ chapterIndex: 0, chapterProgress: 0.5 });
      expect(result.current.getCurrentAnchor()).toEqual({ chapterIndex: 0, chapterProgress: 0.5 });
    });

    it('maps focused single-chapter anchors over the scroll container range', () => {
      const onReadingAnchorChange = vi.fn();
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0],
        contentElement: makeMockElement({
          clientHeight: 600,
          scrollHeight: 4200,
        }),
        onReadingAnchorChange,
      });

      result.current.scrollChapterElementsRef.current.set(0, makeMockElement({
        offsetTop: 1000,
        offsetHeight: 4200,
      }));
      contentRef.current.scrollTop = 2448;

      act(() => { result.current.handleScroll(); });

      expect(onReadingAnchorChange).toHaveBeenCalledWith({
        chapterIndex: 0,
        chapterProgress: 0.73,
      });
      expect(result.current.getCurrentAnchor()).toEqual({
        chapterIndex: 0,
        chapterProgress: 0.73,
      });
    });

    it('uses NovelFlowIndex global offsets for chapter detection and DOM range for progress', () => {
      const onReadingAnchorChange = vi.fn();
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0, 1],
        getNovelFlowIndex: () => createNovelFlowIndex([{
          chapterIndex: 0,
          scrollEnd: 1000,
          scrollStart: 0,
        }, {
          chapterIndex: 1,
          scrollEnd: 1500,
          scrollStart: 1000,
        }]),
        onReadingAnchorChange,
      });

      populateElements(result.current.scrollChapterElementsRef, [0, 1]);
      contentRef.current.scrollTop = 850;

      act(() => { result.current.handleScroll(); });

      expect(onReadingAnchorChange).toHaveBeenCalledWith({
        chapterIndex: 1,
        chapterProgress: 0,
      });
      expect(result.current.getCurrentAnchor()).toEqual({
        chapterIndex: 1,
        chapterProgress: 0,
      });
    });

    it('does not clamp deep DOM scroll progress to the shorter flow estimate', () => {
      const onReadingAnchorChange = vi.fn();
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0],
        contentElement: makeMockElement({
          clientHeight: 600,
          scrollHeight: 3000,
        }),
        getNovelFlowIndex: () => createNovelFlowIndex([{
          chapterIndex: 0,
          scrollEnd: 1000,
          scrollStart: 0,
        }]),
        onReadingAnchorChange,
      });

      result.current.scrollChapterElementsRef.current.set(0, makeMockElement({
        offsetTop: 0,
        offsetHeight: 3000,
      }));
      contentRef.current.scrollTop = 1800;

      act(() => { result.current.handleScroll(); });

      expect(onReadingAnchorChange).toHaveBeenCalledWith({
        chapterIndex: 0,
        chapterProgress: 0.825,
      });
      expect(result.current.getCurrentAnchor()).toEqual({
        chapterIndex: 0,
        chapterProgress: 0.825,
      });
    });

    it('uses NovelFlowIndex materialized tail when deciding the next chapter', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeChapterContent(2));
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0, 1, 3],
        fetchChapterContent: fetchFn,
        contentElement: makeMockElement({
          clientHeight: 600,
          scrollHeight: 2400,
        }),
        getNovelFlowIndex: () => createNovelFlowIndex([{
          chapterIndex: 0,
          scrollEnd: 1000,
          scrollStart: 0,
        }, {
          chapterIndex: 1,
          scrollEnd: 1800,
          scrollStart: 1000,
        }, {
          chapterIndex: 2,
          manifestStatus: 'missing',
          scrollEnd: 1800,
          scrollStart: 1800,
        }, {
          chapterIndex: 3,
          manifestStatus: 'missing',
          scrollEnd: 1800,
          scrollStart: 1800,
        }]),
      });

      populateElements(result.current.scrollChapterElementsRef, [0, 1, 3]);
      contentRef.current.scrollTop = 1250;

      act(() => { result.current.handleScroll(); });

      await waitFor(() => {
        expect(fetchFn).toHaveBeenCalledWith(2);
      });
    });

    it('reports near-tail progress from the chapter scrollable range', () => {
      const onReadingAnchorChange = vi.fn();
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0],
        onReadingAnchorChange,
      });

      result.current.scrollChapterElementsRef.current.set(0, makeMockElement({
        offsetTop: 0,
        offsetHeight: 1200,
      }));
      contentRef.current.scrollTop = 390;

      act(() => { result.current.handleScroll(); });

      expect(onReadingAnchorChange).toHaveBeenCalledWith({
        chapterIndex: 0,
        chapterProgress: 0.95,
      });
      expect(result.current.getCurrentAnchor()).toEqual({
        chapterIndex: 0,
        chapterProgress: 0.95,
      });
    });

    it('fetches next chapter when scroll progress >= 50%', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeChapterContent(1));
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0],
        fetchChapterContent: fetchFn,
      });

      populateElements(result.current.scrollChapterElementsRef, [0]);
      // 30% reading anchor pushes this short chapter beyond the 50% preload threshold.
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
        contentElement: makeMockElement({
          clientHeight: 600,
          scrollHeight: 2400,
        }),
      });

      result.current.scrollChapterElementsRef.current.set(0, makeMockElement({
        offsetTop: 0,
        offsetHeight: 1800,
      }));
      // (scrollTop + 30% viewport anchor) / scrollable range = 280 / 1200 < 0.5
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
      const now = Date.now();
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(now)
        .mockReturnValueOnce(now + 200);
      const { result, contentRef } = setupHook({
        scrollModeChapters: [1],
        fetchChapterContent: fetchFn,
      });

      contentRef.current.scrollTop = 120;
      act(() => { result.current.handleScroll(); });

      contentRef.current.scrollTop = 10;

      act(() => { result.current.handleScroll(); });

      await waitFor(() => {
        expect(fetchFn).toHaveBeenCalledWith(0);
      });
    });

    it('uses NovelFlowIndex materialized head when deciding the previous chapter', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeChapterContent(1));
      const now = Date.now();
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(now)
        .mockReturnValueOnce(now + 200);
      const { result, contentRef } = setupHook({
        scrollModeChapters: [0, 2],
        fetchChapterContent: fetchFn,
        getNovelFlowIndex: () => createNovelFlowIndex([{
          chapterIndex: 0,
          manifestStatus: 'missing',
          scrollEnd: 0,
          scrollStart: 0,
        }, {
          chapterIndex: 1,
          manifestStatus: 'missing',
          scrollEnd: 0,
          scrollStart: 0,
        }, {
          chapterIndex: 2,
          scrollEnd: 800,
          scrollStart: 0,
        }, {
          chapterIndex: 3,
          scrollEnd: 1600,
          scrollStart: 800,
        }]),
      });

      populateElements(result.current.scrollChapterElementsRef, [0, 2]);
      contentRef.current.scrollTop = 120;
      act(() => { result.current.handleScroll(); });

      contentRef.current.scrollTop = 10;

      act(() => { result.current.handleScroll(); });

      await waitFor(() => {
        expect(fetchFn).toHaveBeenCalledWith(1);
      });
    });

    it('does not prepend a previous chapter while the first touch scroll moves down from the top', () => {
      const fetchFn = vi.fn();
      const now = Date.now();
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(now)
        .mockReturnValueOnce(now + 200);
      const { result, contentRef } = setupHook({
        scrollModeChapters: [1],
        fetchChapterContent: fetchFn,
      });

      contentRef.current.scrollTop = 0;
      act(() => { result.current.handleScroll(); });

      contentRef.current.scrollTop = 40;
      act(() => { result.current.handleScroll(); });

      expect(fetchFn).not.toHaveBeenCalled();
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
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

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
