import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useReaderNavigation } from '../useReaderNavigation';
import type { Chapter, ChapterContent } from '../../api/readerApi';
import type { PageTarget } from '../sessionStore';

const makeChapter = (overrides: Partial<ChapterContent> = {}): ChapterContent => ({
  index: 0,
  title: 'Ch',
  content: 'text',
  wordCount: 100,
  totalChapters: 3,
  hasPrev: false,
  hasNext: true,
  ...overrides,
});

const chapters: Chapter[] = [
  { index: 0, title: 'Ch 1', wordCount: 100 },
  { index: 1, title: 'Ch 2', wordCount: 200 },
  { index: 2, title: 'Ch 3', wordCount: 150 },
];

function setupHook(overrides: {
  chapterIndex?: number;
  chapter?: ChapterContent | null;
  isPagedMode?: boolean;
  pageIndex?: number;
  pageCount?: number;
  scrollModeChapters?: number[];
} = {}) {
  const setChapterIndex = vi.fn();
  const setPageIndex = vi.fn();
  const persistReaderState = vi.fn();
  const pageTargetRef = { current: 'start' as PageTarget };
  const hasUserInteractedRef = { current: false };
  const chapterChangeSourceRef = { current: null as 'navigation' | 'scroll' | 'restore' | null };
  const beforeChapterChange = vi.fn();

  const chapterIndex = overrides.chapterIndex ?? 0;
  const currentChapter = overrides.chapter !== undefined ? overrides.chapter : makeChapter();
  const isPagedMode = overrides.isPagedMode ?? true;
  const pageIndex = overrides.pageIndex ?? 0;
  const pageCount = overrides.pageCount ?? 1;
  const scrollModeChapters = overrides.scrollModeChapters ?? [];

  const { result } = renderHook(() =>
    useReaderNavigation(
      chapterIndex,
      setChapterIndex,
      currentChapter,
      isPagedMode,
      pageIndex,
      setPageIndex,
      pageCount,
      persistReaderState,
      pageTargetRef,
      chapters,
      scrollModeChapters,
      hasUserInteractedRef,
      chapterChangeSourceRef,
      beforeChapterChange,
    )
  );

  return {
    result,
    setChapterIndex,
    setPageIndex,
    persistReaderState,
    pageTargetRef,
    hasUserInteractedRef,
    chapterChangeSourceRef,
    beforeChapterChange,
  };
}

