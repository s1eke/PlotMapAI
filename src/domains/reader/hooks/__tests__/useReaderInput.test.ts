import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderInput } from '../useReaderInput';
import type { ChapterContent } from '../../readerContentService';

const makeChapter = (overrides: Partial<ChapterContent> = {}): ChapterContent => ({
  index: 0,
  title: 'Chapter 1',
  content: 'text',
  wordCount: 100,
  totalChapters: 3,
  hasPrev: false,
  hasNext: true,
  ...overrides,
});

function setupHook(opts: {
  isPagedMode?: boolean;
  chapter?: ChapterContent | null;
  isLoading?: boolean;
  interactionLocked?: boolean;
} = {}) {
  const contentRef = { current: document.createElement('div') };
  const goToNextPage = vi.fn();
  const goToPrevPage = vi.fn();
  const goToChapter = vi.fn();
  const dismissBlockedInteraction = vi.fn();
  const wheelDeltaRef = { current: 0 };
  const pageTurnLockedRef = { current: false };

  const chapter = opts.chapter !== undefined ? opts.chapter : makeChapter();
  const isPagedMode = opts.isPagedMode ?? true;
  const isLoading = opts.isLoading ?? false;
  const interactionLocked = opts.interactionLocked ?? false;

  const { result } = renderHook(() =>
    useReaderInput(
      contentRef,
      isPagedMode,
      goToNextPage,
      goToPrevPage,
      goToChapter,
      chapter?.index ?? 0,
      chapter,
      isLoading,
      interactionLocked,
      dismissBlockedInteraction,
      wheelDeltaRef,
      pageTurnLockedRef,
    ));

  return {
    result,
    contentRef,
    goToNextPage,
    goToPrevPage,
    goToChapter,
    dismissBlockedInteraction,
    wheelDeltaRef,
    pageTurnLockedRef,
  };
}

