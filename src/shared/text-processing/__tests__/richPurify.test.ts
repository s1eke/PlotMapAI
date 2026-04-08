import { describe, expect, it } from 'vitest';

import { purifyRichBlocks } from '../richPurify';

describe('purifyRichBlocks', () => {
  it('applies scoped post-ast rules and removes emptied blocks', () => {
    const blocks = purifyRichBlocks([
      {
        type: 'heading',
        level: 1,
        children: [{ type: 'text', text: 'Chapter 1' }],
      },
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'noise' }],
      },
      {
        type: 'image',
        key: 'map',
        caption: [{ type: 'text', text: 'Caption text' }],
      },
      {
        type: 'unsupported',
        fallbackText: 'noise fallback',
        originalTag: 'aside',
      },
    ], [
      {
        pattern: 'Chapter',
        replacement: 'Section',
        is_regex: false,
        target_scope: 'heading',
        execution_stage: 'post-ast',
      },
      {
        pattern: 'noise',
        replacement: '',
        is_regex: false,
        target_scope: 'text',
        execution_stage: 'post-ast',
      },
      {
        pattern: 'Caption',
        replacement: 'Legend',
        is_regex: false,
        target_scope: 'caption',
        execution_stage: 'post-ast',
      },
    ], 'Test Book', 'post-ast');

    expect(blocks).toEqual([
      {
        type: 'heading',
        level: 1,
        children: [{ type: 'text', text: 'Section 1' }],
      },
      {
        type: 'image',
        key: 'map',
        caption: [{ type: 'text', text: 'Legend text' }],
      },
      {
        type: 'unsupported',
        fallbackText: 'fallback',
        originalTag: 'aside',
      },
    ]);
  });
});
