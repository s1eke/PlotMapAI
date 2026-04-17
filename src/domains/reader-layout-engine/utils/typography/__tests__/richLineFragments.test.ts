import { describe, expect, it } from 'vitest';

import type { ReaderMeasuredLine } from '../../layout/readerLayout';

import { createRichLineFragments } from '../richLineFragments';

function createMeasuredLine(params: {
  text: string;
  lineIndex: number;
  start: number;
  end: number;
}): ReaderMeasuredLine {
  return {
    end: {
      graphemeIndex: params.end,
      segmentIndex: 0,
    },
    lineIndex: params.lineIndex,
    start: {
      graphemeIndex: params.start,
      segmentIndex: 0,
    },
    text: params.text,
    width: params.text.length * 16,
  };
}

describe('richLineFragments', () => {
  it('preserves inline marks when the measured grapheme range aligns', () => {
    const fragments = createRichLineFragments([
      {
        marks: ['bold'],
        text: 'Bold',
        type: 'text',
      },
      {
        text: ' ',
        type: 'text',
      },
      {
        marks: ['italic'],
        text: 'italic',
        type: 'text',
      },
    ], [
      createMeasuredLine({
        end: 11,
        lineIndex: 0,
        start: 0,
        text: 'Bold italic',
      }),
    ]);

    expect(fragments).toEqual([[
      {
        marks: ['bold'],
        text: 'Bold',
        type: 'text',
      },
      {
        text: ' ',
        type: 'text',
      },
      {
        marks: ['italic'],
        text: 'italic',
        type: 'text',
      },
    ]]);
  });

  it('falls back to sequential line text matching when measured grapheme indices drift', () => {
    const fragments = createRichLineFragments([
      {
        marks: ['bold'],
        text: 'Bold',
        type: 'text',
      },
      {
        text: ' ',
        type: 'text',
      },
      {
        marks: ['italic'],
        text: 'italic',
        type: 'text',
      },
      {
        text: ' ',
        type: 'text',
      },
      {
        children: [{
          text: 'Link',
          type: 'text',
        }],
        href: '#anchor',
        type: 'link',
      },
    ], [
      createMeasuredLine({
        end: 2,
        lineIndex: 0,
        start: 0,
        text: 'Bold italic',
      }),
      createMeasuredLine({
        end: 4,
        lineIndex: 1,
        start: 2,
        text: 'Link',
      }),
    ]);

    expect(fragments).toEqual([
      [
        {
          marks: ['bold'],
          text: 'Bold',
          type: 'text',
        },
        {
          text: ' ',
          type: 'text',
        },
        {
          marks: ['italic'],
          text: 'italic',
          type: 'text',
        },
      ],
      [
        {
          children: [{
            text: 'Link',
            type: 'text',
          }],
          href: '#anchor',
          type: 'link',
        },
      ],
    ]);
  });
});
