import { describe, it, expect } from 'vitest';
import { cn } from '../cn';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes via clsx', () => {
    const showHidden = false;
    const isActive = true;
    expect(cn('base', showHidden && 'hidden', isActive && 'active')).toBe('base active');
  });

  it('deduplicates conflicting Tailwind classes', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });

  it('merges arrays', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('');
  });

  it('handles undefined and null', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b');
  });
});
