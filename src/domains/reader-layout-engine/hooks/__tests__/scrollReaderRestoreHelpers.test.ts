// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { resolvePendingScrollTarget } from '../scrollReaderRestoreHelpers';

function makeContainer({
  clientHeight = 600,
  scrollHeight = 5600,
}: {
  clientHeight?: number;
  scrollHeight?: number;
} = {}): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  return element;
}

function makeChapterElement({
  offsetHeight,
  offsetTop,
}: {
  offsetHeight: number;
  offsetTop: number;
}): HTMLDivElement {
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

describe('resolvePendingScrollTarget', () => {
  it('falls back to chapter-local progress when the locator position drifts too far', () => {
    const container = makeContainer();
    const chapterElement = makeChapterElement({
      offsetHeight: 1000,
      offsetTop: 2200,
    });
    const targetLocator = {
      chapterIndex: 2,
      blockIndex: 0,
      kind: 'text' as const,
      lineIndex: 0,
    };

    const result = resolvePendingScrollTarget({
      container,
      layoutQueries: {
        resolveScrollLocatorOffset: () => 2500,
      },
      scrollChapterBodyElementsRef: {
        current: new Map(),
      },
      scrollChapterElementsRef: {
        current: new Map([[2, chapterElement]]),
      },
      scrollLayouts: new Map(),
      target: {
        chapterIndex: 2,
        chapterProgress: 0.6,
        locator: targetLocator,
        mode: 'scroll',
      },
    });

    expect(result).toEqual({
      state: 'success',
      value: {
        locator: targetLocator,
        scrollTop: 2440,
      },
    });
  });

  it('keeps the locator-derived scroll top when the chapter-local progress still matches', () => {
    const container = makeContainer();
    const chapterElement = makeChapterElement({
      offsetHeight: 1000,
      offsetTop: 2200,
    });
    const targetLocator = {
      chapterIndex: 2,
      blockIndex: 0,
      kind: 'text' as const,
      lineIndex: 0,
    };

    const result = resolvePendingScrollTarget({
      container,
      layoutQueries: {
        resolveScrollLocatorOffset: () => 2590,
      },
      scrollChapterBodyElementsRef: {
        current: new Map(),
      },
      scrollChapterElementsRef: {
        current: new Map([[2, chapterElement]]),
      },
      scrollLayouts: new Map(),
      target: {
        chapterIndex: 2,
        chapterProgress: 0.5,
        locator: targetLocator,
        mode: 'scroll',
      },
    });

    expect(result).toEqual({
      state: 'success',
      value: {
        locator: targetLocator,
        scrollTop: 2410,
      },
    });
  });
});
