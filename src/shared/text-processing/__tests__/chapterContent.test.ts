import { describe, expect, it } from 'vitest';

import {
  normalizeImportedChapter,
  stripLeadingChapterTitle,
} from '../chapterContent';

describe('chapterContent', () => {
  it('strips a leading title line from chapter content', () => {
    expect(stripLeadingChapterTitle('第36章 命途的起点\n\n正文第一段\n正文第二段', '第36章 命途的起点'))
      .toBe('正文第一段\n正文第二段');
  });

  it('keeps content unchanged when the first non-empty line is not the chapter title', () => {
    expect(stripLeadingChapterTitle('引子\n第36章 命途的起点', '第36章 命途的起点'))
      .toBe('引子\n第36章 命途的起点');
  });

  it('normalizes imported chapter objects without changing their title', () => {
    expect(normalizeImportedChapter({
      content: 'Chapter 1\nBody',
      title: 'Chapter 1',
    })).toEqual({
      content: 'Body',
      title: 'Chapter 1',
    });
  });
});