describe('useReaderInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stopContinuousScroll', () => {
    const { result } = setupHook();
    expect(typeof result.current.stopContinuousScroll).toBe('function');
  });

  describe('paged mode keyboard', () => {
    it('ArrowDown calls goToNextPage', () => {
      const { goToNextPage } = setupHook({ isPagedMode: true });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(goToNextPage).toHaveBeenCalled();
    });

    it('PageDown calls goToNextPage', () => {
      const { goToNextPage } = setupHook({ isPagedMode: true });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }));
      expect(goToNextPage).toHaveBeenCalled();
    });

    it('ArrowUp calls goToPrevPage', () => {
      const { goToPrevPage } = setupHook({ isPagedMode: true });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(goToPrevPage).toHaveBeenCalled();
    });

    it('PageUp calls goToPrevPage', () => {
      const { goToPrevPage } = setupHook({ isPagedMode: true });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' }));
      expect(goToPrevPage).toHaveBeenCalled();
    });

    it('ArrowRight calls goToChapter with next index', () => {
      const { goToChapter } = setupHook({
        isPagedMode: true,
        chapter: makeChapter({ hasNext: true }),
      });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(goToChapter).toHaveBeenCalledWith(1, 'start');
    });

    it('ArrowLeft calls goToChapter with prev index', () => {
      const { goToChapter } = setupHook({
        isPagedMode: true,
        chapter: makeChapter({ index: 1, hasPrev: true, hasNext: true }),
      });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      expect(goToChapter).toHaveBeenCalledWith(0, 'start');
    });
  });

  describe('scroll mode keyboard', () => {
    it('ArrowDown does not call goToNextPage', () => {
      const { goToNextPage } = setupHook({ isPagedMode: false });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(goToNextPage).not.toHaveBeenCalled();
    });

    it('ArrowRight still navigates chapters in scroll mode', () => {
      const { goToChapter } = setupHook({
        isPagedMode: false,
        chapter: makeChapter({ hasNext: true }),
      });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(goToChapter).toHaveBeenCalledWith(1, 'start');
    });
  });

  describe('edge cases', () => {
    it('does nothing when isLoading is true', () => {
      const { goToNextPage, goToChapter } = setupHook({ isPagedMode: true, isLoading: true });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(goToNextPage).not.toHaveBeenCalled();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(goToChapter).not.toHaveBeenCalled();
    });

    it('does nothing when currentChapter is null', () => {
      const goToNextPage = vi.fn();
      const goToChapter = vi.fn();
      const dismissBlockedInteraction = vi.fn();

      // Use a wrapper to manually call the handler
      const contentRef = { current: document.createElement('div') };
      const wheelDeltaRef = { current: 0 };
      const pageTurnLockedRef = { current: false };

      const { result } = renderHook(() =>
        useReaderInput(
          contentRef,
          true, // isPagedMode
          goToNextPage,
          vi.fn(),
          goToChapter,
          0,
          null, // currentChapter is null
          false,
          false,
          dismissBlockedInteraction,
          wheelDeltaRef,
          pageTurnLockedRef,
        ));

      expect(result.current.stopContinuousScroll).toBeDefined();

      // With currentChapter = null, the handler should bail out immediately
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(goToNextPage).not.toHaveBeenCalled();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(goToChapter).not.toHaveBeenCalled();
    });

    it('does not navigate right when hasNext is false', () => {
      const { goToChapter } = setupHook({ chapter: makeChapter({ hasNext: false }) });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(goToChapter).not.toHaveBeenCalled();
    });

    it('does not navigate left when hasPrev is false', () => {
      const { goToChapter } = setupHook({ chapter: makeChapter({ hasPrev: false }) });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      expect(goToChapter).not.toHaveBeenCalled();
    });
  });

  describe('wheel events in paged mode', () => {
    it('scroll down triggers goToNextPage above threshold', () => {
      const { contentRef, goToNextPage } = setupHook({ isPagedMode: true });
      const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'deltaX', { value: 0 });
      contentRef.current.dispatchEvent(event);
      expect(goToNextPage).toHaveBeenCalled();
    });

    it('scroll up triggers goToPrevPage above threshold', () => {
      const { contentRef, goToPrevPage } = setupHook({ isPagedMode: true });
      const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'deltaX', { value: 0 });
      contentRef.current.dispatchEvent(event);
      expect(goToPrevPage).toHaveBeenCalled();
    });

    it('small wheel delta does not trigger page turn', () => {
      const { contentRef, goToNextPage, goToPrevPage } = setupHook({ isPagedMode: true });
      const event = new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'deltaX', { value: 0 });
      contentRef.current.dispatchEvent(event);
      expect(goToNextPage).not.toHaveBeenCalled();
      expect(goToPrevPage).not.toHaveBeenCalled();
    });

    it('horizontal scroll (deltaX > deltaY) is ignored', () => {
      const { contentRef, goToNextPage, goToPrevPage } = setupHook({ isPagedMode: true });
      const event = new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'deltaX', { value: 100 });
      contentRef.current.dispatchEvent(event);
      expect(goToNextPage).not.toHaveBeenCalled();
      expect(goToPrevPage).not.toHaveBeenCalled();
    });

    it('respects page turn lock', () => {
      const { contentRef, goToNextPage, pageTurnLockedRef } = setupHook({ isPagedMode: true });
      pageTurnLockedRef.current = true;
      const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'deltaX', { value: 0 });
      contentRef.current.dispatchEvent(event);
      expect(goToNextPage).not.toHaveBeenCalled();
    });

    it('does not turn pages while interaction is locked', () => {
      const { contentRef, goToNextPage, dismissBlockedInteraction } = setupHook({
        isPagedMode: true,
        interactionLocked: true,
      });
      const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'deltaX', { value: 0 });
      contentRef.current.dispatchEvent(event);
      expect(goToNextPage).not.toHaveBeenCalled();
      expect(dismissBlockedInteraction).toHaveBeenCalledTimes(1);
    });
  });

  describe('interaction lock', () => {
    it('ignores keyboard navigation while interaction is locked', () => {
      const { goToNextPage, goToChapter, dismissBlockedInteraction } = setupHook({
        isPagedMode: true,
        interactionLocked: true,
      });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(goToNextPage).not.toHaveBeenCalled();
      expect(goToChapter).not.toHaveBeenCalled();
      expect(dismissBlockedInteraction).toHaveBeenCalledTimes(2);
    });
  });

  describe('stopContinuousScroll', () => {
    it('clears scroll keys and cancels animation frame', () => {
      const { result } = setupHook({ isPagedMode: false });
      act(() => { result.current.stopContinuousScroll(); });
      // No error should be thrown
    });
  });
});
