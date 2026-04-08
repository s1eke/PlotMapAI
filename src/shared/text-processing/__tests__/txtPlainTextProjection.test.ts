import { describe, expect, it } from 'vitest';

import { projectTxtPlainTextToRichBlocks } from '../txtPlainTextProjection';

describe('txtPlainTextProjection', () => {
  it('projects each non-empty TXT line into its own paragraph block', () => {
    expect(projectTxtPlainTextToRichBlocks('第一行\n第二行')).toEqual([
      {
        children: [{
          text: '第一行',
          type: 'text',
        }],
        type: 'paragraph',
      },
      {
        children: [{
          text: '第二行',
          type: 'text',
        }],
        type: 'paragraph',
      },
    ]);
  });

  it('treats consecutive blank lines only as paragraph separators', () => {
    expect(projectTxtPlainTextToRichBlocks('第一行\n\n\n第二行')).toEqual([
      {
        children: [{
          text: '第一行',
          type: 'text',
        }],
        type: 'paragraph',
      },
      {
        children: [{
          text: '第二行',
          type: 'text',
        }],
        type: 'paragraph',
      },
    ]);
  });

  it('keeps TXT image markers aligned with the existing block sequence semantics', () => {
    expect(projectTxtPlainTextToRichBlocks('开场白\n[IMG:map]\nAfter[IMG:diagram]End')).toEqual([
      {
        children: [{
          text: '开场白',
          type: 'text',
        }],
        type: 'paragraph',
      },
      {
        key: 'map',
        type: 'image',
      },
      {
        children: [{
          text: 'After',
          type: 'text',
        }],
        type: 'paragraph',
      },
      {
        key: 'diagram',
        type: 'image',
      },
      {
        children: [{
          text: 'End',
          type: 'text',
        }],
        type: 'paragraph',
      },
    ]);
  });

  it('trims leading and trailing blank lines before projection', () => {
    expect(projectTxtPlainTextToRichBlocks('\n\n尾声\n\n')).toEqual([
      {
        children: [{
          text: '尾声',
          type: 'text',
        }],
        type: 'paragraph',
      },
    ]);
  });
});