describe('useReaderNavigation', () => {
  describe('goToChapter', () => {
    it('sets chapter index and persists state', () => {
      const {
        result,
        setChapterIndex,
        persistReaderState,
        hasUserInteractedRef,
        chapterChangeSourceRef,
        beforeChapterChange,
      } = setupHook();
      result.current.goToChapter(2);
      expect(beforeChapterChange).toHaveBeenCalled();
      expect(hasUserInteractedRef.current).toBe(true);
      expect(chapterChangeSourceRef.current).toBe('navigation');
      expect(setChapterIndex).toHaveBeenCalledWith(2);
      expect(persistReaderState).toHaveBeenCalledWith({ chapterIndex: 2, chapterProgress: 0 });
    });

    it('sets pageTargetRef', () => {
      const { result, pageTargetRef, persistReaderState } = setupHook();
      result.current.goToChapter(1, 'end');
      expect(pageTargetRef.current).toBe('end');
      expect(persistReaderState).toHaveBeenCalledWith({ chapterIndex: 1, chapterProgress: 1 });
    });
  });

  describe('goToNextPage', () => {
    it('increments page when not on last page', () => {
      const { result, setPageIndex } = setupHook({ pageIndex: 0, pageCount: 3 });
      result.current.goToNextPage();
      expect(setPageIndex).toHaveBeenCalled();
    });

    it('navigates to next chapter when on last page and hasNext', () => {
      const { result, setChapterIndex } = setupHook({
        chapterIndex: 0,
        chapter: makeChapter({ hasNext: true }),
        pageIndex: 0,
        pageCount: 1,
      });
      result.current.goToNextPage();
      expect(setChapterIndex).toHaveBeenCalledWith(1);
    });

    it('does nothing when on last page and no next chapter', () => {
      const { result, setChapterIndex, setPageIndex } = setupHook({
        chapter: makeChapter({ hasNext: false }),
        pageIndex: 0,
        pageCount: 1,
      });
      result.current.goToNextPage();
      expect(setChapterIndex).not.toHaveBeenCalled();
      expect(setPageIndex).not.toHaveBeenCalled();
    });

    it('does nothing when currentChapter is null', () => {
      const { result, setChapterIndex, setPageIndex } = setupHook({ chapter: null });
      act(() => { result.current.goToNextPage(); });
      expect(setChapterIndex).not.toHaveBeenCalled();
      expect(setPageIndex).not.toHaveBeenCalled();
    });
  });

  describe('goToPrevPage', () => {
    it('decrements page when not on first page', () => {
      const { result, setPageIndex } = setupHook({ pageIndex: 2, pageCount: 3 });
      result.current.goToPrevPage();
      expect(setPageIndex).toHaveBeenCalled();
    });

    it('navigates to prev chapter when on first page and hasPrev', () => {
      const { result, setChapterIndex } = setupHook({
        chapterIndex: 1,
        chapter: makeChapter({ index: 1, hasPrev: true, hasNext: true }),
        pageIndex: 0,
        pageCount: 1,
      });
      result.current.goToPrevPage();
      expect(setChapterIndex).toHaveBeenCalledWith(0);
    });

    it('does nothing when on first page and no prev chapter', () => {
      const { result, setChapterIndex, setPageIndex } = setupHook({
        chapter: makeChapter({ hasPrev: false }),
        pageIndex: 0,
        pageCount: 1,
      });
      result.current.goToPrevPage();
      expect(setChapterIndex).not.toHaveBeenCalled();
      expect(setPageIndex).not.toHaveBeenCalled();
    });
  });

  describe('handleNext / handlePrev (scroll mode)', () => {
    it('handleNext navigates to next chapter in scroll mode', () => {
      const { result, setChapterIndex } = setupHook({
        isPagedMode: false,
        chapter: makeChapter({ hasNext: true }),
      });
      result.current.handleNext();
      expect(setChapterIndex).toHaveBeenCalledWith(1);
    });

    it('handlePrev navigates to prev chapter in scroll mode', () => {
      const { result, setChapterIndex } = setupHook({
        isPagedMode: false,
        chapterIndex: 1,
        chapter: makeChapter({ index: 1, hasPrev: true, hasNext: true }),
      });
      result.current.handlePrev();
      expect(setChapterIndex).toHaveBeenCalledWith(0);
    });

    it('handleNext delegates to goToNextPage in paged mode', () => {
      const { result, setPageIndex } = setupHook({
        isPagedMode: true,
        pageIndex: 0,
        pageCount: 3,
      });
      result.current.handleNext();
      expect(setPageIndex).toHaveBeenCalled();
    });
  });

  describe('toolbarHasPrev / toolbarHasNext', () => {
    it('toolbarHasPrev is true when not on first page in paged mode', () => {
      const { result } = setupHook({ isPagedMode: true, pageIndex: 1, pageCount: 3 });
      expect(result.current.toolbarHasPrev).toBe(true);
    });

    it('toolbarHasPrev is true when first page but hasPrev chapter', () => {
      const { result } = setupHook({
        isPagedMode: true,
        pageIndex: 0,
        chapter: makeChapter({ hasPrev: true }),
      });
      expect(result.current.toolbarHasPrev).toBe(true);
    });

    it('toolbarHasPrev is false when on first page, no prev chapter', () => {
      const { result } = setupHook({
        isPagedMode: true,
        pageIndex: 0,
        chapter: makeChapter({ hasPrev: false }),
      });
      expect(result.current.toolbarHasPrev).toBe(false);
    });

    it('toolbarHasNext is true when not on last page in paged mode', () => {
      const { result } = setupHook({ isPagedMode: true, pageIndex: 0, pageCount: 3 });
      expect(result.current.toolbarHasNext).toBe(true);
    });

    it('toolbarHasNext is true when on last page but hasNext chapter', () => {
      const { result } = setupHook({
        isPagedMode: true,
        pageIndex: 0,
        pageCount: 1,
        chapter: makeChapter({ hasNext: true }),
      });
      expect(result.current.toolbarHasNext).toBe(true);
    });

    it('toolbarHasPrev in scroll mode uses scrollModeChapters[0] > 0', () => {
      const { result } = setupHook({
        isPagedMode: false,
        chapterIndex: 1,
        scrollModeChapters: [1, 2],
      });
      expect(result.current.toolbarHasPrev).toBe(true);
    });

    it('toolbarHasPrev in scroll mode follows the active chapter index when no scroll chapters', () => {
      const { result } = setupHook({
        isPagedMode: false,
        chapterIndex: 1,
        scrollModeChapters: [],
      });
      expect(result.current.toolbarHasPrev).toBe(true);
    });

    it('toolbarHasNext in scroll mode checks last scrollModeChapter < chapters.length - 1', () => {
      const { result } = setupHook({
        isPagedMode: false,
        scrollModeChapters: [0, 1],
      });
      expect(result.current.toolbarHasNext).toBe(true);
    });

    it('toolbarHasNext in scroll mode is false when all chapters loaded', () => {
      const { result } = setupHook({
        isPagedMode: false,
        chapterIndex: 2,
        scrollModeChapters: [0, 1, 2],
      });
      expect(result.current.toolbarHasNext).toBe(false);
    });
  });
});
