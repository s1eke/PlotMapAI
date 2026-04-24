// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type { ReaderLocator, StoredReaderState } from '@shared/contracts/reader';

import { captureReaderStateSnapshot } from '../readerModeState';

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
});
