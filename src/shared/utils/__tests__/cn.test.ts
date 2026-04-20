import { describe, it, expect } from 'vitest';
import { cn } from '../cn';

describe('cn', () => {
  it('merges clsx inputs and resolves Tailwind conflicts in one pass', () => {
    expect(cn('base', ['p-4', 'items-center'], undefined, null, false, 'p-2')).toBe(
      'base items-center p-2',
    );
  });
});
