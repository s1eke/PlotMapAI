import { describe, it, expect } from 'vitest';
import { detectChapters, splitByChapters } from '../chapterDetector';

describe('detectChapters', () => {
  it('returns empty array for empty text', () => {
    expect(detectChapters('', [{ rule: '第.*章' }])).toEqual([]);
  });

  it('returns empty array for empty rules', () => {
    expect(detectChapters('some text', [])).toEqual([]);
  });

  it('detects chapters by regex pattern', () => {
    const text = [
      'some preface text',
      '第一章 开始',
      'chapter one content',
      '第二章 继续',
      'chapter two content',
    ].join('\n');

    const chapters = detectChapters(text, [{ rule: '^第[一二三四五六七八九十百千万零〇\\d]+[章节]' }]);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    expect(chapters[chapters.length - 1].title).toContain('第二章');
  });

  it('creates preface for content before first chapter', () => {
    const text = [
      'preface line 1',
      'preface line 2',
      '第1章 Title',
      'chapter content',
    ].join('\n');

    const chapters = detectChapters(text, [{ rule: '^第\\d+章' }]);
    const preface = chapters.find(c => c.title === '前言');
    expect(preface).toBeDefined();
  });

  it('returns empty when no headings match', () => {
    const text = ['just some text', 'no chapter headings here', 'more text'].join('\n');
    const chapters = detectChapters(text, [{ rule: '^第[\\d]+章' }]);
    expect(chapters).toEqual([]);
  });

  it('skips invalid regex patterns', () => {
    const text = '第一章 Test\ncontent';
    const chapters = detectChapters(text, [{ rule: '[invalid' }]);
    expect(chapters).toEqual([]);
  });
});

describe('splitByChapters', () => {
  it('falls back to fixed split when no chapters', () => {
    const text = 'a'.repeat(1000);
    const result = splitByChapters(text, [], 500);
    expect(result.length).toBeGreaterThan(1);
  });

  it('splits by detected chapters', () => {
    const lines = [
      '第一章 A',
      'content a',
      '',
      '第二章 B',
      'content b',
    ];
    const text = lines.join('\n');
    const chapters = [
      { title: '第一章 A', start: 0, end: 3 },
      { title: '第二章 B', start: 3, end: 5 },
    ];
    const result = splitByChapters(text, chapters, 50000);
    expect(result.length).toBe(2);
    expect(result[0].title).toBe('第一章 A');
    expect(result[1].title).toBe('第二章 B');
  });

  it('sub-splits large chapters', () => {
    const bigContent = 'x\n'.repeat(1000);
    const text = bigContent;
    const chapters = [{ title: 'Big Chapter', start: 0, end: 1000 }];
    const result = splitByChapters(text, chapters, 100);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].title).toContain('Big Chapter');
  });

  it('handles empty text', () => {
    const result = splitByChapters('', [], 50000);
    expect(result).toEqual([]);
  });
});
