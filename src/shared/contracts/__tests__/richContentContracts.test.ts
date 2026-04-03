import type {
  AnalysisTextProjection,
  PaginationBlock,
  PaginationListContext,
  ReaderChapterRichContent,
  RichBlock,
  RichInline,
} from '@shared/contracts';
import type { ChapterContent } from '@shared/contracts/reader';

import { describe, expect, it } from 'vitest';

import * as readerContracts from '@shared/contracts/reader';

function roundTripJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('rich content shared contracts', () => {
  it('models every rich inline and rich block variant as JSON-serializable data', () => {
    const textInline = {
      type: 'text',
      text: 'Annotated text',
      marks: ['bold', 'italic'],
    } satisfies RichInline;

    const lineBreakInline = {
      type: 'lineBreak',
    } satisfies RichInline;

    const linkInline = {
      type: 'link',
      href: '#footnote-1',
      children: [
        textInline,
        lineBreakInline,
        {
          type: 'text',
          text: 'Footnote',
          marks: ['underline'],
        } satisfies RichInline,
      ],
    } satisfies RichInline;

    const richBlocks = [
      {
        type: 'heading',
        level: 2,
        align: 'center',
        children: [textInline],
      },
      {
        type: 'paragraph',
        align: 'right',
        indent: 2,
        children: [textInline, lineBreakInline, linkInline],
      },
      {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [textInline],
          },
        ],
      },
      {
        type: 'list',
        ordered: true,
        items: [
          [
            {
              type: 'paragraph',
              children: [textInline],
            },
          ],
        ],
      },
      {
        type: 'image',
        key: 'illustration-1',
        alt: 'Illustration',
        caption: [
          {
            type: 'text',
            text: 'Figure 1',
            marks: ['bold'],
          },
        ],
        width: 640,
        height: 480,
        align: 'center',
      },
      {
        type: 'hr',
      },
      {
        type: 'poem',
        lines: [
          [textInline],
          [linkInline],
        ],
      },
      {
        type: 'table',
        rows: [
          [
            {
              children: [textInline],
            },
          ],
        ],
      },
      {
        type: 'unsupported',
        fallbackText: 'Fallback text',
        originalTag: 'aside',
      },
    ] satisfies RichBlock[];

    const serializedRichBlocks = roundTripJson(richBlocks);

    expect(serializedRichBlocks).toEqual(richBlocks);
    expect(serializedRichBlocks).toHaveLength(9);
  });

  it('expresses reader and analysis projections for plain and rich sources', () => {
    const richProjection = {
      contentFormat: 'rich',
      richBlocks: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'Rich chapter body',
            },
          ],
        },
      ],
    } satisfies ReaderChapterRichContent;

    const plainProjection = {
      contentFormat: 'plain',
      plainText: 'Projected plain text',
    } satisfies AnalysisTextProjection;

    expect(roundTripJson(richProjection)).toEqual(richProjection);
    expect(roundTripJson(plainProjection)).toEqual(plainProjection);
  });

  it('represents pagination-friendly blocks for headings, nested paragraphs, images, and fallbacks', () => {
    const listContext = {
      ordered: true,
      itemIndex: 0,
      depth: 1,
    } satisfies PaginationListContext;

    const paginationBlocks = [
      {
        type: 'heading',
        sourceBlockType: 'heading',
        level: 3,
        children: [
          {
            type: 'text',
            text: 'Chapter title',
          },
        ],
      },
      {
        type: 'paragraph',
        sourceBlockType: 'list',
        container: 'list-item',
        listContext,
        children: [
          {
            type: 'text',
            text: 'List item paragraph',
          },
        ],
      },
      {
        type: 'paragraph',
        sourceBlockType: 'blockquote',
        container: 'blockquote',
        children: [
          {
            type: 'text',
            text: 'Quoted content',
            marks: ['italic'],
          },
        ],
      },
      {
        type: 'image',
        sourceBlockType: 'image',
        key: 'map',
        container: 'body',
        caption: [
          {
            type: 'text',
            text: 'World map',
          },
        ],
      },
      {
        type: 'hr',
        sourceBlockType: 'hr',
      },
      {
        type: 'unsupported',
        sourceBlockType: 'table',
        fallbackText: 'table fallback',
        originalTag: 'table',
      },
    ] satisfies PaginationBlock[];

    expect(roundTripJson(paginationBlocks)).toEqual(paginationBlocks);
    expect(paginationBlocks[1]).toMatchObject({
      container: 'list-item',
      listContext: { depth: 1, itemIndex: 0, ordered: true },
      sourceBlockType: 'list',
      type: 'paragraph',
    });
  });

  it('keeps the shared contracts barrel additive without changing the reader contracts barrel', () => {
    const existingReaderChapter = {
      index: 0,
      title: 'Reader chapter',
      content: 'Plain content',
      wordCount: 13,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    } satisfies ChapterContent;

    expect(existingReaderChapter.content).toBe('Plain content');
    expect(readerContracts).not.toHaveProperty('PaginationBlock');
    expect(readerContracts).not.toHaveProperty('RichBlock');
    expect(readerContracts).not.toHaveProperty('ReaderChapterRichContent');
  });
});
