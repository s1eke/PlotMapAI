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

  it('preserves empty table cells so column positions remain stable', () => {
    const blocks = normalizeRichBlocks([{
      type: 'table',
      rows: [
        [
          {
            children: [{ type: 'text', text: ' Route ' }],
          },
          {
            children: [{ type: 'text', text: ' Status ' }],
          },
          {
            children: [{ type: 'text', text: ' Notes ' }],
          },
        ],
        [
          {
            children: [{ type: 'text', text: ' North Lock ' }],
          },
          {
            children: [{ type: 'text', text: '   ' }],
          },
          {
            children: [{ type: 'text', text: ' Open after dusk ' }],
          },
        ],
      ],
    }]);

    expect(blocks).toEqual([{
      type: 'table',
      rows: [
        [
          {
            children: [{ type: 'text', text: 'Route' }],
          },
          {
            children: [{ type: 'text', text: 'Status' }],
          },
          {
            children: [{ type: 'text', text: 'Notes' }],
          },
        ],
        [
          {
            children: [{ type: 'text', text: 'North Lock' }],
          },
          {
            children: [],
          },
          {
            children: [{ type: 'text', text: 'Open after dusk' }],
          },
        ],
      ],
    }]);
  });
});
