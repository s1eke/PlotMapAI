import { describe, expect, it } from 'vitest';

import {
  getChapterLocalProgress,
  getChapterScrollableRange,
  getScrollTopForChapterProgress,
} from '../readerPosition';

describe('readerPosition', () => {
  it('caps chapter progress range to the available container scroll range', () => {
    const container = {
      clientHeight: 800,
      scrollHeight: 4000,
      scrollTop: 2400,
    };
    const chapterElement = {
      offsetHeight: 6000,
      offsetTop: 0,
    };

    expect(getChapterScrollableRange(container, chapterElement)).toBe(3200);
    expect(getChapterLocalProgress(container, chapterElement)).toBe(0.75);
    expect(getScrollTopForChapterProgress(
      container as HTMLDivElement,
      chapterElement,
      0.75,
    )).toBe(2400);
  });

  it('round-trips chapter progress from a viewport reading anchor', () => {
    const container = {
      clientHeight: 800,
      scrollHeight: 4000,
      scrollTop: 2220,
    };
    const chapterElement = {
      offsetHeight: 6000,
      offsetTop: 0,
    };
    const viewportOffset = 180;

    expect(getChapterLocalProgress(container, chapterElement, viewportOffset)).toBe(0.75);
    expect(getScrollTopForChapterProgress(
      container as HTMLDivElement,
      chapterElement,
      0.75,
      viewportOffset,
    )).toBe(2220);
  });
});
