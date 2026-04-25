import { describe, expect, it } from 'vitest';
import {
  buildChapterRenderData,
  canSkipReaderRestore,
  clampProgress,
  createRestoreTargetFromNavigationIntent,
  createRestoreTargetFromPersistedState,
  getChapterLocalProgress,
  getChapterScrollableRange,
  getContainerProgress,
  getPageIndexFromProgress,
  getScrollTopForChapterProgress,
  hasReaderRestoreTarget,
  resolvePagedRestoreTargetPageIndex,
  resolvePagedTargetPage,
  shouldKeepReaderRestoreMask,
} from '../readerPosition';

function createStoredState(params: {
  chapterIndex: number;
  chapterProgress?: number;
  mode: 'scroll' | 'paged' | 'summary';
}) {
  const contentMode = params.mode === 'summary' ? 'scroll' : params.mode;

  return {
    canonical: {
      chapterIndex: params.chapterIndex,
      edge: 'start' as const,
    },
    hints: {
      chapterProgress: params.chapterProgress,
      contentMode,
      viewMode: params.mode === 'summary' ? 'summary' as const : 'original' as const,
    },
  };
}

describe('readerPosition', () => {
  it('clamps invalid progress values into the 0..1 range', () => {
    expect(clampProgress(undefined)).toBe(0);
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(-0.2)).toBe(0);
    expect(clampProgress(0.4)).toBe(0.4);
    expect(clampProgress(1.4)).toBe(1);
  });

  it('computes scroll progress from a container', () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(element, 'scrollTop', { configurable: true, value: 300 });

    expect(getContainerProgress(element)).toBe(0.5);
    expect(getContainerProgress(null)).toBe(0);
  });

  it('computes chapter-local progress from the chapter scrollable range', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 2400 });
    Object.defineProperty(container, 'scrollTop', { configurable: true, value: 1110 });

    const chapterElement = document.createElement('div');
    Object.defineProperty(chapterElement, 'offsetTop', { configurable: true, value: 120 });
    Object.defineProperty(chapterElement, 'offsetHeight', { configurable: true, value: 1800 });

    expect(getChapterScrollableRange(container, chapterElement)).toBe(1200);
    expect(getChapterLocalProgress(container, chapterElement)).toBe(0.825);
  });

  it('caps chapter-local progress at 1 when the viewport is at the chapter tail', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(container, 'scrollTop', { configurable: true, value: 1600 });

    const chapterElement = document.createElement('div');
    Object.defineProperty(chapterElement, 'offsetTop', { configurable: true, value: 200 });
    Object.defineProperty(chapterElement, 'offsetHeight', { configurable: true, value: 1400 });

    expect(getChapterScrollableRange(container, chapterElement)).toBe(800);
    expect(getChapterLocalProgress(container, chapterElement)).toBe(1);
  });

  it('restores scrollTop from chapter-local progress using the same scrollable range', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 3600 });

    const chapterElement = document.createElement('div');
    Object.defineProperty(chapterElement, 'offsetTop', { configurable: true, value: 900 });
    Object.defineProperty(chapterElement, 'offsetHeight', { configurable: true, value: 1800 });

    expect(getScrollTopForChapterProgress(container, chapterElement, 0.9)).toBe(1980);
    expect(getScrollTopForChapterProgress(container, chapterElement, 1.2)).toBe(2100);
    expect(getScrollTopForChapterProgress(container, chapterElement, undefined)).toBeNull();
  });

  it('maps chapter progress to a page index', () => {
    expect(getPageIndexFromProgress(undefined, 5)).toBe(0);
    expect(getPageIndexFromProgress(0.5, 5)).toBe(2);
    expect(getPageIndexFromProgress(1, 5)).toBe(4);
    expect(getPageIndexFromProgress(0.6, 1)).toBe(0);
  });

  it('prefers progress-based paged restore when a scroll-derived locator collapses to the first page', () => {
    expect(resolvePagedRestoreTargetPageIndex({
      chapterProgress: 0.9,
      resolvedLocatorPageIndex: 0,
      totalPages: 2,
    })).toBe(1);
    expect(resolvePagedRestoreTargetPageIndex({
      chapterProgress: 0.4,
      resolvedLocatorPageIndex: 5,
      totalPages: 20,
    })).toBe(5);
    expect(resolvePagedRestoreTargetPageIndex({
      chapterProgress: 0.75,
      locatorPageIndex: 3,
      resolvedLocatorPageIndex: 0,
      totalPages: 10,
    })).toBe(3);
  });

  it('resolves paged chapter targets before falling back to the carried page index', () => {
    expect(resolvePagedTargetPage('start', 7, 10)).toBe(0);
    expect(resolvePagedTargetPage('end', 2, 10)).toBe(9);
    expect(resolvePagedTargetPage(null, 7, 10)).toBe(7);
    expect(resolvePagedTargetPage(undefined, 12, 10)).toBe(9);
    expect(resolvePagedTargetPage('start', 4, 1)).toBe(0);
  });

  it('detects whether a restore target exists and whether restore can be skipped', () => {
    expect(hasReaderRestoreTarget(null)).toBe(false);
    expect(canSkipReaderRestore(null)).toBe(true);
    expect(hasReaderRestoreTarget({
      chapterIndex: 0,
      mode: 'scroll',
    })).toBe(false);
    expect(canSkipReaderRestore({
      chapterIndex: 0,
      mode: 'scroll',
    })).toBe(true);
    expect(hasReaderRestoreTarget({
      chapterIndex: 0,
      mode: 'summary',
      chapterProgress: 0,
    })).toBe(true);
    expect(canSkipReaderRestore({
      chapterIndex: 0,
      mode: 'summary',
      chapterProgress: 0,
    })).toBe(false);
    expect(hasReaderRestoreTarget({
      chapterIndex: 0,
      mode: 'scroll',
      locator: {
        chapterIndex: 0,
        blockIndex: 1,
        kind: 'text',
      },
    })).toBe(true);
    expect(hasReaderRestoreTarget({
      chapterIndex: 0,
      mode: 'scroll',
      locatorBoundary: 'start',
    })).toBe(true);
  });

  it('detects when restore should keep the loading mask visible', () => {
    expect(shouldKeepReaderRestoreMask(null)).toBe(false);
    expect(shouldKeepReaderRestoreMask({
      chapterIndex: 0,
      mode: 'summary',
      chapterProgress: 0,
    })).toBe(false);
    expect(shouldKeepReaderRestoreMask({
      chapterIndex: 0,
      mode: 'summary',
      chapterProgress: 0.4,
    })).toBe(true);
    expect(shouldKeepReaderRestoreMask({
      chapterIndex: 0,
      mode: 'scroll',
      locator: {
        chapterIndex: 0,
        blockIndex: 1,
        kind: 'text',
      },
    })).toBe(true);
    expect(shouldKeepReaderRestoreMask({
      chapterIndex: 0,
      mode: 'scroll',
      locatorBoundary: 'end',
    })).toBe(true);
  });

  it('creates hydrate restore targets only for persisted positions that need restoration', () => {
    expect(createRestoreTargetFromPersistedState(null)).toBeNull();
    expect(createRestoreTargetFromPersistedState(createStoredState({
      chapterIndex: 2,
      mode: 'scroll',
    }))).toEqual({
      chapterIndex: 2,
      mode: 'scroll',
      position: {
        type: 'chapter-boundary',
        chapterIndex: 2,
        edge: 'start',
      },
      locatorBoundary: 'start',
      locator: undefined,
    });
    expect(createRestoreTargetFromPersistedState(createStoredState({
      chapterIndex: 2,
      mode: 'scroll',
      chapterProgress: 0,
    }))).toEqual({
      chapterIndex: 2,
      chapterProgress: 0,
      mode: 'scroll',
      position: {
        type: 'chapter-boundary',
        chapterIndex: 2,
        edge: 'start',
      },
      locatorBoundary: 'start',
      locator: undefined,
    });
    expect(createRestoreTargetFromPersistedState(createStoredState({
      chapterIndex: 2,
      mode: 'scroll',
      chapterProgress: 0.4,
    }))).toEqual({
      chapterIndex: 2,
      chapterProgress: 0.4,
      mode: 'scroll',
      position: {
        type: 'chapter-boundary',
        chapterIndex: 2,
        edge: 'start',
      },
      locatorBoundary: 'start',
      locator: undefined,
    });
    expect(createRestoreTargetFromPersistedState(createStoredState({
      chapterIndex: 2,
      mode: 'paged',
      chapterProgress: 1,
    }))).toEqual({
      chapterIndex: 2,
      chapterProgress: 1,
      mode: 'paged',
      position: {
        type: 'chapter-boundary',
        chapterIndex: 2,
        edge: 'start',
      },
      locatorBoundary: 'start',
      locator: undefined,
    });
    expect(createRestoreTargetFromPersistedState(createStoredState({
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 1,
    }))).toEqual({
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 1,
      position: {
        type: 'chapter-boundary',
        chapterIndex: 2,
        edge: 'start',
      },
      locatorBoundary: 'start',
      locator: undefined,
    });
  });

  it('creates navigation restore targets for chapter start and end', () => {
    expect(createRestoreTargetFromNavigationIntent({
      chapterIndex: 3,
      pageTarget: 'start',
    }, 'scroll')).toEqual({
      chapterIndex: 3,
      mode: 'scroll',
      position: {
        type: 'chapter-boundary',
        chapterIndex: 3,
        edge: 'start',
      },
      locatorBoundary: 'start',
      locator: undefined,
    });

    expect(createRestoreTargetFromNavigationIntent({
      chapterIndex: 3,
      pageTarget: 'end',
    }, 'paged')).toEqual({
      chapterIndex: 3,
      mode: 'paged',
      position: {
        type: 'chapter-boundary',
        chapterIndex: 3,
        edge: 'end',
      },
      locatorBoundary: 'end',
      locator: undefined,
    });
  });

  it('builds chapter render data and skips a duplicated title line', () => {
    expect(buildChapterRenderData('Chapter 1\n\nFirst paragraph', 'Chapter 1')).toEqual({
      paragraphs: ['Chapter 1', '', 'First paragraph'],
      skipLineIndex: 0,
    });

    expect(buildChapterRenderData('\nIntro line\nBody', 'Chapter 1')).toEqual({
      paragraphs: ['', 'Intro line', 'Body'],
      skipLineIndex: -1,
    });
  });
});
