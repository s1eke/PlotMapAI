import { describe, it, expect } from 'vitest';
import { detectChapters, splitByChapters } from '../chapterDetection';

const ARABIC_DELIMITED_RULE = '^\\d+[.、:：]\\s*.+$';
const CJK_DELIMITED_RULE = '^[零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+[.、:：]\\s*.+$';
const BRACKETED_NUMBER_RULE = '^[\\(（\\[]\\d+[\\)）\\]]\\s*.+$';
const NO_NUMBER_RULE = '^[Nn][Oo]\\.?\\s*\\d+\\s+.+$';

function buildSectionLines(label: string): string[] {
  return Array.from(
    { length: 6 },
    (_, index) => `${label} content line ${index + 1} ${'x'.repeat(60)}`,
  );
}

function buildWeakHeadingBook(headings: string[]): string {
  return headings.flatMap((heading, index) => [
    heading,
    ...buildSectionLines(`section-${index + 1}`),
    '',
  ]).join('\n');
}

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
    const preface = chapters.find((c) => c.title === '前言');
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

  it('filters numbered list items inside a strong section', () => {
    const text = [
      '前言',
      '作者有两个原则。',
      '',
      '1. 从不骗人',
      '这一点只是正文列表项。',
      '2. 不相信任何人',
      '这一点也是正文列表项。',
      '3. 只相信证据',
      '这一点仍然是正文列表项。',
    ].join('\n');

    const chapters = detectChapters(text, [
      { rule: '^前言$' },
      { rule: ARABIC_DELIMITED_RULE },
    ]);

    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toEqual({
      title: '前言',
      start: 0,
      end: text.split('\n').length,
    });
  });

  it('accepts numbered headings when the matching rule is custom', () => {
    const text = [
      '前言',
      '作者有两个原则。',
      '',
      '1. 从不骗人',
      '这一点只是正文列表项。',
      '2. 不相信任何人',
      '这一点也是正文列表项。',
      '3. 只相信证据',
      '这一点仍然是正文列表项。',
    ].join('\n');

    const chapters = detectChapters(text, [
      { rule: '^前言$', source: 'default' },
      { rule: ARABIC_DELIMITED_RULE, source: 'custom' },
    ]);

    expect(chapters.map((chapter) => chapter.title)).toEqual([
      '前言',
      '1. 从不骗人',
      '2. 不相信任何人',
      '3. 只相信证据',
    ]);
  });

  it('detects arabic-delimited weak headings when the structure looks chapter-like', () => {
    const headings = ['1. 开始', '2. 继续', '3. 转折'];
    const chapters = detectChapters(
      buildWeakHeadingBook(headings),
      [{ rule: ARABIC_DELIMITED_RULE }],
    );

    expect(chapters.map((chapter) => chapter.title)).toEqual(headings);
  });

  it('detects cjk-delimited weak headings when the structure looks chapter-like', () => {
    const headings = ['一、开始', '二、继续', '三、转折'];
    const chapters = detectChapters(buildWeakHeadingBook(headings), [{ rule: CJK_DELIMITED_RULE }]);

    expect(chapters.map((chapter) => chapter.title)).toEqual(headings);
  });

  it('detects bracketed-number weak headings when the structure looks chapter-like', () => {
    const headings = ['(1) 开始', '(2) 继续', '(3) 转折'];
    const chapters = detectChapters(
      buildWeakHeadingBook(headings),
      [{ rule: BRACKETED_NUMBER_RULE }],
    );

    expect(chapters.map((chapter) => chapter.title)).toEqual(headings);
  });

  it('detects no-number weak headings when the structure looks chapter-like', () => {
    const headings = ['No.1 开始', 'No.2 继续', 'No.3 转折'];
    const chapters = detectChapters(buildWeakHeadingBook(headings), [{ rule: NO_NUMBER_RULE }]);

    expect(chapters.map((chapter) => chapter.title)).toEqual(headings);
  });

  it('keeps a strong preface heading and accepts later weak chapter headings', () => {
    const text = [
      '前言',
      '这是前言内容。',
      '这里介绍一下背景。',
      '',
      buildWeakHeadingBook(['1. 开始', '2. 继续', '3. 转折']),
    ].join('\n');

    const chapters = detectChapters(text, [
      { rule: '^前言$' },
      { rule: ARABIC_DELIMITED_RULE },
    ]);

    expect(chapters.map((chapter) => chapter.title)).toEqual([
      '前言',
      '1. 开始',
      '2. 继续',
      '3. 转折',
    ]);
  });

  it('rejects weak headings when numbering is not consistently increasing', () => {
    const headings = ['1. 开始', '3. 偏移', '2. 回跳'];
    const chapters = detectChapters(
      buildWeakHeadingBook(headings),
      [{ rule: ARABIC_DELIMITED_RULE }],
    );

    expect(chapters).toEqual([]);
  });

  it('prefers a matching custom rule over a matching default rule on the same line', () => {
    const text = [
      '前言',
      '作者有两个原则。',
      '',
      '1. 从不骗人',
      '这一点只是正文列表项。',
      '2. 不相信任何人',
      '这一点也是正文列表项。',
      '3. 只相信证据',
      '这一点仍然是正文列表项。',
    ].join('\n');

    const chapters = detectChapters(text, [
      { rule: '^前言$', source: 'default' },
      { rule: ARABIC_DELIMITED_RULE, source: 'default' },
      { rule: ARABIC_DELIMITED_RULE, source: 'custom' },
    ]);

    expect(chapters.map((chapter) => chapter.title)).toEqual([
      '前言',
      '1. 从不骗人',
      '2. 不相信任何人',
      '3. 只相信证据',
    ]);
  });

  it('preserves strong headings with explicit chapter keywords', () => {
    const text = [
      'Chapter 1 Beginning',
      'chapter one content',
      'Chapter 2 Continue',
      'chapter two content',
    ].join('\n');

    const chapters = detectChapters(text, [{ rule: '^[Cc]hapter\\s+\\d+' }]);
    expect(chapters.map((chapter) => chapter.title)).toEqual([
      'Chapter 1 Beginning',
      'Chapter 2 Continue',
    ]);
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

  it('strips duplicated title lines from split chapter content', () => {
    const lines = [
      '第一章 A',
      '',
      '第一章 A',
      'content a',
      '',
      '第二章 B',
      '第二章 B',
      'content b',
    ];
    const chapters = [
      { title: '第一章 A', start: 0, end: 5 },
      { title: '第二章 B', start: 5, end: 8 },
    ];

    expect(splitByChapters(lines.join('\n'), chapters, 50000)).toEqual([
      { title: '第一章 A', content: 'content a' },
      { title: '第二章 B', content: 'content b' },
    ]);
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
