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
          target_scope: 'text',
          execution_stage: 'plain-text-only',
        },
        {
          name: 'Second',
          pattern: 'Hi',
          replacement: 'Bye',
          is_regex: false,
          is_enabled: true,
          order: 1,
          exclusive_group: 'greeting',
          target_scope: 'text',
          execution_stage: 'plain-text-only',
        },
        {
          name: 'Third',
          pattern: 'Hi',
          replacement: 'Hi!',
          is_regex: false,
          is_enabled: true,
          order: 2,
          target_scope: 'text',
          execution_stage: 'plain-text-only',
        },
      ],
      'text',
      'Test Book',
      'plain-text-only',
    );

    expect(result).toBe('Hi!');
  });
});
