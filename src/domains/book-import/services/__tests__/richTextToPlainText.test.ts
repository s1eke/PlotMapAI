import { describe, expect, it } from 'vitest';

import { richTextToPlainText } from '../epub/richTextToPlainText';

describe('richTextToPlainText', () => {
  it('projects headings, lists, blockquotes, images, and fallbacks into stable plain text', () => {
    const text = richTextToPlainText([
      {
        type: 'heading',
        level: 1,
        children: [{ type: 'text', text: 'Chapter 1' }],
      },
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Intro' }],
      },
      {
        type: 'list',
        ordered: true,
        items: [
          [{
            type: 'paragraph',
            children: [{ type: 'text', text: 'Alpha' }],
          }],
          [{
            type: 'paragraph',
            children: [{ type: 'text', text: 'Beta' }],
          }],
        ],
      },
      {
        type: 'blockquote',
        children: [{
          type: 'paragraph',
          children: [{ type: 'text', text: 'Quoted line' }],
        }],
      },
      {
        type: 'image',
        key: 'img_1',
        caption: [{ type: 'text', text: 'World map' }],
      },
      {
        type: 'image',
        key: 'img_2',
      },
      {
        type: 'unsupported',
        fallbackText: 'Table fallback',
        originalTag: 'table',
      },
    ]);

    expect(text).toBe([
      'Chapter 1',
      'Intro',
      '1. Alpha\n2. Beta',
      'Quoted line',
      'World map',
      '（插图）',
      'Table fallback',
    ].join('\n\n'));
  });
});
