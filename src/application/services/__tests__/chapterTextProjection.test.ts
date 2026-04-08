import { describe, expect, it } from 'vitest';

import type { BookChapter, RichBlock } from '@shared/contracts';

import { buildProjectedBookChapters } from '../chapterTextProjection';

const baseChapter: BookChapter = {
  chapterIndex: 0,
  title: 'Chapter 1',
  content: 'Fallback chapter content',
  wordCount: 42,
};

function createMixedRichBlocks(): RichBlock[] {
  return [
    {
      type: 'heading',
      level: 2,
      children: [{ type: 'text', text: 'Scene One' }],
    },
    {
      type: 'image',
      key: 'map',
      caption: [{ type: 'text', text: 'Map legend' }],
    },
    {
      type: 'list',
      ordered: true,
      items: [
        [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'First clue' }],
          },
        ],
        [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Second clue' }],
          },
        ],
      ],
    },
    {
      type: 'blockquote',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'Quoted memory' }],
        },
      ],
    },
    {
      type: 'table',
      rows: [
        [
          {
            header: true,
            children: [{ type: 'text', text: 'Name' }],
          },
          {
            header: true,
            children: [{ type: 'text', text: 'Role' }],
          },
        ],
        [
          {
            header: false,
            children: [{ type: 'text', text: 'Ava' }],
          },
          {
            header: false,
            children: [{ type: 'text', text: 'Scout' }],
          },
        ],
      ],
    },
    {
      type: 'unsupported',
      fallbackText: 'Decorative divider',
      originalTag: 'aside',
    },
  ];
}

describe('chapterTextProjection', () => {
  it('projects rich blocks into stable plain text for downstream analysis', async () => {
    await expect(buildProjectedBookChapters({
      bookTitle: 'Projection Test',
      rawChapters: [baseChapter],
      richChapters: [
        {
          chapterIndex: 0,
          richBlocks: createMixedRichBlocks(),
          plainText: '',
          contentFormat: 'rich',
          contentVersion: 4,
          importFormatVersion: 2,
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      rules: [],
    })).resolves.toEqual([
      {
        chapterIndex: 0,
        title: 'Chapter 1',
        content: [
          'Scene One',
          'Map legend',
          '1. First clue\n2. Second clue',
          'Quoted memory',
          'Name | Role\nAva | Scout',
          'Decorative divider',
        ].join('\n\n'),
        wordCount: 42,
      },
    ]);
  });

  it('applies post-ast purification to rich content before flattening it', async () => {
    await expect(buildProjectedBookChapters({
      bookTitle: 'Projection Test',
      rawChapters: [baseChapter],
      richChapters: [
        {
          chapterIndex: 0,
          richBlocks: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'noise clue' }],
            },
            {
              type: 'image',
              key: 'map',
              caption: [{ type: 'text', text: 'noise caption' }],
            },
            {
              type: 'unsupported',
              fallbackText: 'noise fallback',
              originalTag: 'aside',
            },
          ],
          plainText: '',
          contentFormat: 'rich',
          contentVersion: 4,
          importFormatVersion: 2,
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      rules: [
        {
          pattern: 'noise',
          replacement: 'signal',
          is_regex: false,
          target_scope: 'all',
          execution_stage: 'post-ast',
        },
      ],
    })).resolves.toEqual([
      {
        chapterIndex: 0,
        title: 'Chapter 1',
        content: 'signal clue\n\nsignal caption\n\nsignal fallback',
        wordCount: 42,
      },
    ]);
  });
});
