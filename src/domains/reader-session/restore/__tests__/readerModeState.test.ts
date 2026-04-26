// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type { ReaderLocator, StoredReaderState } from '@shared/contracts/reader';

import {
  captureReaderStateSnapshot,
  toRestoreTargetFromState,
} from '../readerModeState';

describe('captureReaderStateSnapshot', () => {
  it('preserves scroll progress when the viewport element is missing during capture', () => {
    const currentLocator: ReaderLocator = {
      chapterIndex: 0,
      blockIndex: 22,
      kind: 'text',
      lineIndex: 1,
    };
    const previousState: StoredReaderState = {
      canonical: {
        chapterIndex: 0,
        blockIndex: 22,
        kind: 'text',
        lineIndex: 1,
      },
      hints: {
        chapterProgress: 0.4,
        contentMode: 'scroll',
        viewMode: 'original',
      },
    };

    const nextState = captureReaderStateSnapshot({
      chapterIndex: 0,
      currentAnchor: null,
      currentOriginalLocator: currentLocator,
      currentPagedLocator: null,
      latestReaderState: previousState,
      mode: 'scroll',
      navigationSource: null,
      storedReaderState: previousState,
      viewportContentElement: null,
    });

    expect(nextState.hints?.chapterProgress).toBe(0.4);
    expect(nextState.canonical).toEqual({
      chapterIndex: 0,
      blockIndex: 22,
      kind: 'text',
      lineIndex: 1,
    });
  });

  it('preserves scroll progress when teardown resets scrollTop before the locator updates', () => {
    const currentLocator: ReaderLocator = {
      chapterIndex: 0,
      blockIndex: 22,
      kind: 'text',
      lineIndex: 1,
    };
    const previousState: StoredReaderState = {
      canonical: {
        chapterIndex: 0,
        blockIndex: 22,
        kind: 'text',
        lineIndex: 1,
      },
      hints: {
        chapterProgress: 0.4,
        contentMode: 'scroll',
        viewMode: 'original',
      },
    };
    const viewport = document.createElement('div');

    Object.defineProperty(viewport, 'scrollHeight', {
      configurable: true,
      get: () => 4995,
    });
    Object.defineProperty(viewport, 'clientHeight', {
      configurable: true,
      get: () => 960,
    });
    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      get: () => 0,
    });

    const nextState = captureReaderStateSnapshot({
      chapterIndex: 0,
      currentAnchor: null,
      currentOriginalLocator: currentLocator,
      currentPagedLocator: null,
      latestReaderState: previousState,
      mode: 'scroll',
      navigationSource: null,
      storedReaderState: previousState,
      viewportContentElement: viewport,
    });

    expect(nextState.hints?.chapterProgress).toBe(0.4);
  });

  it('prefers the current anchor chapter progress over the container progress during capture', () => {
    const currentLocator: ReaderLocator = {
      chapterIndex: 0,
      blockIndex: 22,
      kind: 'text',
      lineIndex: 1,
    };
    const previousState: StoredReaderState = {
      canonical: {
        chapterIndex: 0,
        blockIndex: 22,
        kind: 'text',
        lineIndex: 1,
      },
      hints: {
        chapterProgress: 0.2,
        contentMode: 'scroll',
        viewMode: 'original',
      },
    };
    const viewport = document.createElement('div');

    Object.defineProperty(viewport, 'scrollHeight', {
      configurable: true,
      get: () => 3000,
    });
    Object.defineProperty(viewport, 'clientHeight', {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      get: () => 600,
    });

    const nextState = captureReaderStateSnapshot({
      chapterIndex: 0,
      currentAnchor: {
        chapterIndex: 0,
        chapterProgress: 0.65,
      },
      currentOriginalLocator: currentLocator,
      currentPagedLocator: null,
      latestReaderState: previousState,
      mode: 'scroll',
      navigationSource: null,
      storedReaderState: previousState,
      viewportContentElement: viewport,
    });

    expect(nextState.hints?.chapterProgress).toBe(0.65);
    expect(nextState.canonical).toEqual({
      chapterIndex: 0,
      blockIndex: 22,
      kind: 'text',
      lineIndex: 1,
    });
  });

  it('clears stale scroll progress when capturing a paged locator', () => {
    const currentPagedLocator: ReaderLocator = {
      chapterIndex: 0,
      blockIndex: 34,
      kind: 'text',
      lineIndex: 0,
      pageIndex: 5,
    };
    const previousState: StoredReaderState = {
      canonical: {
        chapterIndex: 0,
        blockIndex: 12,
        kind: 'text',
        lineIndex: 0,
      },
      hints: {
        chapterProgress: 0.22,
        contentMode: 'scroll',
        viewMode: 'original',
      },
    };

    const nextState = captureReaderStateSnapshot({
      chapterIndex: 0,
      currentAnchor: null,
      currentOriginalLocator: null,
      currentPagedLocator,
      latestReaderState: previousState,
      mode: 'paged',
      navigationSource: null,
      storedReaderState: previousState,
      viewportContentElement: null,
    });

    expect(nextState.canonical).toEqual({
      chapterIndex: 0,
      blockIndex: 34,
      kind: 'text',
      lineIndex: 0,
    });
    expect(nextState.hints).toMatchObject({
      contentMode: 'paged',
      pageIndex: 5,
      viewMode: 'original',
    });
    expect(nextState.hints?.chapterProgress).toBeUndefined();
  });

  it('preserves paged scroll projection while the page index is unchanged', () => {
    const currentPagedLocator: ReaderLocator = {
      chapterIndex: 0,
      blockIndex: 34,
      kind: 'text',
      lineIndex: 0,
      pageIndex: 5,
    };
    const previousState: StoredReaderState = {
      canonical: {
        chapterIndex: 0,
        blockIndex: 34,
        kind: 'text',
        lineIndex: 0,
      },
      hints: {
        chapterProgress: 0.72,
        contentMode: 'paged',
        pageIndex: 5,
        viewMode: 'original',
      },
    };

    const nextState = captureReaderStateSnapshot({
      chapterIndex: 0,
      currentAnchor: null,
      currentOriginalLocator: null,
      currentPagedLocator,
      latestReaderState: previousState,
      mode: 'paged',
      navigationSource: null,
      storedReaderState: previousState,
      viewportContentElement: null,
    });

    expect(nextState.hints?.chapterProgress).toBe(0.72);
    expect(nextState.hints?.pageIndex).toBe(5);
  });

  it('uses the current chapter capture during navigation after the locator reaches the target chapter', () => {
    const previousState: StoredReaderState = {
      canonical: {
        chapterIndex: 0,
        blockIndex: 24,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.64,
        contentMode: 'scroll',
      },
    };
    const currentLocator: ReaderLocator = {
      chapterIndex: 1,
      blockIndex: 8,
      kind: 'text',
      lineIndex: 2,
    };

    const nextState = captureReaderStateSnapshot({
      chapterIndex: 1,
      currentAnchor: {
        chapterIndex: 1,
        chapterProgress: 0.31,
      },
      currentOriginalLocator: currentLocator,
      currentPagedLocator: null,
      latestReaderState: previousState,
      mode: 'scroll',
      navigationSource: 'navigation',
      storedReaderState: previousState,
      viewportContentElement: null,
    });

    expect(nextState.canonical).toEqual({
      chapterIndex: 1,
      blockIndex: 8,
      kind: 'text',
      lineIndex: 2,
    });
    expect(nextState.hints?.chapterProgress).toBe(0.31);
    expect(nextState.hints?.contentMode).toBe('scroll');
  });
});

describe('toRestoreTargetFromState', () => {
  it('keeps scroll progress for scroll-mode targets when projection metadata is stale', () => {
    const target = toRestoreTargetFromState({
      chapterIndex: 1,
      mode: 'scroll',
      state: {
        canonical: {
          chapterIndex: 1,
          blockIndex: 6,
          kind: 'text',
        },
        hints: {
          chapterProgress: 0.27,
          contentMode: 'scroll',
          scrollProjection: {
            basisCanonicalFingerprint: 'stale',
            sourceMode: 'scroll',
          },
        },
      },
    });

    expect(target.chapterProgress).toBe(0.27);
  });
});
