import { describe, expect, it } from 'vitest';

import { normalizeRichBlocks } from '../epub/richTextNormalizer';

describe('normalizeRichBlocks', () => {
  it('merges adjacent text nodes, collapses repeated breaks, and drops empty blocks', () => {
    const blocks = normalizeRichBlocks([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: ' Hello', marks: ['bold'] },
          { type: 'text', text: ' world ', marks: ['bold'] },
          { type: 'lineBreak' },
          { type: 'lineBreak' },
          { type: 'text', text: ' tail ' },
        ],
      },
      {
        type: 'unsupported',
        fallbackText: '   ',
        originalTag: 'aside',
      },
      {
        type: 'blockquote',
        children: [{
          type: 'paragraph',
          children: [{ type: 'text', text: '   ' }],
        }],
      },
    ]);

    expect(blocks).toEqual([{
      type: 'paragraph',
      children: [
        { type: 'text', text: 'Hello world', marks: ['bold'] },
        { type: 'lineBreak' },
        { type: 'text', text: 'tail' },
      ],
    }]);
  });
});
