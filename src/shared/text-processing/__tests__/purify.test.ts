import { describe, expect, it } from 'vitest';

import { purify } from '../purify';

describe('purify', () => {
  it('keeps only the highest-priority rule in the same exclusive group', () => {
    const result = purify(
      'Hello',
      [
        {
          name: 'First',
          pattern: 'Hello',
          replacement: 'Hi',
          is_regex: false,
          is_enabled: true,
          order: 0,
          exclusive_group: 'greeting',
          scope_content: true,
        },
        {
          name: 'Second',
          pattern: 'Hi',
          replacement: 'Bye',
          is_regex: false,
          is_enabled: true,
          order: 1,
          exclusive_group: 'greeting',
          scope_content: true,
        },
        {
          name: 'Third',
          pattern: 'Hi',
          replacement: 'Hi!',
          is_regex: false,
          is_enabled: true,
          order: 2,
          scope_content: true,
        },
      ],
      'content',
      'Test Book',
    );

    expect(result).toBe('Hi!');
  });
});
