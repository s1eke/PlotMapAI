import { describe, expect, it } from 'vitest';
import {
  buildChapterRenderData,
  clampProgress,
  getContainerProgress,
  getPageIndexFromProgress,
  shouldMaskReaderPositionRestore,
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

  it('detects when restore should keep the loading mask visible', () => {
    expect(shouldMaskReaderPositionRestore(null)).toBe(false);
    expect(shouldMaskReaderPositionRestore({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: false,
      chapterProgress: 0,
    })).toBe(false);
    expect(shouldMaskReaderPositionRestore({
      chapterIndex: 2,
      viewMode: 'original',
      isTwoColumn: false,
    })).toBe(true);
    expect(shouldMaskReaderPositionRestore({
      chapterIndex: 0,
      viewMode: 'summary',
      isTwoColumn: false,
    })).toBe(true);
    expect(shouldMaskReaderPositionRestore({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: true,
    })).toBe(true);
    expect(shouldMaskReaderPositionRestore({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: false,
      chapterProgress: 0.4,
    })).toBe(true);
    expect(shouldMaskReaderPositionRestore({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: false,
      scrollPosition: 120,
    })).toBe(true);
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
