import { describe, expect, it } from 'vitest';
import {
  buildChapterRenderData,
  canSkipReaderRestore,
  clampProgress,
  createRestoreTargetFromNavigationIntent,
  createRestoreTargetFromPersistedState,
  getContainerProgress,
  getPageIndexFromProgress,
  hasReaderRestoreTarget,
  resolvePagedTargetPage,
  shouldKeepReaderRestoreMask,
} from '../readerPosition';

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

  it('maps chapter progress to a page index', () => {
    expect(getPageIndexFromProgress(undefined, 5)).toBe(0);
    expect(getPageIndexFromProgress(0.5, 5)).toBe(2);
    expect(getPageIndexFromProgress(1, 5)).toBe(4);
    expect(getPageIndexFromProgress(0.6, 1)).toBe(0);
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
      mode: 'scroll',
      chapterProgress: 0,
    })).toBe(true);
    expect(canSkipReaderRestore({
      chapterIndex: 0,
      mode: 'scroll',
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
      mode: 'scroll',
      chapterProgress: 0,
    })).toBe(false);
    expect(shouldKeepReaderRestoreMask({
      chapterIndex: 0,
      mode: 'scroll',
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
    expect(createRestoreTargetFromPersistedState({
      chapterIndex: 2,
      mode: 'scroll',
    })).toBeNull();
    expect(createRestoreTargetFromPersistedState({
      chapterIndex: 2,
      mode: 'scroll',
      chapterProgress: 0,
    })).toBeNull();
    expect(createRestoreTargetFromPersistedState({
      chapterIndex: 2,
      mode: 'scroll',
      chapterProgress: 0.4,
    })).toBeNull();
    expect(createRestoreTargetFromPersistedState({
      chapterIndex: 2,
      mode: 'paged',
      chapterProgress: 1,
    })).toBeNull();
    expect(createRestoreTargetFromPersistedState({
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 1,
    })).toEqual({
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 1,
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
      locatorBoundary: 'start',
      locator: undefined,
    });

    expect(createRestoreTargetFromNavigationIntent({
      chapterIndex: 3,
      pageTarget: 'end',
    }, 'paged')).toEqual({
      chapterIndex: 3,
      mode: 'paged',
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
