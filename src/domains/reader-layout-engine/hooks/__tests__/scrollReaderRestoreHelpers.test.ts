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
  it('keeps a precise scroll locator when chapter-local progress drifts', () => {
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
      novelFlowIndex: null,
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
        scrollTop: 2320,
      },
    });
  });

  it('falls back to progress when an exact scroll locator clamps to the viewport boundary', () => {
    const container = makeContainer({
      scrollHeight: 3000,
    });
    const chapterElement = makeChapterElement({
      offsetHeight: 1000,
      offsetTop: 2200,
    });
    const targetLocator = {
      chapterIndex: 2,
      blockIndex: 24,
      kind: 'text' as const,
      lineIndex: 2,
    };

    const result = resolvePendingScrollTarget({
      container,
      layoutQueries: {
        resolveScrollLocatorOffset: () => 3500,
      },
      scrollChapterBodyElementsRef: {
        current: new Map(),
      },
      scrollChapterElementsRef: {
        current: new Map([[2, chapterElement]]),
      },
      scrollLayouts: new Map(),
      novelFlowIndex: null,
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
        scrollTop: 2140,
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
        resolveScrollLocatorOffset: () => 2400,
      },
      scrollChapterBodyElementsRef: {
        current: new Map(),
      },
      scrollChapterElementsRef: {
        current: new Map([[2, chapterElement]]),
      },
      scrollLayouts: new Map(),
      novelFlowIndex: null,
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
        scrollTop: 2220,
      },
    });
  });

  it('uses preserved scroll progress to unfold a paged locator back to its scroll position', () => {
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
      pageIndex: 4,
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
      novelFlowIndex: null,
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
        scrollTop: 2260,
      },
    });
  });

  it('maps chapter progress onto the focused single-chapter viewport range', () => {
    const container = makeContainer({
      clientHeight: 600,
      scrollHeight: 4200,
    });
    const chapterElement = makeChapterElement({
      offsetHeight: 4200,
      offsetTop: 0,
    });
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
      novelFlowIndex: null,
      target: {
        chapterIndex: 2,
        chapterProgress: 0.25,
        mode: 'scroll',
      },
    });

    expect(result).toEqual({
      state: 'success',
      value: {
        locator: null,
        scrollTop: 720,
      },
    });
  });

  it('keeps a paged locator-derived scroll top when no scroll progress is available', () => {
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
      pageIndex: 4,
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
      novelFlowIndex: null,
      target: {
        chapterIndex: 2,
        locator: targetLocator,
        mode: 'scroll',
      },
    });

    expect(result).toEqual({
      state: 'success',
      value: {
        locator: targetLocator,
        scrollTop: 2320,
      },
    });
  });
});
