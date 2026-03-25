import { describe, it, expect } from 'vitest';
import { purify, loadRulesFromJson, type PurifyRule } from '../purifier';

describe('purify', () => {
  it('returns text unchanged when no rules', () => {
    expect(purify('hello', [], 'content', 'Book')).toBe('hello');
  });

  it('returns text unchanged when text is empty', () => {
    const rules: PurifyRule[] = [{ pattern: 'a', replacement: 'b', is_regex: false }];
    expect(purify('', rules, 'content', 'Book')).toBe('');
  });

  it('applies literal string replacement', () => {
    const rules: PurifyRule[] = [{
      pattern: 'foo',
      replacement: 'bar',
      is_regex: false,
      is_enabled: true,
    }];
    expect(purify('hello foo world', rules, 'content', 'Book')).toBe('hello bar world');
  });

  it('applies regex replacement', () => {
    const rules: PurifyRule[] = [{
      pattern: '\\d+',
      replacement: 'NUM',
      is_regex: true,
      is_enabled: true,
    }];
    expect(purify('item 123 and 456', rules, 'content', 'Book')).toBe('item NUM and NUM');
  });

  it('skips disabled rules', () => {
    const rules: PurifyRule[] = [{
      pattern: 'foo',
      replacement: 'bar',
      is_regex: false,
      is_enabled: false,
    }];
    expect(purify('foo', rules, 'content', 'Book')).toBe('foo');
  });

  it('respects scope filtering for title', () => {
    const rules: PurifyRule[] = [{
      pattern: 'x',
      replacement: 'y',
      scope_title: false,
      scope_content: true,
    }];
    expect(purify('x', rules, 'title', 'Book')).toBe('x');
    expect(purify('x', rules, 'content', 'Book')).toBe('y');
  });

  it('respects scope filtering for content', () => {
    const rules: PurifyRule[] = [{
      pattern: 'x',
      replacement: 'y',
      scope_title: true,
      scope_content: false,
    }];
    expect(purify('x', rules, 'title', 'Book')).toBe('y');
    expect(purify('x', rules, 'content', 'Book')).toBe('x');
  });

  it('respects book_scope inclusion', () => {
    const rules: PurifyRule[] = [{
      pattern: 'x',
      replacement: 'y',
      book_scope: 'Target',
    }];
    expect(purify('x', rules, 'content', 'Target Book')).toBe('y');
    expect(purify('x', rules, 'content', 'Other Book')).toBe('x');
  });

  it('respects exclude_book_scope', () => {
    const rules: PurifyRule[] = [{
      pattern: 'x',
      replacement: 'y',
      exclude_book_scope: 'Excluded',
    }];
    expect(purify('x', rules, 'content', 'Excluded Book')).toBe('x');
    expect(purify('x', rules, 'content', 'Normal Book')).toBe('y');
  });

  it('applies rules in order', () => {
    const rules: PurifyRule[] = [
      { pattern: 'a', replacement: 'b', order: 2, is_regex: false },
      { pattern: 'b', replacement: 'c', order: 1, is_regex: false },
    ];
    // order=1 runs first: a stays 'a', then b->c (but a hasn't changed yet)
    // Actually: first b->c, then a->b
    // Input 'a': order 1 (b->c) does nothing, order 2 (a->b) turns 'a' to 'b'
    // Input 'b': order 1 (b->c) turns 'b' to 'c', order 2 (a->b) does nothing
    expect(purify('a', rules, 'content', 'Book')).toBe('b');
    expect(purify('b', rules, 'content', 'Book')).toBe('c');
  });

  it('handles @js:fullwidth replacement', () => {
    const rules: PurifyRule[] = [{
      pattern: '[Ａ-Ｚ]+',
      replacement: '@js:fullwidth',
      is_regex: true,
    }];
    expect(purify('ＡＢＣ', rules, 'content', 'Book')).toBe('ABC');
  });

  it('handles @js:halfwidth replacement', () => {
    const rules: PurifyRule[] = [{
      pattern: '[A-Z]+',
      replacement: '@js:halfwidth',
      is_regex: true,
    }];
    expect(purify('ABC', rules, 'content', 'Book')).toBe('ＡＢＣ');
  });

  it('handles @js:strip replacement', () => {
    const rules: PurifyRule[] = [{
      pattern: '\\S+\\s+\\S+',
      replacement: '@js:strip',
      is_regex: true,
    }];
    expect(purify('hello world', rules, 'content', 'Book')).toBe('helloworld');
  });

  it('handles @js:normalize replacement', () => {
    const rules: PurifyRule[] = [{
      pattern: '\\S+',
      replacement: '@js:normalize',
      is_regex: true,
    }];
    // NFC normalization of composed characters
    const input = '\u0065\u0301'; // e + combining acute accent
    const result = purify(input, rules, 'content', 'Book');
    expect(result.normalize('NFC')).toBe(result);
  });

  it('replaces CRLF with LF', () => {
    const rules: PurifyRule[] = [{ pattern: 'x', replacement: 'y' }];
    expect(purify('line1\r\nline2', rules, 'content', 'Book')).toBe('line1\nline2');
  });

  it('skips invalid regex patterns gracefully', () => {
    const rules: PurifyRule[] = [{
      pattern: '[invalid',
      replacement: 'x',
      is_regex: true,
    }];
    expect(purify('hello [invalid world', rules, 'content', 'Book')).toBe('hello [invalid world');
  });
});

describe('loadRulesFromJson', () => {
  it('parses valid JSON array', () => {
    const json = JSON.stringify([{ name: 'Rule1', pattern: 'foo', replacement: 'bar' }]);
    const rules = loadRulesFromJson(json);
    expect(rules.length).toBe(1);
    expect(rules[0].name).toBe('Rule1');
  });

  it('maps camelCase keys to snake_case', () => {
    const json = JSON.stringify([{ name: 'R', pattern: 'p', replacement: 'r', isRegex: true, isEnabled: false }]);
    const rules = loadRulesFromJson(json);
    expect(rules[0].is_regex).toBe(true);
    expect(rules[0].is_enabled).toBe(false);
  });

  it('assigns default name for unnamed rules', () => {
    const json = JSON.stringify([{ pattern: 'p' }]);
    const rules = loadRulesFromJson(json);
    expect(rules[0].name).toBe('Imported Rule 0');
  });

  it('throws on invalid JSON', () => {
    expect(() => loadRulesFromJson('not json')).toThrow('Invalid JSON');
  });

  it('throws on non-array JSON', () => {
    expect(() => loadRulesFromJson('{"a":1}')).toThrow('Rules must be a JSON array');
  });

  it('skips non-object entries in array', () => {
    const json = JSON.stringify([null, 42, 'str', { pattern: 'ok' }]);
    const rules = loadRulesFromJson(json);
    expect(rules.length).toBe(1);
    expect(rules[0].pattern).toBe('ok');
  });
});
